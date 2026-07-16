import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import {
  apiRequest,
  assertInsideRoot,
  buildPrusaSlicerArgs,
  buildResultPayload,
  computeParseCacheKey,
  computeStableSha256,
  loadSlicingWorkerConfig,
  lockJob,
  mapInputPath,
  parseWorkerEnv,
  postFailed,
  resolveArtifactPaths,
  runOnce,
  selectPendingJob,
  spawnPrusaSlicer,
  startLeaseHeartbeat,
  stopLeaseHeartbeat,
  validateSliceParams,
  verifyExistingGcodeArtifact,
  verifyLocalInput,
  verifyProfile,
} from "../worker/make3d-slicing-worker.mjs";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

test("slicing client parses pending payload and exits cleanly when no jobs exist", async () => {
  const config = mockConfig([
    { jobs: [] },
  ]);
  const result = await runOnce(config);
  assert.deepEqual(result, { exitCode: 0, status: "no-task" });
  assert.equal(selectPendingJob({ jobs: [{ job_id: 7 }] }).job_id, 7);
  assert.equal(selectPendingJob({ jobs: [] }), null);
});

test("slicing client lock request preserves UUID lock owner and uses bearer auth", async () => {
  const lockOwner = "123e4567-e89b-42d3-a456-426614174000";
  const requests = [];
  const config = mockConfig([{ job_id: 3, attempt_no: 1, lock_owner: lockOwner, lease_expires_at_ms: 999, resume_from: null }], requests);
  const lock = await lockJob(config, 3);
  assert.equal(lock.lock_owner, lockOwner);
  assert.equal(lock.attempt_no, 1);
  assert.equal(requests[0].url.pathname, "/api/worker/slicing/jobs/3/lock");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.headers.Authorization, "Bearer test-token");
  assert.equal(requests[0].init.body, "");
});

test("slicing client env parsing rejects unknown keys and normalizes local config", async () => {
  assert.deepEqual(parseWorkerEnv("SERVER_URL=http://127.0.0.1:3100\nWORKER_TOKEN='abc'\n"), {
    SERVER_URL: "http://127.0.0.1:3100",
    WORKER_TOKEN: "abc",
  });
  assert.throws(() => parseWorkerEnv("WECHAT_PAY_API_V3_KEY=x\n"), /disallowed env key/);
  const previousServer = process.env.SERVER_URL;
  const previousToken = process.env.WORKER_TOKEN;
  process.env.SERVER_URL = "http://127.0.0.1:3100";
  process.env.WORKER_TOKEN = "test-token";
  const config = await loadSlicingWorkerConfig({
    envPath: join(tmpdir(), `missing-${Date.now()}.env`),
    fetchImpl: async () => new Response("{}"),
  });
  try {
    assert.equal(config.workerId, "wsl-worker-01");
    assert.equal(config.serverUrl, "http://127.0.0.1:3100/");
  } finally {
    if (previousServer === undefined) delete process.env.SERVER_URL;
    else process.env.SERVER_URL = previousServer;
    if (previousToken === undefined) delete process.env.WORKER_TOKEN;
    else process.env.WORKER_TOKEN = previousToken;
  }
});

