import assert from "node:assert/strict";
import { test } from "node:test";

import { loadWorkbenchConfig } from "../worker/order-workbench/lib/config.mjs";

test("LOCAL_ORDER_FILES_ROOT configures the persistent order files root", () => {
  const config = loadWorkbenchConfig({
    MAKE3D_SERVER_URL: "https://make3d.test",
    MAKE3D_LOCAL_WORKBENCH_TOKEN: "test-token",
    LOCAL_ORDER_FILES_ROOT: "/srv/make3d-worker/files-custom",
    MAKE3D_LOCAL_FILES_ROOT: "/srv/make3d-worker/files-legacy",
  });
  assert.equal(config.localFilesRoot, "/srv/make3d-worker/files-custom");
});

test("legacy files root remains compatible when the preferred variable is absent", () => {
  const config = loadWorkbenchConfig({
    MAKE3D_SERVER_URL: "https://make3d.test",
    MAKE3D_LOCAL_WORKBENCH_TOKEN: "test-token",
    MAKE3D_LOCAL_FILES_ROOT: "/srv/make3d-worker/files-legacy",
  });
  assert.equal(config.localFilesRoot, "/srv/make3d-worker/files-legacy");
});
