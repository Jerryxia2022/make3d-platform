#!/usr/bin/env node
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

import { initDatabase } from "../src/backend/database.ts";

const allowedRoot = "/srv/make3d-worker/test-integration/phase05-h-b";
const dbPath = requireArg("--db");
const jobId = Number(requireArg("--job"));
const nowMs = Number(process.argv.includes("--now-ms") ? requireArg("--now-ms") : Date.now());

if (!Number.isSafeInteger(jobId) || jobId <= 0) throw new Error("--job must be a positive integer");
if (!Number.isSafeInteger(nowMs) || nowMs <= 0) throw new Error("--now-ms must be a positive integer");

const resolvedDb = resolve(dbPath);
const resolvedAllowed = resolve(allowedRoot);
const actualDb = await realpath(resolvedDb);
const actualAllowed = await realpath(resolvedAllowed);
if (!actualDb.startsWith(`${actualAllowed}/`)) {
  throw new Error(`refusing to modify database outside ${allowedRoot}`);
}

const expiredAt = Math.max(1, nowMs - 1);
const db = initDatabase(actualDb);
try {
  const result = db
    .prepare(
      `UPDATE slicing_jobs
       SET lock_expires_at_ms = ?,
           lease_expires_at_ms = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND status IN ('locked', 'slicing', 'sliced', 'parsing')`,
    )
    .run(expiredAt, expiredAt, jobId);
  db.prepare(
    `UPDATE slicing_job_attempts
     SET lease_expires_at_ms = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE slicing_job_id = ?
       AND status IN ('locked', 'slicing', 'sliced', 'parsing')`,
  ).run(expiredAt, jobId);

  if (result.changes !== 1) throw new Error("no active slicing job was expired");
  console.log(JSON.stringify({ database_path: actualDb, job_id: jobId, expired_at_ms: expiredAt }, null, 2));
} finally {
  db.close();
}

function requireArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`${name} is required`);
  return process.argv[index + 1];
}
