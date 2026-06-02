import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("default Bambu P1S PrusaSlicer profile contains CLI-compatible baseline settings", async () => {
  const profile = await readSource("profiles/bambu-p1s.ini");

  assert.match(profile, /layer_height = 0\.2/);
  assert.match(profile, /nozzle_diameter = 0\.4/);
  assert.match(profile, /fill_density = 50%/);
  assert.match(profile, /support_material = 0/);
  assert.match(profile, /brim_width = 0/);
  assert.match(profile, /bed_shape = 0x0,256x0,256x256,0x256/);
  assert.match(profile, /printer_model = Bambu Lab P1S/);
});

test("README explains the PrusaSlicer profile is only for baseline estimates", async () => {
  const readme = await readSource("README.md");

  assert.match(readme, /profiles\/bambu-p1s\.ini/);
  assert.match(readme, /基础估价配置/);
  assert.match(readme, /不代表最终打印配置/);
});
