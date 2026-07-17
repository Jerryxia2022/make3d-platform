import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  openVerifiedFileDirectory,
  resolveInsideRoot,
  validateSafeRelativePath,
  verifyLocalFileMetadata,
  verifyLocalFileSha256,
} from "../worker/order-workbench/lib/localFiles.mjs";

test("local workbench rejects unsafe relative paths", () => {
  for (const value of [
    "",
    "/tmp/model.stl",
    "../model.stl",
    "a/../model.stl",
    "a\\model.stl",
    "a//model.stl",
    "a/%2e%2e/model.stl",
    "C:\\model.stl",
    "file:///tmp/model.stl",
    "https://example.test/model.stl",
    "srv/make3d-worker/files/model.stl",
    "safe/\0/model.stl",
  ]) {
    assert.equal(validateSafeRelativePath(value).ok, false, value);
  }
  assert.equal(validateSafeRelativePath("M3DTEST/1-model.stl").ok, true);
});

test("local workbench resolves paths inside root only", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-order-workbench-files-"));
  try {
    assert.equal(resolveInsideRoot(root, "order/file.stl").ok, true);
    assert.equal(resolveInsideRoot(root, "../outside.stl").ok, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local workbench verifies existence, size, and SHA", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-order-workbench-files-"));
  const content = "solid cube";
  const expectedSha = sha256(content);
  try {
    await mkdir(join(root, "M3DTEST"), { recursive: true });
    await writeFile(join(root, "M3DTEST", "1-model.stl"), content);
    const file = {
      relative_path: "M3DTEST/1-model.stl",
      expected_size_bytes: content.length,
      expected_sha256: expectedSha,
      sync_status: "verified",
    };

    const metadata = await verifyLocalFileMetadata(file, { rootDir: root });
    assert.equal(metadata.exists, true);
    assert.equal(metadata.size_matches, true);

    const verified = await verifyLocalFileSha256(file, { rootDir: root });
    assert.equal(verified.sha_matches, true);

    const mismatch = await verifyLocalFileSha256({ ...file, expected_sha256: "0".repeat(64) }, { rootDir: root });
    assert.equal(mismatch.sha_matches, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("open directory requires verified sync, matching size, and matching SHA", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-order-workbench-open-"));
  const content = "solid cube";
  const opened = [];
  try {
    await mkdir(join(root, "M3DTEST"), { recursive: true });
    await writeFile(join(root, "M3DTEST", "1-model.stl"), content);
    const file = {
      relative_path: "M3DTEST/1-model.stl",
      expected_size_bytes: content.length,
      expected_sha256: sha256(content),
      sync_status: "verified",
    };

    const result = await openVerifiedFileDirectory(file, {
      rootDir: root,
      openImpl: async (directory) => opened.push(directory),
    });
    assert.equal(result.ok, true);
    assert.equal(opened.length, 1);

    const unverified = await openVerifiedFileDirectory({ ...file, sync_status: "pending" }, {
      rootDir: root,
      openImpl: async (directory) => opened.push(directory),
    });
    assert.equal(unverified.ok, false);
    assert.equal(opened.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
