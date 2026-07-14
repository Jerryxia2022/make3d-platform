import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  createOrderWithFile,
  getLocalFileSyncJobById,
  initDatabase,
} from "../src/backend/database.ts";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "../src/backend/adminAuth.ts";
import { createCustomerSessionToken } from "../src/backend/customerSessionCore.js";
import { GET as pendingGET } from "../src/app/api/worker/jobs/pending/route.ts";
import { POST as lockPOST } from "../src/app/api/worker/jobs/[id]/lock/route.ts";
import { GET as downloadGET } from "../src/app/api/worker/jobs/[id]/download/route.ts";
import { POST as verifiedPOST } from "../src/app/api/worker/jobs/[id]/verified/route.ts";

const TOKEN = "phase3-worker-token";
const WORKER_ID = "wsl-test-worker";

test("worker API rejects missing, wrong, customer, and admin credentials", async () => {
  await withWorkerFixture(async ({ url }) => {
    assert.equal((await pendingGET(new Request(url))).status, 401);
    assert.equal(
      (await pendingGET(workerRequest(url, { token: "wrong-token" }))).status,
      401,
    );

    const customerToken = createCustomerSessionToken(1);
    assert.equal(
      (
        await pendingGET(
          new Request(url, {
            headers: { cookie: `customer_session=${customerToken}` },
          }),
        )
      ).status,
      401,
    );

    process.env.SESSION_SECRET = "phase3-admin-session-secret";
    const adminCookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken()}`;
    assert.equal(
      (
        await pendingGET(
          new Request(url, {
            headers: { cookie: adminCookie },
          }),
        )
      ).status,
      401,
    );
  });
});

test("worker API locks jobs atomically and lets timed-out locks recover", async () => {
  await withWorkerFixture(async ({ dbPath, jobId, url }) => {
    const firstLock = await lockPOST(workerRequest(`${url}/${jobId}/lock`), params(jobId));
    assert.equal(firstLock.status, 200);

    const secondLock = await lockPOST(
      workerRequest(`${url}/${jobId}/lock`, { workerId: "another-worker" }),
      params(jobId),
    );
    assert.equal(secondLock.status, 409);

    const db = initDatabase(dbPath);
    db.prepare(
      "UPDATE local_file_sync_jobs SET locked_at = datetime('now', '-20 minutes'), worker_id = 'old-worker' WHERE id = ?",
    ).run(jobId);
    db.close();

    const recoveredLock = await lockPOST(
      workerRequest(`${url}/${jobId}/lock`, { workerId: "recovery-worker" }),
      params(jobId),
    );
    assert.equal(recoveredLock.status, 200);

    const verifyDb = initDatabase(dbPath);
    const job = getLocalFileSyncJobById(verifyDb, jobId);
    assert.equal(job.workerId, "recovery-worker");
    verifyDb.close();
  });
});

test("worker API blocks path traversal before download", async () => {
  await withWorkerFixture(async ({ dbPath, jobId, uploadDir, url }) => {
    const outsideFile = join(dirname(uploadDir), "outside.stl");
    await writeFile(outsideFile, "outside");

    const db = initDatabase(dbPath);
    db.prepare("UPDATE files SET filepath = ?, filename = ? WHERE id = 1").run(outsideFile, "outside.stl");
    db.prepare(
      "UPDATE local_file_sync_jobs SET stored_filename = ?, relative_path = ?, sync_status = 'pending', worker_id = NULL WHERE id = ?",
    ).run("outside.stl", "../outside.stl", jobId);
    db.close();

    assert.equal((await lockPOST(workerRequest(`${url}/${jobId}/lock`), params(jobId))).status, 200);
    const response = await downloadGET(workerRequest(`${url}/${jobId}/download`), params(jobId));
    assert.equal(response.status, 403);
  });
});

test("worker API marks SHA mismatches as failed", async () => {
  await withWorkerFixture(async ({ dbPath, jobId, url }) => {
    assert.equal((await lockPOST(workerRequest(`${url}/${jobId}/lock`), params(jobId))).status, 200);

    const response = await verifiedPOST(
      workerRequest(`${url}/${jobId}/verified`, {
        method: "POST",
        body: {
          local_path: "/srv/make3d-worker/files/model.stl",
          local_sha256: "0".repeat(64),
          file_size_bytes: 11,
        },
      }),
      params(jobId),
    );
    assert.equal(response.status, 400);

    const db = initDatabase(dbPath);
    const job = getLocalFileSyncJobById(db, jobId);
    assert.equal(job.syncStatus, "failed");
    assert.match(job.lastError || "", /verification mismatch/);
    db.close();
  });
});

test("worker API returns 404 when the source file is missing", async () => {
  await withWorkerFixture(async ({ filePath, jobId, url }) => {
    assert.equal((await lockPOST(workerRequest(`${url}/${jobId}/lock`), params(jobId))).status, 200);
    await unlink(filePath);

    const response = await downloadGET(workerRequest(`${url}/${jobId}/download`), params(jobId));
    assert.equal(response.status, 404);
  });
});

test("worker API lists pending jobs, downloads files, and accepts verified hashes", async () => {
  await withWorkerFixture(async ({ dbPath, fileContent, jobId, url }) => {
    const pending = await pendingGET(workerRequest(url));
    assert.equal(pending.status, 200);
    const pendingBody = await pending.json();
    assert.equal(pendingBody.jobs.length, 1);
    assert.equal(pendingBody.jobs[0].job_id, jobId);
    assert.equal(pendingBody.jobs[0].sha256, sha256(fileContent));

    assert.equal((await lockPOST(workerRequest(`${url}/${jobId}/lock`), params(jobId))).status, 200);

    const download = await downloadGET(workerRequest(`${url}/${jobId}/download`), params(jobId));
    assert.equal(download.status, 200);
    assert.equal(await download.text(), fileContent);

    const verified = await verifiedPOST(
      workerRequest(`${url}/${jobId}/verified`, {
        method: "POST",
        body: {
          local_path: "/srv/make3d-worker/files/model.stl",
          local_sha256: sha256(fileContent),
          file_size_bytes: fileContent.length,
        },
      }),
      params(jobId),
    );
    assert.equal(verified.status, 200);

    const db = initDatabase(dbPath);
    const job = getLocalFileSyncJobById(db, jobId);
    assert.equal(job.syncStatus, "verified");
    assert.equal(job.localSha256, sha256(fileContent));
    db.close();
  });
});

async function withWorkerFixture(run) {
  const root = await mkdtemp(join(tmpdir(), "make3d-worker-api-"));
  const dbPath = join(root, "make3d.db");
  const uploadDir = join(root, "uploads");
  const fileContent = "solid model";
  const filePath = join(uploadDir, "model.stl");
  const previousEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    UPLOAD_DIR: process.env.UPLOAD_DIR,
    MAKE3D_WORKER_TOKEN: process.env.MAKE3D_WORKER_TOKEN,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };

  process.env.DATABASE_URL = `file:${dbPath}`;
  process.env.UPLOAD_DIR = uploadDir;
  process.env.MAKE3D_WORKER_TOKEN = TOKEN;
  process.env.SESSION_SECRET = "phase3-session-secret";

  try {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(filePath, fileContent);

    let db = initDatabase(dbPath);
    createOrderWithFile(db, {
      customerId: null,
      customerName: "Worker Test",
      phone: "13900000000",
      wechat: "worker-test",
      material: "PLA",
      color: "black",
      quantity: 1,
      estimatedPrice: 9.9,
      file: {
        filename: "model.stl",
        filepath: filePath,
        filesize: fileContent.length,
      },
    });
    db.close();

    db = initDatabase(dbPath);
    const jobId = db
      .prepare("SELECT id FROM local_file_sync_jobs WHERE file_id = 1")
      .get().id;
    db.close();

    await run({
      dbPath,
      fileContent,
      filePath,
      jobId,
      root,
      uploadDir,
      url: "https://make3d.test/api/worker/jobs/pending",
    });
  } finally {
    restoreEnv(previousEnv);
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function workerRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("authorization", `Bearer ${options.token || TOKEN}`);
  headers.set("x-make3d-worker-id", options.workerId || WORKER_ID);

  let body;
  if (options.body) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }

  return new Request(url, {
    method: options.method || "GET",
    headers,
    body,
  });
}

function params(jobId) {
  return { params: Promise.resolve({ id: String(jobId) }) };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function restoreEnv(previousEnv) {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
