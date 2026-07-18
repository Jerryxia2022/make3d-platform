import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createWorkbenchApp } from "../worker/order-workbench/server.mjs";
import {
  createLocalSliceResult,
  getLocalReviewByOrderId,
  listAuditEventsForOrder,
  migrateWorkbenchDatabase,
  updateLocalSliceResult,
  updateLocalReview,
} from "../worker/order-workbench/lib/localDb.mjs";
import {
  assertNoExistingPrusaSlicerProcess,
  assertPrusaSlicerLocale,
  createGlobalSliceLockSpawnImpl,
  FLOCK_LOCK_CONFLICT_EXIT_CODE,
  getGlobalSliceLockPath,
  verifySliceInputFile,
} from "../worker/order-workbench/lib/localSlicing.mjs";
import { runPrusaSlicer, spawnPrusaSlicer } from "../worker/make3d-slicing-worker.mjs";

test("local review drafts are stored only in the local database with audit redaction", () => {
  const db = new DatabaseSync(":memory:");
  migrateWorkbenchDatabase(db);
  const order = { id: 23, order_no: "M3DLOCAL001", updated_at: "2026-07-17T10:00:00Z" };

  const review = updateLocalReview(db, order, {
    state: "QUOTE_DRAFTED",
    confirmed_price_cents: "1234",
    lead_time_min_hours: "12",
    lead_time_max_hours: "24",
    reply_template: "PLAIN_TEXT",
    reply_draft: "<b>safe escaped by renderer</b>",
    operator_note: "Authorization: Bearer secret-token 13900000000 test@example.com",
  });

  assert.equal(review.state, "QUOTE_DRAFTED");
  assert.equal(review.confirmed_price_cents, 1234);
  assert.equal(review.lead_time_min_hours, 12);
  assert.equal(review.lead_time_max_hours, 24);
  const auditText = JSON.stringify(listAuditEventsForOrder(db, order.id));
  assert.doesNotMatch(auditText, /secret-token|13900000000|test@example.com/);
  assert.throws(() => updateLocalReview(db, order, { lead_time_min_hours: "30", lead_time_max_hours: "20" }), /max/);
  assert.throws(() => updateLocalReview(db, order, { confirmed_price_cents: "12.5" }), /integer/);
});