test("profile whitelist verifies SHA and rejects non-whitelisted keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-profile-"));
  try {
    const profilePath = join(root, "bambu-p1s.ini");
    await writeFile(profilePath, "profile");
    const sha = sha256String("profile");
    const profile = await verifyProfile(
      { profile_key: "bambu-p1s", profile_sha256: sha },
      { "bambu-p1s": { path: profilePath } },
    );
    assert.equal(profile.sha256, sha);
    await assert.rejects(() => verifyProfile({ profile_key: "../evil", profile_sha256: sha }, { "bambu-p1s": { path: profilePath } }), /not whitelisted/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("slice params are validated before constructing PrusaSlicer argument arrays", () => {
  const params = baseSliceParams();
  assert.deepEqual(validateSliceParams(params), params);
  assert.throws(() => validateSliceParams({ ...params, material: "ABS" }), /material/);
  assert.throws(() => validateSliceParams({ ...params, fill_density_percent: 101 }), /fill_density/);
  const args = buildPrusaSlicerArgs(params, "/safe/profile.ini", "/safe/output.gcode", "/safe/input.stl");
  assert.deepEqual(args, [
    "--export-gcode",
    "--load",
    "/safe/profile.ini",
    "--output",
    "/safe/output.gcode",
    "--filament-type",
    "PLA",
    "--layer-height",
    "0.2",
    "--fill-density",
    "50%",
    "/safe/input.stl",
  ]);
});

test("spawn wrapper uses argument arrays and forbids shell mode", async () => {
  const calls = [];
  const root = await mkdtemp(join(tmpdir(), "make3d-spawn-"));
  try {
    const child = new EventEmitter();
    child.stdout = PassThrough.from(["ok"]);
    child.stderr = PassThrough.from([""]);
    const promise = spawnPrusaSlicer(
      { spawnImpl: (command, args, options) => {
        calls.push({ command, args, options });
        setImmediate(() => child.emit("close", 0));
        return child;
      } },
      ["--export-gcode", "input.stl"],
      join(root, "stdout.log"),
      join(root, "stderr.log"),
    );
    const result = await promise;
    assert.equal(result.exitCode, 0);
    assert.equal(calls[0].command, "/usr/bin/prusa-slicer");
    assert.deepEqual(calls[0].args, ["--export-gcode", "input.stl"]);
    assert.equal(calls[0].options.shell, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local path mapping and artifact mapping stay inside integration root", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-paths-"));
  assert.equal(mapInputPath(root, { file_id: 5 }), join(root, "files", "5-synthetic-cube.stl"));
  assert.throws(() => assertInsideRoot(root, join(root, "..", "files", "customer.stl")), /escapes/);
  assert.throws(() => resolveArtifactPaths(root, 9), /attempt_no/);
  const attemptPaths = resolveArtifactPaths(root, 9, 2);
  assert.equal(attemptPaths.apiPaths.gcode, "results/prusaslicer/9/attempt-2/output.gcode");
  assert.equal(attemptPaths.gcodePath, join(root, "results", "prusaslicer", "9", "attempt-2", "output.gcode"));
  assert.equal(attemptPaths.processingGcodePartPath, join(root, "processing", "prusaslicer", "9", "attempt-2", "output.gcode.part"));
  await rm(root, { recursive: true, force: true });
});

test("local input verification checks file size and SHA", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-input-"));
  try {
    await mkdir(join(root, "files"), { recursive: true });
    const inputPath = join(root, "files", "11-synthetic-cube.stl");
    await writeFile(inputPath, "solid cube\nendsolid cube\n");
    const sha = sha256String("solid cube\nendsolid cube\n");
    const input = await verifyLocalInput({ rootDir: root }, { file_id: 11, input_sha256: sha });
    assert.equal(input.sha256, sha);
    assert.equal(input.sizeBytes, 25);
    await assert.rejects(() => verifyLocalInput({ rootDir: root }, { file_id: 11, input_sha256: SHA_A }), /SHA mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lease heartbeat posts lock owner without submitting lease expiry", async () => {
  const requests = [];
  const config = mockConfig([{ ok: true }], requests);
  const timer = startLeaseHeartbeat(config, {
    job: { job_id: 42 },
    lock: {
      lock_owner: "123e4567-e89b-42d3-a456-426614174000",
      lease_renewed_at_ms: 1000,
      lease_expires_at_ms: 121000,
    },
  }, 5);
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    stopLeaseHeartbeat(timer);
  }
  assert.ok(requests.length >= 1);
  const body = JSON.parse(requests[0].init.body);
  assert.deepEqual(Object.keys(body), ["lock_owner"]);
});

test("result payload preserves parser nulls and uses server-compatible parse cache key", () => {
  const parsed = parsedFixture({ filamentWeightMg: null });
  const payload = buildResultPayload("123e4567-e89b-42d3-a456-426614174000", { required_parser_version: "phase05-c-parser-v1" }, parsed);
  assert.equal(payload.metrics.filament_weight_mg, null);
  assert.equal(payload.parse_cache_key_sha256, computeParseCacheKey(parsed.result.gcode_sha256, "phase05-c-parser-v1"));
  assert.equal(payload.parser_quote_ready, false);
});

test("failed payload sanitizes secrets and does not include retryable", async () => {
  const requests = [];
  const config = mockConfig([{ job_id: 8, status: "failed" }], requests);
  await postFailed(
    config,
    { job: { job_id: 8, status: "slicing" }, lock: { lock_owner: "123e4567-e89b-42d3-a456-426614174000" } },
    "WORKER_IO_ERROR",
    "token=secret /srv/make3d-worker/private 13900000000 test@example.com",
  );
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.error_code, "WORKER_IO_ERROR");
  assert.equal(body.retryable, undefined);
  assert.doesNotMatch(body.error_message, /secret|13900000000|test@example.com|\/srv\/make3d-worker/);
});

test("api request rejects non-JSON API responses without printing tokens", async () => {
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const config = mockConfig([], []);
    config.fetchImpl = async () => new Response("<html></html>", { status: 500 });
    await assert.rejects(() => apiRequest(config, "/api/worker/slicing/jobs/pending"), /non-JSON/);
    assert.doesNotMatch(logs.join("\n"), /test-token/);
  } finally {
    console.error = original;
  }
});

