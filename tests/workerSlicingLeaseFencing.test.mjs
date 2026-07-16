import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";

import {
  LEASE_SAFETY_MARGIN_MS,
  assertAtomicPublishFilesystem,
  assertLeaseOwnership,
  cleanupActiveWorkerResources,
  computeLeaseSafetyMarginMs,
  computeLeaseTtlMs,
  createLeaseController,
  getActiveSlicerChildCountForTest,
  runOnce,
  runPrusaSlicer,
  terminateProcessGroup,
  trackSlicerChildForCleanup,
} from "../worker/make3d-slicing-worker.mjs";

const LOCK_OWNER = "123e4567-e89b-42d3-a456-426614174000";
const SHA_A = "a".repeat(64);

test("Lock deadline uses request start monotonic time and safety margin", () => {
  const clock = fakeClock(6000);
  const controller = createLeaseController(
    {},
    {
      job: { job_id: 1 },
      lock: {
        request_started_monotonic_ms: 1000,
        lease_renewed_at_ms: 10,
        lease_expires_at_ms: 120010,
      },
    },
    clock,
  );

  assert.equal(controller.lastLeaseTtlMs, 120000);
  assert.equal(controller.localDeadlineMs, 1000 + 120000 - LEASE_SAFETY_MARGIN_MS);
  assert.notEqual(controller.localDeadlineMs, 6000 + 120000);
});

test("Lease deadline uses request start monotonic time", () => {
  const clock = fakeClock(6000);
  const controller = createLeaseController(
    {},
    { job: { job_id: 1 }, lock: { request_started_monotonic_ms: 0, lease_renewed_at_ms: 1, lease_expires_at_ms: 120001 } },
    clock,
  );

  controller.updateFromServer({ lease_renewed_at_ms: 20, lease_expires_at_ms: 120020 }, 1000);
  assert.equal(controller.localDeadlineMs, 1000 + 120000 - LEASE_SAFETY_MARGIN_MS);
  assert.notEqual(controller.localDeadlineMs, 6000 + 120000);
});

test("network RTT is naturally deducted from remaining local lease", () => {
  for (const delayMs of [1000, 5000, 30000]) {
    const requestStarted = 1000;
    const clock = fakeClock(requestStarted + delayMs);
    const controller = createLeaseController(
      {},
      { job: { job_id: 1 }, lock: { request_started_monotonic_ms: requestStarted, lease_renewed_at_ms: 1, lease_expires_at_ms: 120001 } },
      clock,
    );
    const remainingAfterResponse = controller.localDeadlineMs - clock.now();
    assert.equal(remainingAfterResponse, 120000 - LEASE_SAFETY_MARGIN_MS - delayMs);
  }
});

test("safety margin is positive and smaller than the server TTL", () => {
  assert.equal(computeLeaseSafetyMarginMs(120000), LEASE_SAFETY_MARGIN_MS);
  assert.throws(() => computeLeaseSafetyMarginMs(1000), /safety margin/);
  assert.throws(() => computeLeaseTtlMs({ lease_renewed_at_ms: 1, lease_expires_at_ms: 1 }), /invalid/);
});

test("local Date.now ten minutes fast does not affect lease ownership", () => {
  const originalNow = Date.now;
  Date.now = () => originalNow() + 10 * 60 * 1000;
  try {
    const controller = createLeaseController(
      {},
      { job: { job_id: 1 }, lock: { request_started_monotonic_ms: 0, lease_renewed_at_ms: 1, lease_expires_at_ms: 120001 } },
      fakeClock(117999),
    );
    assert.doesNotThrow(() => assertLeaseOwnership(controller));
  } finally {
    Date.now = originalNow;
  }
});

test("local Date.now ten minutes slow does not affect lease ownership", () => {
  const originalNow = Date.now;
  Date.now = () => originalNow() - 10 * 60 * 1000;
  try {
    const controller = createLeaseController(
      {},
      { job: { job_id: 1 }, lock: { request_started_monotonic_ms: 0, lease_renewed_at_ms: 1, lease_expires_at_ms: 120001 } },
      fakeClock(117999),
    );
    assert.doesNotThrow(() => assertLeaseOwnership(controller));
  } finally {
    Date.now = originalNow;
  }
});