test("slice input verification rejects unsafe or unverified files before PrusaSlicer", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-a3-input-"));
  const workerRoot = join(root, "worker");
  const filesRoot = join(workerRoot, "files");
  const content = "solid cube\nendsolid cube\n";
  const sha = sha256(content);
  try {
    await mkdir(join(filesRoot, "M3DLOCAL"), { recursive: true });
    await writeFile(join(filesRoot, "M3DLOCAL", "cube.stl"), content);
    const baseFile = {
      file_id: 1,
      local_file_sync_job_id: 2,
      relative_path: "M3DLOCAL/cube.stl",
      masked_filename: "cu***be.stl",
      sync_status: "verified",
      expected_size_bytes: Buffer.byteLength(content),
      expected_sha256: sha,
    };

    const verified = await verifySliceInputFile(baseFile, { filesRoot, workerRoot });
    assert.equal(verified.workerRelativePath, "files/M3DLOCAL/cube.stl");
    assert.equal(verified.sha256, sha);

    await assert.rejects(() => verifySliceInputFile({ ...baseFile, sync_status: "pending" }, { filesRoot, workerRoot }), /sync-not-verified/);
    await assert.rejects(() => verifySliceInputFile({ ...baseFile, relative_path: "../cube.stl" }, { filesRoot, workerRoot }), /unsafe|path|file-not-verified/);
    await assert.rejects(() => verifySliceInputFile({ ...baseFile, expected_size_bytes: 999 }, { filesRoot, workerRoot }), /size|file-not-verified/);
    await assert.rejects(() => verifySliceInputFile({ ...baseFile, expected_sha256: "a".repeat(64) }, { filesRoot, workerRoot }), /sha|file-not-verified/i);
    await assert.rejects(() => verifySliceInputFile({ ...baseFile, relative_path: "M3DLOCAL/cube.step", masked_filename: "cube.step" }, { filesRoot, workerRoot }), /extension-not-supported/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PrusaSlicer locale and process guard fail closed", async () => {
  await assertPrusaSlicerLocale({
    execFileImpl(command, args, options, callback) {
      callback(null, "C\nen_US.utf8\n");
    },
  });

  await assert.rejects(() => assertPrusaSlicerLocale({
    execFileImpl(command, args, options, callback) {
      callback(null, "C\nPOSIX\n");
    },
  }), /en_US.UTF-8/);

  await assert.rejects(() => assertNoExistingPrusaSlicerProcess({
    execFileImpl(command, args, options, callback) {
      callback(null, "123 /usr/bin/prusa-slicer --export-gcode\n");
    },
  }), /already running/);
});

test("PrusaSlicer child process is spawned with locale env and shell=false", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-a3-spawn-"));
  const stdoutPath = join(root, "stdout.log");
  const stderrPath = join(root, "stderr.log");
  let capturedOptions = null;
  try {
    await spawnPrusaSlicer(
      {
        prusaSlicerBin: "/usr/bin/prusa-slicer",
        spawnImpl(command, args, options) {
          capturedOptions = options;
          const child = new EventEmitter();
          child.stdout = Readable.from(["ok"]);
          child.stderr = Readable.from([]);
          child.unref = () => {};
          process.nextTick(() => child.emit("close", 0, null));
          return child;
        },
      },
      ["--help"],
      stdoutPath,
      stderrPath,
    );
    assert.equal(capturedOptions.shell, false);
    assert.equal(capturedOptions.env.LANG, "en_US.UTF-8");
    assert.equal(capturedOptions.env.LANGUAGE, "en_US:en");
    assert.equal(capturedOptions.env.LC_ALL, "en_US.UTF-8");
    assert.ok(capturedOptions.env.PATH);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("global slice lock wraps PrusaSlicer with fixed flock arguments and shell=false", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-a3-flock-"));
  const calls = [];
  try {
    const spawnImpl = await createGlobalSliceLockSpawnImpl({
      workerRoot: root,
      flockBin: "/usr/bin/flock",
      baseSpawnImpl(command, args, options) {
        calls.push({ command, args, options });
        const child = new EventEmitter();
        child.stdout = Readable.from(["ok"]);
        child.stderr = Readable.from([]);
        child.unref = () => {};
        process.nextTick(() => child.emit("close", 0, null));
        return child;
      },
    });

    await spawnPrusaSlicer(
      { prusaSlicerBin: "/usr/bin/prusa-slicer", spawnImpl },
      ["--export-gcode", "--output", "out.gcode", "input.stl"],
      join(root, "stdout.log"),
      join(root, "stderr.log"),
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "/usr/bin/flock");
    assert.deepEqual(calls[0].args.slice(0, 4), ["-n", "-E", String(FLOCK_LOCK_CONFLICT_EXIT_CODE), getGlobalSliceLockPath(root)]);
    assert.equal(calls[0].args[4], "/usr/bin/prusa-slicer");
    assert.equal(calls[0].options.shell, false);
    assert.equal(calls[0].options.env.LANG, "en_US.UTF-8");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("global slice lock conflict is reported as a clear local slicing message", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-a3-flock-conflict-"));
  const inputPath = join(root, "input.stl");
  const profilePath = join(root, "profile.ini");
  try {
    await writeFile(inputPath, "solid cube\nendsolid cube\n");
    await writeFile(profilePath, "profile");
    await assert.rejects(
      () => runPrusaSlicer(
        {
          rootDir: root,
          prusaSlicerBin: "/usr/bin/prusa-slicer",
          globalSliceLockPath: getGlobalSliceLockPath(root),
          spawnImpl() {
            const child = new EventEmitter();
            child.stdout = Readable.from([]);
            child.stderr = Readable.from(["lock busy"]);
            child.unref = () => {};
            process.nextTick(() => child.emit("close", FLOCK_LOCK_CONFLICT_EXIT_CODE, null));
            return child;
          },
        },
        {
          job: {
            job_id: 7,
            slice_params: {
              material: "PLA",
              printer_model: "Bambu Lab P1S",
              nozzle_diameter_microns: 400,
              layer_height_microns: 200,
              fill_density_percent: 50,
              support_mode: "none",
              brim_width_microns: 0,
            },
          },
          lock: { attempt_no: 1 },
        },
        { path: inputPath, sizeBytes: 24, sha256: "a".repeat(64) },
        { path: profilePath, profileKey: "fixture", sha256: "b".repeat(64) },
        "2.7.2",
      ),
      /Another local slicing operation is already running/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stale lock path alone does not block when flock grants the descriptor lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-a3-stale-lock-"));
  try {
    await mkdir(join(root, "order-workbench"), { recursive: true });
    await writeFile(getGlobalSliceLockPath(root), "stale path only");
    const spawnImpl = await createGlobalSliceLockSpawnImpl({
      workerRoot: root,
      baseSpawnImpl(command, args, options) {
        assert.equal(command, "/usr/bin/flock");
        assert.equal(options.shell, false);
        const child = new EventEmitter();
        child.stdout = Readable.from([]);
        child.stderr = Readable.from([]);
        child.unref = () => {};
        process.nextTick(() => child.emit("close", 0, null));
        return child;
      },
    });
    await spawnPrusaSlicer({ spawnImpl }, ["--help"], join(root, "stdout.log"), join(root, "stderr.log"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local workbench POST actions require CSRF and do not call online write APIs", async () => {
  const db = new DatabaseSync(":memory:");
  migrateWorkbenchDatabase(db);
  const calls = [];
  const app = createWorkbenchApp(
    {
      host: "127.0.0.1",
      port: 5177,
      serverUrl: "https://make3d.test",
      operatorToken: "phase06-token",
      localFilesRoot: "/tmp/make3d-files",
      profileName: "profile",
      profileKey: "bambu-p1s",
    },
    {
      csrfToken: "csrf-test-token",
      localDb: db,
      localSliceImpl: async ({ order, file }) => {
        calls.push({ orderId: order.id, syncJobId: file.local_file_sync_job_id });
        return { ok: true, slice: { id: 99, status: "partial" } };
      },
      cloudClient: createFakeCloudClient(),
    },
  );

  const bad = await dispatch(app, {
    method: "POST",
    url: "/orders/1/local-review",
    host: "127.0.0.1:5177",
    headers: { origin: "http://127.0.0.1:5177" },
    body: "csrf=bad&state=REVIEWING",
  });
  assert.equal(bad.statusCode, 403);

  const saved = await dispatch(app, {
    method: "POST",
    url: "/orders/1/local-review",
    host: "127.0.0.1:5177",
    headers: { origin: "http://127.0.0.1:5177" },
    body: "csrf=csrf-test-token&state=REVIEWING&confirmed_price_cents=1200&reply_draft=%3Cscript%3E",
  });
  assert.equal(saved.statusCode, 200);
  assert.equal(getLocalReviewByOrderId(db, 1).state, "REVIEWING");

  const sliced = await dispatch(app, {
    method: "POST",
    url: "/orders/1/local-slice/run",
    host: "127.0.0.1:5177",
    headers: { origin: "http://127.0.0.1:5177" },
    body: "csrf=csrf-test-token&sync_job_id=10",
  });
  assert.equal(sliced.statusCode, 200);
  assert.deepEqual(calls, [{ orderId: 1, syncJobId: 10 }]);
});

test("local workbench validation errors return 422 and keep the previous valid draft", async () => {
  const db = new DatabaseSync(":memory:");
  migrateWorkbenchDatabase(db);
  const app = createWorkbenchApp(
    {
      host: "127.0.0.1",
      port: 5177,
      serverUrl: "https://make3d.test",
      operatorToken: "phase06-token",
      localFilesRoot: "/tmp/make3d-files",
      profileName: "profile",
      profileKey: "bambu-p1s",
    },
    {
      csrfToken: "csrf-test-token",
      localDb: db,
      cloudClient: createFakeCloudClient(),
    },
  );

  const saved = await dispatch(app, {
    method: "POST",
    url: "/orders/1/local-review",
    host: "127.0.0.1:5177",
    headers: { origin: "http://127.0.0.1:5177" },
    body: "csrf=csrf-test-token&state=REVIEWING&confirmed_price_cents=1200&lead_time_min_hours=12&lead_time_max_hours=24&reply_draft=valid",
  });
  assert.equal(saved.statusCode, 200);

  const badPrice = await dispatch(app, {
    method: "POST",
    url: "/orders/1/local-review",
    host: "127.0.0.1:5177",
    headers: { origin: "http://127.0.0.1:5177" },
    body: "csrf=csrf-test-token&state=REVIEWING&confirmed_price_cents=12.5",
  });
  assert.equal(badPrice.statusCode, 422);
  assert.match(badPrice.body, /validation error/i);

  const badLeadTime = await dispatch(app, {
    method: "POST",
    url: "/orders/1/local-review",
    host: "127.0.0.1:5177",
    headers: { origin: "http://127.0.0.1:5177" },
    body: "csrf=csrf-test-token&state=REVIEWING&lead_time_min_hours=30&lead_time_max_hours=20",
  });
  assert.equal(badLeadTime.statusCode, 422);

  const review = getLocalReviewByOrderId(db, 1);
  assert.equal(review.confirmed_price_cents, 1200);
  assert.equal(review.lead_time_min_hours, 12);
  assert.equal(review.lead_time_max_hours, 24);
  assert.equal(review.reply_draft, "valid");
});

test("local workbench displays parser metric sources, dimensions, and warning severity", async () => {
  const db = new DatabaseSync(":memory:");
  migrateWorkbenchDatabase(db);
  const order = { id: 1, order_no: "M3DLOCAL001", created_at: "2026-07-17 10:00:00", updated_at: "2026-07-17 10:00:00" };
  const slice = createLocalSliceResult(db, {
    order_id: order.id,
    order_no: order.order_no,
    file_id: 1,
    sync_job_id: 10,
    input_relative_path: "files/M3DLOCAL/cube.stl",
    input_sha256: "a".repeat(64),
    input_size_bytes: 1517,
    profile_key: "bambu-p1s",
    profile_name: "Bambu P1S",
    profile_sha256: "b".repeat(64),
    parser_version: "phase05-c-parser-v1",
    status: "slicing",
    started_at: "2026-07-17T10:00:00Z",
  });
  const updated = updateLocalSliceResult(db, slice.id, {
    status: "parsed",
    slicer_version: "2.7.2+dfsg-1build2",
    parse_status: "parsed",
    metrics_status: "ok",
    parser_quote_ready: true,
    completed_at: "2026-07-17T10:00:01Z",
    duration_seconds: 1,
    print_time_seconds: 1496,
    material_weight_grams: 6.313,
    dimensions_x: 32.714,
    dimensions_y: 32.714,
    dimensions_z: 20,
    gcode_size_bytes: 284994,
    gcode_sha256: "c".repeat(64),
    warnings_json: JSON.stringify(["NON_BLOCKING:PARSER_NOTE:layer_count derived from LAYER_CHANGE markers"]),
    metrics_json: JSON.stringify({
      metric_sources: { filament_weight_source: "calculated_from_length_density" },
      dimension_sources: {
        upload_model_dimensions: { x_mm: 20, y_mm: 20, z_mm: 20, source: "cloud_file_geometry" },
        parser_dimensions: { x_mm: 32.714, y_mm: 32.714, z_mm: 20, source: "gcode_bounds" },
        parser_dimensions_source: "gcode_bounds",
      },
    }),
  });
  updateLocalReview(db, order, {
    state: "SLICE_REVIEWED",
    selected_file_id: 1,
    selected_sync_job_id: 10,
    slice_result_id: updated.id,
  });
  const app = createWorkbenchApp(
    {
      host: "127.0.0.1",
      port: 5177,
      serverUrl: "https://make3d.test",
      operatorToken: "phase06-token",
      localFilesRoot: "/tmp/make3d-files",
      profileName: "profile",
      profileKey: "bambu-p1s",
    },
    {
      csrfToken: "csrf-test-token",
      localDb: db,
      cloudClient: createFakeCloudClient(),
    },
  );

  const response = await dispatch(app, { method: "GET", url: "/orders/1", host: "127.0.0.1:5177" });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Material weight/);
  assert.match(response.body, /Weight source/);
  assert.match(response.body, /calculated_from_length_density/);
  assert.match(response.body, /Upload model dimensions/);
  assert.match(response.body, /20mm \/ 20mm \/ 20mm/);
  assert.match(response.body, /Slicing output range/);
  assert.match(response.body, /32\.714mm \/ 32\.714mm \/ 20mm \(gcode_bounds\)/);
  assert.match(response.body, /warning severity \/ code \/ message/);
  assert.match(response.body, /NON_BLOCKING/);
  assert.match(response.body, /PARSER_NOTE/);
});

function createFakeCloudClient() {
  const detail = {
    order: {
      id: 1,
      order_no: "M3DLOCAL001",
      created_at: "2026-07-17 10:00:00",
      updated_at: "2026-07-17 10:00:00",
      status: "pending",
      payment_status: "unpaid",
      material: "PLA",
      color: "black",
      quantity: 1,
      estimated_price: 12.5,
      remark: "safe note",
      is_test_account: true,
    },
    files: [
      {
        file_id: 1,
        local_file_sync_job_id: 10,
        masked_filename: "cu***be.stl",
        format: "stl",
        filesize: 10,
        expected_size_bytes: 10,
        expected_sha256: "b".repeat(64),
        relative_path: "M3DLOCAL/cube.stl",
        sync_status: "verified",
      },
    ],
    customer_service_requests: [],
  };
  return {
    async listOrders() {
      return { orders: [{ ...detail.order, file_count: 1, file_sync_summary: { status: "verified", verified_count: 1, file_count: 1 } }] };
    },
    async getOrder() {
      return detail;
    },
  };
}

function dispatch(app, options) {
  const request = new EventEmitter();
  request.method = options.method;
  request.url = options.url;
  request.headers = { host: options.host, ...(options.headers || {}) };
  request.setEncoding = () => {};
  request.destroy = () => {};

  const response = {
    statusCode: 0,
    headers: {},
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.body = String(body || "");
      this.resolve(this);
    },
  };

  const promise = new Promise((resolve) => {
    response.resolve = resolve;
  });
  void app.handleRequest(request, response);
  process.nextTick(() => {
    if (options.body) request.emit("data", options.body);
    request.emit("end");
  });
  return promise;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
