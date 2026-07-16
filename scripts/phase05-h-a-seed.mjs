#!/usr/bin/env node
import { copyFile, mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { createOrderWithFile, initDatabase } from "../src/backend/database.ts";
import { createSlicingJobForVerifiedFile } from "../src/backend/workerSlicingJobs.ts";
import { PARSER_VERSION, sha256File } from "../worker/prusaslicer-result-parser.mjs";

const dbPath = requireEnv("PHASE05_H_DB_PATH");
const rootDir = requireEnv("PHASE05_H_ROOT_DIR");
const sourceStl = requireEnv("PHASE05_H_SOURCE_STL");
const profilePath = requireEnv("PHASE05_H_PROFILE_PATH");
const slicerVersion = requireEnv("PHASE05_H_SLICER_VERSION");
const workerId = process.env.PHASE05_H_WORKER_ID || "wsl-worker-01";

const db = initDatabase(dbPath);

try {
  const filesDir = resolve(rootDir, "files");
  await mkdir(filesDir, { recursive: true, mode: 0o750 });

  const customerId = createTestCustomer(db);
  const sourceInfo = await stat(sourceStl);
  const sourceSha = await sha256File(sourceStl);
  const profileSha = await sha256File(profilePath);

  const order = createOrderWithFile(db, {
    customerId,
    customerName: "Phase05-H-A Synthetic TEST",
    phone: "13900000001",
    wechat: "phase05-h-a-test",
    email: "phase05-h-a@example.invalid",
    material: "PLA",
    color: "black",
    quantity: 1,
    estimatedPrice: 0,
    file: {
      filename: "test-cube-20mm.stl",
      filepath: "phase05-h-a/test-cube-20mm.stl",
      filesize: sourceInfo.size,
    },
  });

  const file = db.prepare("SELECT id, filename FROM files WHERE order_id = ? ORDER BY id DESC LIMIT 1").get(order.id);
  const localPath = join(filesDir, `${file.id}-synthetic-cube.stl`);
  await copyFile(sourceStl, localPath);
  const localSha = await sha256File(localPath);
  if (localSha !== sourceSha) throw new Error("copied STL SHA mismatch");

  const sync = db.prepare("SELECT id FROM local_file_sync_jobs WHERE file_id = ?").get(file.id);
  db.prepare(
    `UPDATE local_file_sync_jobs
     SET sync_status = 'verified',
         worker_id = ?,
         local_path = ?,
         local_sha256 = ?,
         local_synced_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(workerId, localPath, localSha, sync.id);

  const slicing = createSlicingJobForVerifiedFile(db, {
    fileSyncJobId: sync.id,
    fileId: file.id,
    profileKey: "bambu-p1s",
    profileVersion: "phase05-b",
    profileSha256: profileSha,
    sliceParams: {
      material: "PLA",
      printer_model: "Bambu Lab P1S",
      nozzle_diameter_microns: 400,
      layer_height_microns: 200,
      fill_density_percent: 50,
      support_mode: "none",
      brim_width_microns: 0,
    },
    requiredSlicerPackageVersion: slicerVersion,
    requiredParserVersion: PARSER_VERSION,
  });

  console.log(JSON.stringify({
    database_path: dbPath,
    root_dir: rootDir,
    customer_id: customerId,
    order_id: order.id,
    order_no: order.orderNo,
    file_id: file.id,
    file_size_bytes: sourceInfo.size,
    file_sha256: localSha,
    local_file_sync_job_id: sync.id,
    slicing_job_id: slicing.job.id,
    slicing_job_created: slicing.created,
    worker_id: workerId,
    profile_sha256: profileSha,
  }, null, 2));
} finally {
  db.close();
}

function createTestCustomer(db) {
  const existing = db.prepare("SELECT id FROM customers WHERE phone = ?").get("13900000001");
  if (existing) return existing.id;
  const result = db.prepare(
    `INSERT INTO customers (
      phone,
      password_hash,
      name,
      wechat,
      email,
      is_test_account
    ) VALUES (?, ?, ?, ?, ?, 1)`,
  ).run("13900000001", "phase05-h-a-test-hash", "Phase05-H-A TEST", "phase05-h-a-test", "phase05-h-a@example.invalid");
  return Number(result.lastInsertRowid);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
