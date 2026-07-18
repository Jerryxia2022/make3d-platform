import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  CONFIRM_MARKER,
  parseArgs,
  runBackfill,
  TARGET_FILE_ID,
  TARGET_ORDER_ID,
} from "../scripts/phase06-a3-backfill-single-real-file-sync-job.mjs";

test("single real file backfill defaults to dry-run and does not write", async () => {
  const fixture = await createFixture();
  try {
    const result = await runBackfill({ dbPath: fixture.dbPath, uploadRoot: fixture.uploadRoot, fileId: TARGET_FILE_ID });
    assert.equal(result.mode, "dry-run");
    assert.equal(result.would_create, true);
    assert.equal(result.created, false);
    assert.equal(countRows(fixture.db, "local_file_sync_jobs"), 0);
    assert.equal(countRows(fixture.db, "orders"), 1);
    assert.equal(countRows(fixture.db, "files"), 1);
  } finally {
    await fixture.cleanup();
  }
});

test("single real file backfill refuses writes without exact confirmation marker", async () => {
  assert.throws(() => parseArgs(["--file-id", "26"]), /other than 25/);
  const fixture = await createFixture();
  try {
    const result = await runBackfill({
      dbPath: fixture.dbPath,
      uploadRoot: fixture.uploadRoot,
      fileId: TARGET_FILE_ID,
      confirmMarker: "WRONG_MARKER",
    });
    assert.equal(result.mode, "dry-run");
    assert.equal(result.created, false);
    assert.equal(countRows(fixture.db, "local_file_sync_jobs"), 0);
  } finally {
    await fixture.cleanup();
  }
});

test("single real file backfill writes exactly one pending job with safe relative path and sha", async () => {
  const fixture = await createFixture();
  try {
    const result = await runBackfill({
      dbPath: fixture.dbPath,
      uploadRoot: fixture.uploadRoot,
      fileId: TARGET_FILE_ID,
      confirmMarker: CONFIRM_MARKER,
    });
    assert.equal(result.created, true);
    assert.equal(result.sync_status, "pending");
    assert.equal(result.sha_prefix, fixture.sha.slice(0, 12));
    assert.equal(countRows(fixture.db, "local_file_sync_jobs"), 1);
    assert.equal(countRows(fixture.db, "orders"), 1);
    assert.equal(countRows(fixture.db, "files"), 1);
    const row = fixture.db.prepare("SELECT * FROM local_file_sync_jobs WHERE file_id = ?").get(TARGET_FILE_ID);
    assert.equal(row.order_id, TARGET_ORDER_ID);
    assert.equal(row.source_type, "order_file");
    assert.equal(row.source_version, "upload_v1");
    assert.equal(row.relative_path, "fixture-model.stl");
    assert.equal(row.sha256, fixture.sha);
    assert.equal(row.sync_status, "pending");
    assert.equal(row.attempt_count, 0);
  } finally {
    await fixture.cleanup();
  }
});

test("single real file backfill is idempotent and duplicate runs do not create another row", async () => {
  const fixture = await createFixture();
  try {
    const first = await runBackfill({
      dbPath: fixture.dbPath,
      uploadRoot: fixture.uploadRoot,
      fileId: TARGET_FILE_ID,
      confirmMarker: CONFIRM_MARKER,
    });
    const second = await runBackfill({
      dbPath: fixture.dbPath,
      uploadRoot: fixture.uploadRoot,
      fileId: TARGET_FILE_ID,
      confirmMarker: CONFIRM_MARKER,
    });
    assert.equal(first.created, true);
    assert.equal(second.already_exists, true);
    assert.equal(countRows(fixture.db, "local_file_sync_jobs"), 1);
  } finally {
    await fixture.cleanup();
  }
});

