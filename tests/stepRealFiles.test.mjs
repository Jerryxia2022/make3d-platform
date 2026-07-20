import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { join, resolve } from "node:path";

const fixtureRoot = process.env.MAKE3D_STEP_REGRESSION_DIR;

test("controlled 04NF13 and 04NF14 STEP files convert, heal, slice, and quote", {
  skip: fixtureRoot ? false : "private STEP fixtures are not present in the public repository",
  timeout: 300_000,
}, async () => {
  const result = await runValidation([
    join(fixtureRoot, "04NF13.step"),
    join(fixtureRoot, "04NF14.step"),
  ]);
  assert.equal(result.results.length, 2);

  const byName = new Map(result.results.map((item) => [item.filename, item]));
  assert.equal(byName.get("04NF13.step").sourceSha256, "69f6108bada07a1f6698300c13b1db23fd53ab5127e5b257566bf464d281e290");
  assert.equal(byName.get("04NF14.step").sourceSha256, "dfe4fa136edb66ab7be7edf61785c3914369c99e9e7810511b209626fbf4fef3");

  for (const item of byName.values()) {
    assert.deepEqual(item.conversion.dimensionRatios, { x: 1, y: 1, z: 1 });
    assert.equal(item.stepMetadata.unit, "mm");
    assert.equal(item.stepMetadata.solidCount, 1);
    assert.equal(item.mesh.componentCount, 1);
    assert.ok(item.mesh.triangleCount > 0);
    assert.ok(Object.values(item.mesh.dimensions).every((value) => value > 0));
    assert.equal(item.mesh.degenerateTriangleCount, 0);
    assert.equal(item.mesh.boundaryEdgeCount, 0);
    assert.equal(item.mesh.nonManifoldEdgeCount, 0);
    assert.ok(item.gcodeSizeBytes > 0);
    assert.match(item.gcodeSha256, /^[a-f0-9]{64}$/);
    assert.ok(item.filamentWeightG > 0);
    assert.ok(item.printTimeSeconds > 0);
    assert.ok(item.quote.estimatedPrice > 0);
  }
});

function runValidation(paths) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [
      "--experimental-strip-types",
      resolve("scripts/phase08-validate-step-quote.mjs"),
      ...paths,
    ], { cwd: resolve("."), shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`STEP validation exited ${code}: ${stderr.slice(0, 2000)}`));
      else resolvePromise(JSON.parse(stdout));
    });
  });
}
