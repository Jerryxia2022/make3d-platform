import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  ensureLocalFilesRoot,
  openVerifiedFileDirectory,
  resolveInsideRoot,
  validateSafeRelativePath,
  verifyLocalFileMetadata,
  verifyLocalFileSha256,
} from "../worker/order-workbench/lib/localFiles.mjs";

test("local workbench creates the configured files root", async () => {
  const parent = await mkdtemp(join(tmpdir(), "make3d-order-workbench-root-"));
  const root = join(parent, "orders");
  try {
    assert.equal(await ensureLocalFilesRoot(root), root);
    const metadata = await verifyLocalFileMetadata({ relative_path: "missing/file.stl" }, { rootDir: root });
    assert.equal(metadata.error, "not-found");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

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

test("local workbench rejects a symlink that escapes the configured root", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "make3d-order-workbench-symlink-root-"));
  const outside = await mkdtemp(join(tmpdir(), "make3d-order-workbench-symlink-outside-"));
  try {
    await mkdir(join(root, "M3DTEST"), { recursive: true });
    const outsideFile = join(outside, "outside.stl");
    await writeFile(outsideFile, "solid outside");
    try {
      await symlink(outsideFile, join(root, "M3DTEST", "escape.stl"));
    } catch {
      t.skip("symlink creation is unavailable on this filesystem");
      return;
    }
    const result = await verifyLocalFileMetadata({
      relative_path: "M3DTEST/escape.stl",
      expected_size_bytes: 13,
    }, { rootDir: root });
    assert.equal(result.exists, false);
    assert.equal(result.error, "root-escape");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
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

test("Windows Explorer opener matches canonical location and verifies foreground HWND", async () => {
  const source = await readFile(new URL("../worker/order-workbench/open-directory.ps1", import.meta.url), "utf8");
  for (const symbol of ["LocationURL", "Document.Folder.Self.Path", "IsIconic", "ShowWindowAsync", "BringWindowToTop", "SetForegroundWindow", "GetForegroundWindow", "SetWindowPos"]) {
    assert.match(source, new RegExp(symbol.replaceAll(".", "\\.")));
  }
  assert.match(source, /\[IntPtr\]\(-1\)/, "must briefly set HWND_TOPMOST");
  assert.match(source, /\[IntPtr\]\(-2\)/, "must immediately restore HWND_NOTOPMOST");
  assert.match(source, /topmostResult/);
  assert.match(source, /notTopmostResult/);
  assert.match(source, /foregroundHwndBefore/);
  assert.match(source, /directory-focused/);
  assert.match(source, /directory-opened-not-focused/);
  assert.doesNotMatch(source, /LocationName|window\.Name/i);
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