test("single real file backfill concurrent execution creates at most one row", async () => {
  const fixture = await createFixture();
  try {
    const results = await Promise.all([
      runBackfill({ dbPath: fixture.dbPath, uploadRoot: fixture.uploadRoot, fileId: TARGET_FILE_ID, confirmMarker: CONFIRM_MARKER }),
      runBackfill({ dbPath: fixture.dbPath, uploadRoot: fixture.uploadRoot, fileId: TARGET_FILE_ID, confirmMarker: CONFIRM_MARKER }),
    ]);
    assert.equal(countRows(fixture.db, "local_file_sync_jobs"), 1);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(results.filter((result) => result.already_exists).length, 1);
  } finally {
    await fixture.cleanup();
  }
});

test("single real file backfill rejects TEST orders and wrong order ownership", async () => {
  const testOrder = await createFixture({ isTest: true, customerId: 5 });
  try {
    await assert.rejects(() => runBackfill({ dbPath: testOrder.dbPath, uploadRoot: testOrder.uploadRoot, fileId: TARGET_FILE_ID }), /TEST orders/);
  } finally {
    await testOrder.cleanup();
  }

  const wrongOrder = await createFixture({ orderId: 23 });
  try {
    await assert.rejects(() => runBackfill({ dbPath: wrongOrder.dbPath, uploadRoot: wrongOrder.uploadRoot, fileId: TARGET_FILE_ID }), /approved order/);
  } finally {
    await wrongOrder.cleanup();
  }
});

test("single real file backfill rejects missing, directory, escaping, and size-mismatch sources", async () => {
  const missing = await createFixture({ skipFile: true });
  try {
    await assert.rejects(() => runBackfill({ dbPath: missing.dbPath, uploadRoot: missing.uploadRoot, fileId: TARGET_FILE_ID }), /does not exist/);
  } finally {
    await missing.cleanup();
  }

  const directory = await createFixture({ directorySource: true });
  try {
    await assert.rejects(() => runBackfill({ dbPath: directory.dbPath, uploadRoot: directory.uploadRoot, fileId: TARGET_FILE_ID }), /regular file/);
  } finally {
    await directory.cleanup();
  }

  const outside = await createFixture({ outsideSource: true });
  try {
    await assert.rejects(() => runBackfill({ dbPath: outside.dbPath, uploadRoot: outside.uploadRoot, fileId: TARGET_FILE_ID }), /escapes upload root/);
  } finally {
    await outside.cleanup();
  }

  const mismatch = await createFixture({ dbSize: 999 });
  try {
    await assert.rejects(() => runBackfill({ dbPath: mismatch.dbPath, uploadRoot: mismatch.uploadRoot, fileId: TARGET_FILE_ID }), /size does not match/);
  } finally {
    await mismatch.cleanup();
  }
});

test("single real file backfill rejects symlink escape when symlink support is available", async (t) => {
  const fixture = await createFixture({ symlinkEscape: true });
  try {
    if (fixture.symlinkSkipped) {
      t.skip("symlink creation is unavailable on this filesystem");
      return;
    }
    await assert.rejects(() => runBackfill({ dbPath: fixture.dbPath, uploadRoot: fixture.uploadRoot, fileId: TARGET_FILE_ID }), /regular file|escapes upload root/);
  } finally {
    await fixture.cleanup();
  }
});

test("single real file backfill rejects unsupported format and incomplete order fields", async () => {
  const step = await createFixture({ filename: "fixture-model.step" });
  try {
    await assert.rejects(() => runBackfill({ dbPath: step.dbPath, uploadRoot: step.uploadRoot, fileId: TARGET_FILE_ID }), /extension/);
  } finally {
    await step.cleanup();
  }

  const noMaterial = await createFixture({ material: "" });
  try {
    await assert.rejects(() => runBackfill({ dbPath: noMaterial.dbPath, uploadRoot: noMaterial.uploadRoot, fileId: TARGET_FILE_ID }), /material/);
  } finally {
    await noMaterial.cleanup();
  }
});