test("stable SHA helpers match API identity rules", () => {
  const objectA = { b: 2, a: 1 };
  const objectB = { a: 1, b: 2 };
  assert.equal(computeStableSha256(objectA), computeStableSha256(objectB));
  assert.match(computeParseCacheKey(SHA_B, "phase05-c-parser-v1"), /^[a-f0-9]{64}$/);
});

test("resume_from=sliced verifies existing G-code and skips PrusaSlicer", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-resume-sliced-"));
  const requests = [];
  try {
    await mkdir(join(root, "files"), { recursive: true });
    await mkdir(join(root, "profiles"), { recursive: true });
    await mkdir(join(root, "results", "prusaslicer", "77", "attempt-1"), { recursive: true });
    const inputPath = join(root, "files", "77-synthetic-cube.stl");
    const profilePath = join(root, "profiles", "bambu-p1s.ini");
    const gcodePath = join(root, "results", "prusaslicer", "77", "attempt-1", "output.gcode");
    await writeFile(inputPath, "solid cube\nendsolid cube\n");
    await writeFile(profilePath, "profile");
    await writeFile(gcodePath, completeGcode());

    const inputSha = sha256String("solid cube\nendsolid cube\n");
    const profileSha = sha256String("profile");
    const gcodeSha = sha256String(completeGcode());
    const gcodeSize = (await stat(gcodePath)).size;
    const job = pendingJobFixture({
      jobId: 77,
      inputSha,
      profileSha,
      resumeFrom: "sliced",
    });
    const lockOwner = "123e4567-e89b-42d3-a456-426614174000";
    const config = mockConfig(
      [
        { jobs: [job] },
        {
          job_id: 77,
          attempt_no: 2,
          lock_owner: lockOwner,
          lease_renewed_at_ms: 1000,
          lease_expires_at_ms: 121000,
          resume_from: "sliced",
          gcode_relative_path: "results/prusaslicer/77/attempt-1/output.gcode",
          gcode_size_bytes: gcodeSize,
          gcode_sha256: gcodeSha,
        },
        { job_id: 77, status: "parsing" },
        { job_id: 77, status: "partial", parser_quote_ready: false },
      ],
      requests,
    );
    config.rootDir = root;
    config.profileWhitelist = { "bambu-p1s": { path: profilePath } };
    config.execFileImpl = (_command, _args, _options, callback) => callback(null, "2.7.2+dfsg-1build2", "");
    config.spawnImpl = () => {
      throw new Error("PrusaSlicer should not run during sliced resume");
    };

    const result = await runOnce(config);
    assert.equal(result.exitCode, 0);
    assert.equal(result.status, "partial");
    assert.equal(result.resumedFrom, "sliced");
    assert.equal(result.prusaSlicerRan, false);
    assert.equal(result.gcodeSha256, gcodeSha);
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/slicing")), false);
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/sliced")), false);
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/parsing")), true);
    assert.equal(requests.some((request) => request.url.pathname.endsWith("/result")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resume_from=sliced missing artifact fails without parser or result", async () => {
  const requests = [];
  const job = pendingJobFixture({ jobId: 88, resumeFrom: "sliced" });
  const lockOwner = "123e4567-e89b-42d3-a456-426614174001";
  const config = mockConfig(
    [
      { jobs: [job] },
      {
        job_id: 88,
        attempt_no: 2,
        lock_owner: lockOwner,
        lease_renewed_at_ms: 1000,
        lease_expires_at_ms: 121000,
        resume_from: "sliced",
        gcode_relative_path: "results/prusaslicer/88/attempt-1/output.gcode",
        gcode_size_bytes: 100,
        gcode_sha256: SHA_B,
      },
      { job_id: 88, status: "failed" },
    ],
    requests,
  );
  const root = await mkdtemp(join(tmpdir(), "make3d-resume-missing-"));
  try {
    await mkdir(join(root, "files"), { recursive: true });
    await mkdir(join(root, "profiles"), { recursive: true });
    const inputPath = join(root, "files", "88-synthetic-cube.stl");
    const profilePath = join(root, "profiles", "bambu-p1s.ini");
    await writeFile(inputPath, "solid cube\nendsolid cube\n");
    await writeFile(profilePath, "profile");
    config.rootDir = root;
    config.profileWhitelist = { "bambu-p1s": { path: profilePath } };
    config.execFileImpl = (_command, _args, _options, callback) => callback(null, "2.7.2+dfsg-1build2", "");
    const result = await runOnce(config);

    assert.equal(result.status, "failed");
    assert.equal(result.exitCode, 0);
    const paths = requests.map((request) => request.url.pathname);
    assert.equal(paths.some((path) => path.endsWith("/parsing")), false);
    assert.equal(paths.some((path) => path.endsWith("/result")), false);
    assert.equal(paths.some((path) => path.endsWith("/failed")), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("existing G-code resume validation rejects size and SHA mismatches", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-resume-verify-"));
  try {
    await mkdir(join(root, "results", "prusaslicer", "9", "attempt-1"), { recursive: true });
    const gcodePath = join(root, "results", "prusaslicer", "9", "attempt-1", "output.gcode");
    await writeFile(gcodePath, completeGcode());
    const size = (await stat(gcodePath)).size;
    const sha = sha256String(completeGcode());
    const ok = await verifyExistingGcodeArtifact(
      { rootDir: root },
      { job_id: 9 },
      { gcode_relative_path: "results/prusaslicer/9/attempt-1/output.gcode", gcode_size_bytes: size, gcode_sha256: sha },
      "2.7.2+dfsg-1build2",
    );
    assert.equal(ok.gcodeSha256, sha);
    await assert.rejects(
      () =>
        verifyExistingGcodeArtifact(
          { rootDir: root },
          { job_id: 9 },
          { gcode_relative_path: "results/prusaslicer/9/attempt-1/output.gcode", gcode_size_bytes: size + 1, gcode_sha256: sha },
          "2.7.2+dfsg-1build2",
        ),
      /size mismatch/,
    );
    await assert.rejects(
      () =>
        verifyExistingGcodeArtifact(
          { rootDir: root },
          { job_id: 9 },
          { gcode_relative_path: "results/prusaslicer/9/attempt-1/output.gcode", gcode_size_bytes: size, gcode_sha256: SHA_A },
          "2.7.2+dfsg-1build2",
        ),
      /SHA mismatch/,
    );
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
    rootDir: "/srv/make3d-worker/test-integration/phase05-h-a",
    prusaSlicerBin: "/usr/bin/prusa-slicer",
    fetchImpl: async (url, init = {}) => {
      requests.push({ url: new URL(String(url)), init });
      const payload = queue.shift() ?? {};
      return new Response(JSON.stringify(payload), { status: payload.statusCode || 200, headers: { "Content-Type": "application/json" } });
    },
  };
}

function pendingJobFixture({ jobId = 3, inputSha, profileSha, resumeFrom = null } = {}) {
  return {
    job_id: jobId,
    file_id: jobId,
    file_sync_job_id: jobId,
    input_worker_id: "wsl-worker-01",
    input_sha256: inputSha || sha256String("solid cube\nendsolid cube\n"),
    profile_key: "bambu-p1s",
    profile_version: "phase05-b",
    profile_sha256: profileSha || sha256String("profile"),
    slice_params: baseSliceParams(),
    slice_params_sha256: computeStableSha256(baseSliceParams()),
    slice_cache_key_sha256: SHA_A,
    required_slicer_package_version: "2.7.2+dfsg-1build2",
    required_parser_version: "phase05-c-parser-v1",
    resume_from: resumeFrom,
  };
}

function completeGcode() {
  return [
    "; generated by PrusaSlicer 2.7.2 on 2026-07-14 at 09:25:30 UTC",
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

function parsedFixture({ filamentWeightMg = 1230 } = {}) {
  return {
    result: {
      print_time_seconds: 60,
      silent_print_time_seconds: 70,
      filament_length_microns: 1000,
      filament_volume_mm3: 10,
      filament_weight_mg: filamentWeightMg,
      layer_count: 2,
      max_layer_z_microns: 400,
      filament_type: "PLA",
      printer_model: "Bambu Lab P1S",
      nozzle_diameter_microns: 400,
      layer_height_microns: 200,
      gcode_size_bytes: 123,
      gcode_sha256: SHA_B,
    },
    metric_sources: {
      print_time_source: "gcode_tail_stat",
      filament_length_source: "gcode_tail_stat",
      filament_volume_source: "gcode_tail_stat",
      filament_weight_source: filamentWeightMg == null ? "missing" : "gcode_tail_stat",
      layer_count_source: "derived_layer_markers",
      max_layer_z_source: "derived_z_markers",
      filament_type_source: "gcode_config",
      printer_model_source: "gcode_config",
      nozzle_diameter_source: "gcode_config",
      layer_height_source: "gcode_config",
    },
    validation: {
      metrics_status: filamentWeightMg == null ? "warning" : "valid",
      quote_ready: filamentWeightMg != null,
      invalid_fields: [],
      warnings: filamentWeightMg == null ? ["missing filament_weight_mg"] : [],
    },
    parse: {
      status: "parsed",
      missing_fields: filamentWeightMg == null ? ["filament_weight_mg"] : [],
      warnings: filamentWeightMg == null ? ["missing filament_weight_mg"] : [],
    },
  };
}

function sha256String(value) {
  return createHash("sha256").update(value).digest("hex");
}
