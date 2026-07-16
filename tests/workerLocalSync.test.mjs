import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertInsideRoot,
  getPendingJobs,
  loadWorkerConfig,
  parseWorkerEnv,
  pollOnce,
  sanitizeFilename,
  sha256File,
} from "../worker/make3d-file-sync-worker.mjs";

test("local worker env parsing and path helpers fail closed", async () => {
  assert.deepEqual(
    parseWorkerEnv("SERVER_URL=https://example.test\nWORKER_TOKEN=abc\nWORKER_ID=wsl-01\nPOLL_INTERVAL=5\n"),
    {
      SERVER_URL: "https://example.test",
      WORKER_TOKEN: "abc",
      WORKER_ID: "wsl-01",
      POLL_INTERVAL: "5",
    },
  );
  assert.throws(() => parseWorkerEnv("WECHAT_PAY_API_V3_KEY=secret\n"), /disallowed env key/);
  await assert.rejects(
    () => loadWorkerConfig({ envPath: join(tmpdir(), "missing-make3d-worker.env") }),
    /SERVER_URL is required/,
  );
  assert.equal(sanitizeFilename("../..\\evil.stl"), "evil.stl");
  assert.throws(() => assertInsideRoot("/srv/make3d-worker", "/srv/make3d-worker/../evil"), /escapes/);

  const root = await mkdtemp(join(tmpdir(), "make3d-worker-hash-"));
  const filePath = join(root, "sample.stl");

  try {
    await writeFile(filePath, "abc");
    assert.equal(await sha256File(filePath), sha256Hex("abc"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local worker downloads pending job and reports verified", async () => {
  const content = Buffer.from("solid make3d test file\nendsolid\n");
  const root = await mkdtemp(join(tmpdir(), "make3d-worker-ok-"));
  const api = await createFakeWorkerApi({ content });

  try {
    const results = await pollOnce(createConfig(api.url, root));
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "verified");
    assert.equal(api.state.lockCount, 1);
    assert.equal(api.state.verified.length, 1);
    assert.equal(api.state.failed.length, 0);
    assert.equal(api.state.verified[0].local_sha256, sha256Hex(content));
    assert.equal(api.state.verified[0].file_size_bytes, content.length);

    const localPath = api.state.verified[0].local_path;
    assert.equal(await sha256File(localPath), sha256Hex(content));
    assert.equal((await stat(localPath)).size, content.length);

    const heartbeat = JSON.parse(await readFile(join(root, "logs", "heartbeat.json"), "utf8"));
    assert.equal(heartbeat.worker_id, "test-worker");
    assert.equal(heartbeat.version, "phase04-a");
    assert.equal(heartbeat.status, "processed");
    assert.equal(typeof heartbeat.hostname, "string");
    assert.equal("disk_free" in heartbeat, true);
  } finally {
    await api.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("local worker reports failed when downloaded file SHA mismatches", async () => {
  const content = Buffer.from("actual file");
  const root = await mkdtemp(join(tmpdir(), "make3d-worker-sha-fail-"));
  const api = await createFakeWorkerApi({
    content,
    sha256: sha256Hex("different expected file"),
  });

  try {
    const results = await pollOnce(createConfig(api.url, root));
    assert.equal(results.length, 1);
    assert.equal(results[0].status, "failed");
    assert.equal(results[0].reason, "sha256-mismatch");
    assert.equal(api.state.verified.length, 0);
    assert.equal(api.state.failed.length, 1);
    assert.match(api.state.failed[0].error, /sha256 mismatch/);
    const failedFiles = await readFileList(join(root, "failed"));
    assert.equal(failedFiles.some((name) => name.endsWith(".part")), true);
  } finally {
    await api.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("local worker rejects bad Worker token", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-worker-token-fail-"));
  const api = await createFakeWorkerApi({ content: Buffer.from("token test") });

  try {
    await assert.rejects(
      () => getPendingJobs(createConfig(api.url, root, { workerToken: "wrong-token" })),
      /authorization failed: 401/,
    );
  } finally {
    await api.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("local worker restart recovery reuses an existing verified file with same SHA", async () => {
  const content = Buffer.from("already synced");
  const root = await mkdtemp(join(tmpdir(), "make3d-worker-restart-"));
  const api = await createFakeWorkerApi({ content });
  const config = createConfig(api.url, root);
  const finalDir = join(root, "files", "M3DRESTART");
  const finalPath = join(finalDir, "101-model.stl");

  try {
    await mkdir(finalDir, { recursive: true });
    await mkdir(join(root, "incoming"), { recursive: true });
    await writeFile(finalPath, content);
    await writeFile(join(root, "incoming", "101-model.stl.part"), "stale partial");

    const results = await pollOnce(config);
    assert.equal(results[0].status, "verified");
    assert.equal(results[0].reused, true);
    assert.equal(api.state.verified.length, 1);
    assert.equal(await sha256File(finalPath), sha256Hex(content));
    const failedFiles = await readFileList(join(root, "failed"));
    assert.equal(failedFiles.some((name) => name.includes("model.stl.part")), true);
  } finally {
    await api.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function createFakeWorkerApi(options) {
  const token = options.token || "test-token";
  const content = Buffer.from(options.content || "fake model");
  const job = {
    job_id: 101,
    file_id: 101,
    order_id: 202,
    order_no: options.orderNo || "M3DRESTART",
    filename: options.filename || "model.stl",
    filesize: content.length,
    relative_path: options.relativePath || "model.stl",
    sha256: options.sha256 || sha256Hex(content),
  };
  const state = {
    lockCount: 0,
    verified: [],
    failed: [],
  };

  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const url = new URL(request.url || "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/api/worker/jobs/pending") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jobs: [job] }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/worker/jobs/101/lock") {
      state.lockCount += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ job }));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/worker/jobs/101/download") {
      response.writeHead(200, {
        "content-length": String(content.length),
        "content-type": "application/octet-stream",
      });
      response.end(content);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/worker/jobs/101/verified") {
      state.verified.push(JSON.parse(await readRequestBody(request)));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ success: true, status: "verified" }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/worker/jobs/101/failed") {
      state.failed.push(JSON.parse(await readRequestBody(request)));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ success: true, status: "failed" }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", resolvePromise);
  });

  const address = server.address();

  return {
    state,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()));
      }),
  };
}

function createConfig(serverUrl, rootDir, overrides = {}) {
  return {
    serverUrl,
    workerToken: overrides.workerToken || "test-token",
    workerId: "test-worker",
    pollIntervalMs: 10,
    rootDir,
  };
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function readFileList(dir) {
  try {
    return readdir(dir);
  } catch {
    return [];
  }
}