test("lease loss sets ownership_lost", () => {
  const controller = createLeaseController(
    {},
    { job: { job_id: 1 }, lock: { request_started_monotonic_ms: 0, lease_renewed_at_ms: 1, lease_expires_at_ms: 120001 } },
    fakeClock(1000),
  );
  controller.handleLeaseError({ status: 409, code: "LEASE_EXPIRED" });
  assert.equal(controller.ownershipLost, true);
});

test("ownership loss prevents sliced, parsing, result, and failed reports", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-lease-lost-report-"));
  const requests = [];
  try {
    const input = "solid cube\nendsolid cube\n";
    const profile = "profile";
    await mkdir(join(root, "files"), { recursive: true });
    await mkdir(join(root, "profiles"), { recursive: true });
    await writeFile(join(root, "files", "51-synthetic-cube.stl"), input);
    const profilePath = join(root, "profiles", "bambu-p1s.ini");
    await writeFile(profilePath, profile);

    const config = mockConfig(requests, {
      rootDir: root,
      leaseIntervalMs: 1,
      profilePath,
      inputSha: sha(input),
      profileSha: sha(profile),
      leaseResponseStatus: 409,
      spawnDelayMs: 50,
    });
    const result = await runOnce(config);
    assert.equal(result.status, "ownership-lost");
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/sliced")), false);
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/parsing")), false);
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/result")), false);
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/failed")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ownership loss after slicer exit does not publish formal G-code", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-no-publish-lost-"));
  try {
    const profilePath = join(root, "profile.ini");
    const inputPath = join(root, "input.stl");
    await writeFile(profilePath, "profile");
    await writeFile(inputPath, "solid cube\nendsolid cube\n");
    const controller = {
      ownershipLost: false,
      localDeadlineMs: 10,
      now: () => 11,
    };

    await assert.rejects(
      () =>
        runPrusaSlicer(
          {
            rootDir: root,
            prusaSlicerBin: "/usr/bin/prusa-slicer",
            spawnImpl: (_command, args) => {
              const child = new EventEmitter();
              child.pid = 234111;
              child.stdout = PassThrough.from(["stdout"]);
              child.stderr = PassThrough.from(["stderr"]);
              const outputPath = args[args.indexOf("--output") + 1];
              writeFile(outputPath, completeGcode()).then(() => setImmediate(() => child.emit("close", 0)));
              return child;
            },
          },
          { job: { job_id: 19, slice_params: baseSliceParams() }, lock: { attempt_no: 1 } },
          { path: inputPath },
          { path: profilePath },
          "2.7.2+dfsg-1build2",
          controller,
        ),
      /ownership lost/,
    );
    await assert.rejects(() => stat(join(root, "results", "prusaslicer", "19", "attempt-1", "output.gcode")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lease loss terminates parent process group", () => {
  const direct = [];
  const killed = withPatchedKill(() => {
    terminateProcessGroup({ pid: 345001, exitCode: null, killed: false, kill: (signal) => direct.push({ pid: 345001, signal }) });
  });
  const entries = [...killed, ...direct];
  assert.ok(entries.some((entry) => entry.pid === (process.platform === "win32" ? 345001 : -345001) && entry.signal === "SIGTERM"));
});

test("lease loss terminates child processes through process group", () => {
  const direct = [];
  const killed = withPatchedKill(() => {
    terminateProcessGroup({ pid: 345002, exitCode: null, killed: false, kill: (signal) => direct.push({ pid: 345002, signal }) });
  });
  if (process.platform !== "win32") {
    assert.ok(killed.some((entry) => entry.pid === -345002 && entry.signal === "SIGTERM"));
  } else {
    assert.ok(direct.some((entry) => entry.pid === 345002 && entry.signal === "SIGTERM"));
  }
});

test("SIGTERM cleanup path terminates active slicer process group", async () => {
  trackSlicerChildForCleanup({
    pid: 345003,
    exitCode: null,
    killed: false,
    kill: () => {},
  });
  assert.equal(getActiveSlicerChildCountForTest(), 1);
  const cleanup = cleanupActiveWorkerResources();
  assert.equal(cleanup[0]?.sentSigterm, true);
});

test("SIGINT cleanup path terminates active slicer process group", async () => {
  trackSlicerChildForCleanup({
    pid: 345004,
    exitCode: null,
    killed: false,
    kill: () => {},
  });
  assert.equal(getActiveSlicerChildCountForTest(), 1);
  const cleanup = cleanupActiveWorkerResources();
  assert.equal(cleanup[0]?.sentSigterm, true);
});

test("heartbeat continues after slicer exits during parser delay", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-parser-delay-"));
  const requests = [];
  try {
    const input = "solid cube\nendsolid cube\n";
    const profile = "profile";
    await mkdir(join(root, "files"), { recursive: true });
    await mkdir(join(root, "profiles"), { recursive: true });
    await writeFile(join(root, "files", "61-synthetic-cube.stl"), input);
    const profilePath = join(root, "profiles", "bambu-p1s.ini");
    await writeFile(profilePath, profile);

    const config = mockConfig(requests, {
      rootDir: root,
      leaseIntervalMs: 5,
      parserDelayMs: 30,
      profilePath,
      inputSha: sha(input),
      profileSha: sha(profile),
      jobId: 61,
      spawnDelayMs: 1,
    });
    const result = await runOnce(config);
    assert.equal(result.status, "partial", result.error);
    assert.ok(requests.filter((request) => request.url.pathname.endsWith("/lease")).length >= 2);
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/result")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("long parser delay renews lease", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-long-parser-delay-"));
  const requests = [];
  try {
    const input = "solid cube\nendsolid cube\n";
    const profile = "profile";
    await mkdir(join(root, "files"), { recursive: true });
    await mkdir(join(root, "profiles"), { recursive: true });
    await mkdir(join(root, "results", "prusaslicer", "71", "attempt-1"), { recursive: true });
    await writeFile(join(root, "files", "71-synthetic-cube.stl"), input);
    const profilePath = join(root, "profiles", "bambu-p1s.ini");
    const gcodePath = join(root, "results", "prusaslicer", "71", "attempt-1", "output.gcode");
    await writeFile(profilePath, profile);
    await writeFile(gcodePath, completeGcode());
    const config = mockConfig(requests, {
      rootDir: root,
      leaseIntervalMs: 5,
      parserDelayMs: 30,
      profilePath,
      inputSha: sha(input),
      profileSha: sha(profile),
      jobId: 71,
      resumeFrom: "parsing",
      gcodeSha: sha(completeGcode()),
      gcodeSize: Buffer.byteLength(completeGcode()),
    });

    const result = await runOnce(config);
    assert.equal(result.status, "partial");
    assert.equal(result.prusaSlicerRan, false);
    assert.ok(requests.filter((request) => request.url.pathname.endsWith("/lease")).length >= 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resume parsing starts lease heartbeat immediately after lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-resume-parser-delay-"));
  const requests = [];
  try {
    const input = "solid cube\nendsolid cube\n";
    const profile = "profile";
    await mkdir(join(root, "files"), { recursive: true });
    await mkdir(join(root, "profiles"), { recursive: true });
    await mkdir(join(root, "results", "prusaslicer", "81", "attempt-1"), { recursive: true });
    await writeFile(join(root, "files", "81-synthetic-cube.stl"), input);
    const profilePath = join(root, "profiles", "bambu-p1s.ini");
    await writeFile(profilePath, profile);
    await writeFile(join(root, "results", "prusaslicer", "81", "attempt-1", "output.gcode"), completeGcode());

    const config = mockConfig(requests, {
      rootDir: root,
      leaseIntervalMs: 5,
      parserDelayMs: 30,
      profilePath,
      inputSha: sha(input),
      profileSha: sha(profile),
      jobId: 81,
      resumeFrom: "parsing",
      gcodeSha: sha(completeGcode()),
      gcodeSize: Buffer.byteLength(completeGcode()),
    });
    const result = await runOnce(config);
    assert.equal(result.status, "partial");
    assert.equal(result.prusaSlicerRan, false);
    const lockIndex = requests.findIndex((request) => request.url.pathname.endsWith("/lock"));
    const leaseIndex = requests.findIndex((request) => request.url.pathname.endsWith("/lease"));
    assert.ok(lockIndex >= 0 && leaseIndex > lockIndex);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("same filesystem processing/results check allows matching dev", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-same-dev-"));
  try {
    await mkdir(join(root, "processing"));
    await mkdir(join(root, "results"));
    const result = await assertAtomicPublishFilesystem(root, async () => ({ dev: 99 }));
    assert.deepEqual(result, { processingDev: 99, resultsDev: 99 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("different filesystem processing/results check rejects publish", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-different-dev-"));
  try {
    await mkdir(join(root, "processing"));
    await mkdir(join(root, "results"));
    await assert.rejects(
      () =>
        assertAtomicPublishFilesystem(root, async (path) => ({
          dev: String(path).endsWith("processing") ? 1 : 2,
        })),
      /different filesystems/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function mockConfig(requests, options) {
  const jobId = options.jobId || 51;
  const inputSha = options.inputSha || SHA_A;
  const profileSha = options.profileSha || SHA_A;
  const gcode = completeGcode();
  const gcodeSha = options.gcodeSha || sha(gcode);
  const gcodeSize = options.gcodeSize || Buffer.byteLength(gcode);
  const statePayloads = options.resumeFrom
    ? [
        { job_id: jobId, status: "parsing" },
        { job_id: jobId, status: "partial", parser_quote_ready: false },
      ]
    : [
        { job_id: jobId, status: "slicing" },
        { job_id: jobId, status: "sliced" },
        { job_id: jobId, status: "parsing" },
        { job_id: jobId, status: "partial", parser_quote_ready: false },
      ];
  const payloads = [
    { jobs: [pendingJob({ jobId, inputSha, profileSha, resumeFrom: options.resumeFrom })] },
    {
      job_id: jobId,
      attempt_no: options.resumeFrom ? 2 : 1,
      lock_owner: LOCK_OWNER,
      request_started_monotonic_ms: 0,
      lease_renewed_at_ms: 1000,
      lease_expires_at_ms: 121000,
      resume_from: options.resumeFrom || null,
      gcode_relative_path: options.resumeFrom ? `results/prusaslicer/${jobId}/attempt-1/output.gcode` : null,
      gcode_size_bytes: options.resumeFrom ? gcodeSize : null,
      gcode_sha256: options.resumeFrom ? gcodeSha : null,
    },
    ...statePayloads,
  ];
  return {
    serverUrl: "http://127.0.0.1:3100/",
    workerToken: "test-token",
    workerId: "wsl-worker-01",
    rootDir: options.rootDir,
    prusaSlicerBin: "/usr/bin/prusa-slicer",
    leaseIntervalMs: options.leaseIntervalMs,
    parserDelayMs: options.parserDelayMs || 0,
    profileWhitelist: { "bambu-p1s": { path: options.profilePath } },
    execFileImpl: (_command, _args, _options, callback) => callback(null, "2.7.2+dfsg-1build2", ""),
    spawnImpl: (_command, args) => {
      const child = new EventEmitter();
      child.pid = 543210;
      child.stdout = PassThrough.from(["stdout"]);
      child.stderr = PassThrough.from(["stderr"]);
      const outputPath = args[args.indexOf("--output") + 1];
      setTimeout(() => {
        writeFile(outputPath, gcode).then(() => child.emit("close", 0));
      }, options.spawnDelayMs || 0);
      return child;
    },
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: new URL(String(url)), init });
      if (requests.at(-1).url.pathname.endsWith("/lease")) {
        const status = options.leaseResponseStatus || 200;
        return new Response(
          JSON.stringify(status === 200 ? { job_id: jobId, lease_renewed_at_ms: 2000, lease_expires_at_ms: 122000 } : { error: { code: "LEASE_EXPIRED" } }),
          { status, headers: { "Content-Type": "application/json" } },
        );
      }
      const payload = payloads.shift() ?? {};
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
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
    resume_from: resumeFrom || null,
  };
}

function fakeClock(value) {
  return {
    value,
    now() {
      return this.value;
    },
  };
}

function withPatchedKill(run) {
  const killed = [];
  const originalKill = process.kill;
  process.kill = (pid, signal) => {
    killed.push({ pid, signal });
    return true;
  };
  try {
    run();
  } finally {
    process.kill = originalKill;
  }
  return killed;
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
  const lines = ["; generated by PrusaSlicer 2.7.2 on 2026-07-14"];
  for (let index = 1; index <= 10; index += 1) {
    lines.push(";LAYER_CHANGE", `;Z:${(index * 0.2).toFixed(2)}`, `G1 Z${(index * 0.2).toFixed(2)}`);
  }
  lines.push(
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
  );
  return `${lines.join("\n")}\n`;
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}
