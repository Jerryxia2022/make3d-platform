import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import {
  assertResumeArtifactPath,
  assertLeaseOwnership,
  computeLeaseTtlMs,
  createLeaseController,
  resolveArtifactPaths,
  runOnce,
  runPrusaSlicer,
  terminateProcessGroup,
} from "../worker/make3d-slicing-worker.mjs";
import {
  isSafeArtifactPath,
  validateSlicedArtifactPaths,
} from "../src/backend/workerSlicingApi.ts";

const LOCK_OWNER = "123e4567-e89b-42d3-a456-426614174000";
const SHA_A = "a".repeat(64);

test("attempt 1 and attempt 2 use isolated processing and result paths", () => {
  const root = "/srv/make3d-worker/test-integration/phase05-h-c";
  const first = resolveArtifactPaths(root, 5, 1);
  const second = resolveArtifactPaths(root, 5, 2);
  assert.equal(first.apiPaths.gcode, "results/prusaslicer/5/attempt-1/output.gcode");
  assert.equal(second.apiPaths.gcode, "results/prusaslicer/5/attempt-2/output.gcode");
  assert.notEqual(first.gcodePath, second.gcodePath);
  assert.notEqual(first.processingGcodePartPath, second.processingGcodePartPath);
});

test("attempt artifact paths reject invalid job and attempt numbers", () => {
  const root = "/srv/make3d-worker/test-integration/phase05-h-c";
  assert.throws(() => resolveArtifactPaths(root, 0, 1), /job_id/);
  assert.throws(() => resolveArtifactPaths(root, 1, 0), /attempt_no/);
  assert.throws(() => resolveArtifactPaths(root, 1, -1), /attempt_no/);
});

test("attempt artifact paths never include lock owner or token material", () => {
  const paths = resolveArtifactPaths("/srv/make3d-worker/test-integration/phase05-h-c", 3, 4);
  const allPaths = JSON.stringify(paths);
  assert.doesNotMatch(allPaths, /123e4567|Bearer|token|secret/i);
});

test("/sliced path contract rejects old format, other attempts, and accepts current attempt", () => {
  const payload = (attemptNo) => ({
    gcode_relative_path: `results/prusaslicer/9/attempt-${attemptNo}/output.gcode`,
    stdout_relative_path: `results/prusaslicer/9/attempt-${attemptNo}/stdout.log`,
    stderr_relative_path: `results/prusaslicer/9/attempt-${attemptNo}/stderr.log`,
  });
  assert.doesNotThrow(() => validateSlicedArtifactPaths(9, 2, payload(2)));
  assert.throws(() => validateSlicedArtifactPaths(9, 2, payload(1)), /attempt-2/);
  assert.throws(
    () =>
      validateSlicedArtifactPaths(9, 2, {
        gcode_relative_path: "results/prusaslicer/9/output.gcode",
        stdout_relative_path: "results/prusaslicer/9/stdout.log",
        stderr_relative_path: "results/prusaslicer/9/stderr.log",
      }),
    /attempt-2/,
  );
});

test("/sliced path contract rejects stale attempt when current attempt is newer", () => {
  assert.throws(
    () =>
      validateSlicedArtifactPaths(10, 3, {
        gcode_relative_path: "results/prusaslicer/10/attempt-2/output.gcode",
        stdout_relative_path: "results/prusaslicer/10/attempt-2/stdout.log",
        stderr_relative_path: "results/prusaslicer/10/attempt-2/stderr.log",
      }),
    /attempt-3/,
  );
});

test("artifact paths reject traversal, absolute paths, backslashes, encoded traversal, and part files", () => {
  assert.equal(isSafeArtifactPath("results/prusaslicer/1/attempt-1/output.gcode"), true);
  for (const value of [
    "/srv/make3d-worker/results/prusaslicer/1/attempt-1/output.gcode",
    "results\\prusaslicer\\1\\attempt-1\\output.gcode",
    "results/prusaslicer/1/%2e%2e/output.gcode",
    "results/prusaslicer/1/attempt-1/output.gcode.part",
    "processing/prusaslicer/1/attempt-1/output.gcode",
    "failed/prusaslicer/1/attempt-1/output.gcode",
    "results/prusaslicer/2/attempt-1/output.gcode\0",
  ]) {
    assert.equal(isSafeArtifactPath(value), false, value);
  }
});