test("single real file backfill output is sanitized", async () => {
  const fixture = await createFixture();
  try {
    const result = await runBackfill({ dbPath: fixture.dbPath, uploadRoot: fixture.uploadRoot, fileId: TARGET_FILE_ID });
    const text = JSON.stringify(result);
    assert.doesNotMatch(text, /fixture-model\.stl/);
    assert.doesNotMatch(text, new RegExp(fixture.sha));
    assert.doesNotMatch(text, /uploads|\\/);
    assert.match(text, /M3D\*\*\*2459/);
  } finally {
    await fixture.cleanup();
  }
});

async function createFixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "make3d-a3-backfill-"));
  const uploadRoot = join(root, "uploads");
  const outsideRoot = join(root, "outside");
  const dbPath = join(root, "make3d.db");
  const filename = options.filename || "fixture-model.stl";
  const sourcePath = options.outsideSource ? join(outsideRoot, filename) : join(uploadRoot, filename);
  const content = "solid cube\nendsolid cube\n";
  const sha = createHash("sha256").update(content).digest("hex");

  await mkdir(uploadRoot, { recursive: true });
  await mkdir(outsideRoot, { recursive: true });

  let symlinkSkipped = false;
  if (options.directorySource) {
    await mkdir(sourcePath, { recursive: true });
  } else if (options.symlinkEscape) {
    const outsideFile = join(outsideRoot, filename);
    await writeFile(outsideFile, content);
    try {
      await symlink(outsideFile, sourcePath);
    } catch {
      symlinkSkipped = true;
    }
  } else if (!options.skipFile) {
    await writeFile(sourcePath, content);
  }

  const db = new DatabaseSync(dbPath);
  migrateFixtureDb(db);
  const orderId = options.orderId || TARGET_ORDER_ID;
  const customerId = options.customerId === undefined ? 7 : options.customerId;
  db.prepare("INSERT INTO customers (id, is_test_account) VALUES (?, ?)").run(customerId, options.isTest ? 1 : 0);
  db.prepare(`
    INSERT INTO orders (id, order_no, customer_id, material, color, quantity, status)
    VALUES (?, 'M3D20260718082459', ?, ?, ?, ?, 'pending')
  `).run(orderId, customerId, options.material === undefined ? "PLA" : options.material, "black", 1);
  db.prepare(`
    INSERT INTO files (
      id, order_id, filename, filepath, filesize, material, color, quantity, risk_level, requires_manual_confirmation
    ) VALUES (?, ?, ?, ?, ?, ?, 'black', 1, 'none', 0)
  `).run(
    TARGET_FILE_ID,
    orderId,
    filename,
    sourcePath,
    options.dbSize || Buffer.byteLength(content),
    options.material === undefined ? "PLA" : options.material,
  );

  return {
    root,
    uploadRoot,
    dbPath,
    db,
    sha,
    symlinkSkipped,
    async cleanup() {
      db.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

function migrateFixtureDb(db) {
  db.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      is_test_account INTEGER
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      order_no TEXT NOT NULL,
      customer_id INTEGER,
      material TEXT,
      color TEXT,
      quantity INTEGER,
      status TEXT
    );
    CREATE TABLE files (
      id INTEGER PRIMARY KEY,
      order_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      material TEXT,
      color TEXT,
      quantity INTEGER,
      risk_level TEXT,
      requires_manual_confirmation INTEGER
    );
    CREATE TABLE local_file_sync_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL UNIQUE,
      order_id INTEGER NOT NULL,
      customer_id INTEGER,
      order_no TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'order_file',
      source_version TEXT NOT NULL DEFAULT 'upload_v1',
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      sha256 TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      worker_id TEXT,
      locked_at DATETIME,
      local_path TEXT,
      local_sha256 TEXT,
      local_synced_at DATETIME,
      last_error TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1,
      worker_version TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function countRows(db, tableName) {
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count);
}
