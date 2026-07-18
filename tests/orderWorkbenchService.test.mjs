import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const unitUrl = new URL("../worker/order-workbench/systemd/make3d-order-workbench.service.in", import.meta.url);
const installerUrl = new URL("../worker/order-workbench/install-service.sh", import.meta.url);
const readmeUrl = new URL("../worker/order-workbench/README.md", import.meta.url);

test("workbench systemd service is persistent, recoverable, and loopback-only", async () => {
  const source = await readFile(unitUrl, "utf8");
  assert.match(source, /^User=make3d-worker$/m);
  assert.match(source, /^EnvironmentFile=\/etc\/make3d-order-workbench\.env$/m);
  assert.match(source, /MAKE3D_ORDER_WORKBENCH_HOST=127\.0\.0\.1/);
  assert.match(source, /MAKE3D_ORDER_WORKBENCH_PORT=5177/);
  assert.match(source, /^Restart=on-failure$/m);
  assert.match(source, /^RestartSec=5$/m);
  assert.match(source, /^WantedBy=multi-user\.target$/m);
  assert.doesNotMatch(source, /0\.0\.0\.0/);
});

test("workbench installer preserves protected configuration and enables the service", async () => {
  const source = await readFile(installerUrl, "utf8");
  assert.match(source, /Required protected env file/);
  assert.match(source, /chmod 0640/);
  assert.match(source, /systemctl daemon-reload/);
  assert.match(source, /systemctl enable/);
  assert.doesNotMatch(source, /WORKER_TOKEN=|MAKE3D_LOCAL_WORKBENCH_TOKEN=/);
});

test("workbench README documents service operations and local address", async () => {
  const source = await readFile(readmeUrl, "utf8");
  assert.match(source, /http:\/\/127\.0\.0\.1:5177/);
  assert.match(source, /systemctl start make3d-order-workbench\.service/);
  assert.match(source, /systemctl stop make3d-order-workbench\.service/);
  assert.match(source, /journalctl -u make3d-order-workbench\.service/);
  assert.match(source, /real orders remain\s+read-only/i);
});