test("/sliced path contract rejects encoded traversal and null bytes explicitly", () => {
  for (const bad of ["results/prusaslicer/1/%2e%2e/attempt-1/output.gcode", "results/prusaslicer/1/attempt-1/output.gcode\0"]) {
    assert.equal(isSafeArtifactPath(bad), false);
  }
});

test("resume accepts same-job historical attempt path and rejects other jobs or old format", () => {
  assert.equal(assertResumeArtifactPath(7, "results/prusaslicer/7/attempt-1/output.gcode"), "results/prusaslicer/7/attempt-1/output.gcode");
  assert.throws(() => assertResumeArtifactPath(7, "results/prusaslicer/8/attempt-1/output.gcode"), /attempt scoped/);
  assert.throws(() => assertResumeArtifactPath(7, "results/prusaslicer/7/output.gcode"), /attempt scoped/);
});

test("PrusaSlicer publishes .part files atomically into attempt result directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-attempt-publish-"));
  try {
    const profilePath = join(root, "profile.ini");
    const inputPath = join(root, "input.stl");
    await writeFile(profilePath, "profile");
    await writeFile(inputPath, "solid cube\nendsolid cube\n");
    const config = {
      rootDir: root,
      prusaSlicerBin: "/usr/bin/prusa-slicer",
      spawnImpl: (command, args, options) => {
        assert.equal(options.shell, false);
        assert.equal(options.detached, true);
        const outputPath = args[args.indexOf("--output") + 1];
        const child = new EventEmitter();
        child.pid = 123456;
        child.stdout = PassThrough.from(["stdout"]);
        child.stderr = PassThrough.from(["stderr"]);
        writeFile(outputPath, completeGcode()).then(() => setImmediate(() => child.emit("close", 0)));
        return child;
      },
    };
    const result = await runPrusaSlicer(
      config,
      { job: { job_id: 12, slice_params: baseSliceParams() }, lock: { attempt_no: 3 } },
      { path: inputPath },
      { path: profilePath },
      "2.7.2+dfsg-1build2",
    );
    assert.ok(result.args.includes(join(root, "processing", "prusaslicer", "12", "attempt-3", "output.gcode.part")));
    assert.equal(result.apiPaths.gcode, "results/prusaslicer/12/attempt-3/output.gcode");
    assert.equal((await readFile(result.gcodePath, "utf8")), completeGcode());
    await assert.rejects(() => stat(join(root, "processing", "prusaslicer", "12", "attempt-3", "output.gcode.part")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PrusaSlicer does not publish empty G-code output", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-empty-output-"));
  try {
    const profilePath = join(root, "profile.ini");
    const inputPath = join(root, "input.stl");
    await writeFile(profilePath, "profile");
    await writeFile(inputPath, "solid cube\nendsolid cube\n");
    await assert.rejects(
      () =>
        runPrusaSlicer(
          {
            rootDir: root,
            prusaSlicerBin: "/usr/bin/prusa-slicer",
            spawnImpl: (_command, args) => {
              const outputPath = args[args.indexOf("--output") + 1];
              const child = new EventEmitter();
              child.pid = 123457;
              child.stdout = PassThrough.from([""]);
              child.stderr = PassThrough.from([""]);
              writeFile(outputPath, "").then(() => setImmediate(() => child.emit("close", 0)));
              return child;
            },
          },
          { job: { job_id: 13, slice_params: baseSliceParams() }, lock: { attempt_no: 1 } },
          { path: inputPath },
          { path: profilePath },
          "2.7.2+dfsg-1build2",
        ),
      /empty/,
    );
    await assert.rejects(() => stat(join(root, "results", "prusaslicer", "13", "attempt-1", "output.gcode")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lease TTL uses server delta and is independent of local epoch clock skew", () => {
  assert.equal(computeLeaseTtlMs({ lease_renewed_at_ms: 1784104561141, lease_expires_at_ms: 1784104681141 }), 120000);
  const fastClock = { value: 0, now() { return this.value; } };
  const controller = createLeaseController(
    {},
    { job: { job_id: 1 }, lock: { lease_renewed_at_ms: 1784104561141, lease_expires_at_ms: 1784104681141 } },
    fastClock,
  );
  assert.equal(controller.localDeadlineMs, 118000);
  fastClock.value = 117999;
  assert.equal(controller.ownershipLost, false);
  controller.handleLeaseError(new Error("temporary network"));
  assert.equal(controller.ownershipLost, false);
  fastClock.value = 118000;
  controller.handleLeaseError(new Error("temporary network"));
  assert.equal(controller.ownershipLost, true);
});

test("lease TTL rejects zero, negative, and unreasonable server values", () => {
  assert.throws(() => computeLeaseTtlMs({ lease_renewed_at_ms: 1, lease_expires_at_ms: 1 }), /invalid/);
  assert.throws(() => computeLeaseTtlMs({ lease_renewed_at_ms: 2, lease_expires_at_ms: 1 }), /invalid/);
  assert.throws(() => computeLeaseTtlMs({ lease_renewed_at_ms: 0, lease_expires_at_ms: 60 * 60 * 1000 }), /invalid/);
});

test("lease 409, 404, 401, and 403 mark ownership lost", () => {
  for (const status of [409, 404, 401, 403]) {
    const controller = createLeaseController(
      {},
      { job: { job_id: 1 }, lock: { lease_renewed_at_ms: 10, lease_expires_at_ms: 120010 } },
      { now: () => 0 },
    );
    controller.handleLeaseError({ status });
    assert.equal(controller.ownershipLost, true, String(status));
  }
});

test("temporary lease errors before monotonic deadline do not mark ownership lost", () => {
  const controller = createLeaseController(
    {},
    { job: { job_id: 1 }, lock: { lease_renewed_at_ms: 10, lease_expires_at_ms: 120010 } },
    { now: () => 1000 },
  );
  controller.handleLeaseError(new Error("ECONNRESET"));
  assert.equal(controller.ownershipLost, false);
});

test("lease loss is detected before publishing or reporting", () => {
  const controller = {
    ownershipLost: false,
    localDeadlineMs: 10,
    now: () => 10,
  };
  assert.throws(() => assertLeaseOwnership(controller), /ownership lost/);
  assert.equal(controller.ownershipLost, true);
});

test("lease loss terminates slicer process group", async () => {
  const killed = [];
  const originalKill = process.kill;
  process.kill = (pid, signal) => {
    killed.push({ pid, signal });
    return true;
  };
  try {
    terminateProcessGroup({ pid: 234567, exitCode: null, killed: false, kill: (signal) => killed.push({ pid: 234567, signal, direct: true }) });
    if (process.platform === "win32") {
      assert.ok(killed.some((entry) => entry.pid === 234567 && entry.signal === "SIGTERM" && entry.direct));
    } else {
      assert.ok(killed.some((entry) => entry.pid === -234567 && entry.signal === "SIGTERM"));
    }
  } finally {
    process.kill = originalKill;
  }
});

test("Worker heartbeat continues through parsing and result after PrusaSlicer is skipped by resume", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-heartbeat-"));
  const requests = [];
  try {
    await mkdir(join(root, "files"), { recursive: true });
    await mkdir(join(root, "profiles"), { recursive: true });
    await mkdir(join(root, "results", "prusaslicer", "31", "attempt-1"), { recursive: true });
    const input = "solid cube\nendsolid cube\n";
    const profile = "profile";
    const gcode = completeGcode();
    await writeFile(join(root, "files", "31-synthetic-cube.stl"), input);
    const profilePath = join(root, "profiles", "bambu-p1s.ini");
    const gcodePath = join(root, "results", "prusaslicer", "31", "attempt-1", "output.gcode");
    await writeFile(profilePath, profile);
    await writeFile(gcodePath, gcode);
    const config = mockConfig([
      { jobs: [pendingJob({ jobId: 31, inputSha: sha(input), profileSha: sha(profile), resumeFrom: "parsing" })] },
      {
        job_id: 31,
        attempt_no: 2,
        lock_owner: LOCK_OWNER,
        lease_renewed_at_ms: 1000,
        lease_expires_at_ms: 121000,
        resume_from: "parsing",
        gcode_relative_path: "results/prusaslicer/31/attempt-1/output.gcode",
        gcode_size_bytes: Buffer.byteLength(gcode),
        gcode_sha256: sha(gcode),
      },
      { job_id: 31, status: "parsing" },
      { job_id: 31, status: "partial", parser_quote_ready: false },
    ], requests);
    config.rootDir = root;
    config.leaseIntervalMs = 1;
    config.profileWhitelist = { "bambu-p1s": { path: profilePath } };
    config.execFileImpl = (_command, _args, _options, callback) => callback(null, "2.7.2+dfsg-1build2", "");
    const result = await runOnce(config);
    assert.equal(result.status, "partial");
    assert.equal(result.prusaSlicerRan, false);
    assert.ok(requests.filter((request) => request.url.pathname.endsWith("/lease")).length >= 1);
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/sliced")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Worker heartbeat continues until failed terminal response on resume artifact failure", async () => {
  const requests = [];
  const root = await mkdtemp(join(tmpdir(), "make3d-heartbeat-failed-"));
  try {
    await mkdir(join(root, "files"), { recursive: true });
    await mkdir(join(root, "profiles"), { recursive: true });
    const input = "solid cube\nendsolid cube\n";
    const profile = "profile";
    await writeFile(join(root, "files", "41-synthetic-cube.stl"), input);
    const profilePath = join(root, "profiles", "bambu-p1s.ini");
    await writeFile(profilePath, profile);
    const config = mockConfig([
      { jobs: [pendingJob({ jobId: 41, inputSha: sha(input), profileSha: sha(profile), resumeFrom: "sliced" })] },
      {
        job_id: 41,
        attempt_no: 2,
        lock_owner: LOCK_OWNER,
        lease_renewed_at_ms: 1000,
        lease_expires_at_ms: 121000,
        resume_from: "sliced",
        gcode_relative_path: "results/prusaslicer/41/attempt-1/output.gcode",
        gcode_size_bytes: 10,
        gcode_sha256: sha("missing"),
      },
      { job_id: 41, status: "failed" },
    ], requests);
    config.rootDir = root;
    config.leaseIntervalMs = 1;
    config.profileWhitelist = { "bambu-p1s": { path: profilePath } };
    config.execFileImpl = (_command, _args, _options, callback) => callback(null, "2.7.2+dfsg-1build2", "");
    const result = await runOnce(config);
    assert.equal(result.status, "failed");
    assert.ok(requests.some((request) => request.url.pathname.endsWith("/failed")));
    assert.ok(requests.filter((request) => request.url.pathname.endsWith("/lease")).length >= 1);
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/result")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function mockConfig(payloads, requests = []) {
  const queue = [...payloads];
  return {
    serverUrl: "http://127.0.0.1:3100/",
    workerToken: "test-token",
    workerId: "wsl-worker-01",
    rootDir: "/srv/make3d-worker/test-integration/phase05-h-c",
    prusaSlicerBin: "/usr/bin/prusa-slicer",
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: new URL(String(url)), init });
      if (requests.at(-1).url.pathname.endsWith("/lease")) {
        return new Response(JSON.stringify({ job_id: 1, lease_renewed_at_ms: 2000, lease_expires_at_ms: 122000 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const payload = queue.shift() ?? {};
      return new Response(JSON.stringify(payload), { status: payload.statusCode || 200, headers: { "Content-Type": "application/json" } });
    },
  };
}

function pendingJob({ jobId, inputSha, profileSha, resumeFrom }) {
  return {
    job_id: jobId,
    file_id: jobId,
    file_sync_job_id: jobId,
    input_worker_id: "wsl-worker-01",
    input_sha256: inputSha,
    profile_key: "bambu-p1s",
    profile_version: "phase05-b",
    profile_sha256: profileSha,
    slice_params: baseSliceParams(),
    slice_params_sha256: SHA_A,
    slice_cache_key_sha256: SHA_A,
    required_slicer_package_version: "2.7.2+dfsg-1build2",
    required_parser_version: "phase05-c-parser-v1",
    resume_from: resumeFrom,
  };
}

function baseSliceParams() {
  return {
    material: "PLA",
    printer_model: "Bambu Lab P1S",
    nozzle_diameter_microns: 400,
    layer_height_microns: 200,
    fill_density_percent: 50,
    support_mode: "none",
    brim_width_microns: 0,
  };
}

function completeGcode() {
  return [
    "; generated by PrusaSlicer 2.7.2 on 2026-07-14",
    "G90",
    ";LAYER_CHANGE",
    ";Z:0.20",
    "G1 Z0.20",
    "; filament used [mm] = 2116.64",
    "; filament used [cm3] = 5.09",
    "; total filament used [g] = 0.00",
    "; estimated printing time (normal mode) = 24m 56s",
    "; estimated printing time (silent mode) = 25m 44s",
    "; filament_type = PLA",
    "; printer_model = Bambu Lab P1S",
    "; nozzle_diameter = 0.4",
    "; layer_height = 0.2",
    "; prusaslicer_config = end",
    "",
  ].join("\n");
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}
