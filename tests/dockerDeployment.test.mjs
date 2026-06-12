import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("docker compose mounts slicer profile and gcode directories", async () => {
  const compose = await readSource("docker-compose.yml");

  assert.match(compose, /- \.\/profiles:\/app\/profiles/);
  assert.match(compose, /- \.\/gcode:\/app\/gcode/);
});

test("docker build receives public ICP filing environment", async () => {
  const compose = await readSource("docker-compose.yml");
  const dockerfile = await readSource("Dockerfile");

  assert.match(compose, /args:/);
  assert.match(compose, /NEXT_PUBLIC_ICP_BEIAN: \$\{NEXT_PUBLIC_ICP_BEIAN:-\}/);
  assert.match(compose, /environment:/);
  assert.match(dockerfile, /ARG NEXT_PUBLIC_ICP_BEIAN=/);
  assert.match(dockerfile, /ENV NEXT_PUBLIC_ICP_BEIAN=\$\{NEXT_PUBLIC_ICP_BEIAN\}/);
});

test("docker compose passes optional wechat official account runtime environment", async () => {
  const compose = await readSource("docker-compose.yml");

  assert.match(compose, /WECHAT_MP_ENABLED: \$\{WECHAT_MP_ENABLED:-false\}/);
  assert.match(compose, /WECHAT_MP_APP_ID: \$\{WECHAT_MP_APP_ID:-\}/);
  assert.match(compose, /WECHAT_MP_APP_SECRET: \$\{WECHAT_MP_APP_SECRET:-\}/);
  assert.match(compose, /WECHAT_MP_TOKEN: \$\{WECHAT_MP_TOKEN:-\}/);
  assert.match(compose, /WECHAT_MP_AES_KEY: \$\{WECHAT_MP_AES_KEY:-\}/);
});

test("Dockerfile creates runtime slicer profile and gcode directories", async () => {
  const dockerfile = await readSource("Dockerfile");

  assert.match(dockerfile, /mkdir -p \/app\/data \/app\/uploads \/app\/profiles \/app\/gcode/);
});

test("README documents profile volume mount path inside the container", async () => {
  const readme = await readSource("README.md");

  assert.match(readme, /profiles\/bambu-p1s\.ini/);
  assert.match(readme, /\/app\/profiles\/bambu-p1s\.ini/);
  assert.match(readme, /\.\/profiles:\/app\/profiles/);
  assert.match(readme, /\.\/gcode:\/app\/gcode/);
});
