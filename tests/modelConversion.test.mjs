import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildStepToStlArgs,
  convertStepToStl,
  parsePrusaSlicerModelInfo,
  validateStepConversionGeometry,
  validateDerivedStlArtifact,
} from "../src/backend/modelConversion.ts";

const validStl = `solid preview
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 10 0 0
vertex 0 10 0
endloop
endfacet
endsolid preview
`;

test("STEP conversion arguments remain an explicit shell-free argument list", () => {
  assert.deepEqual(
    buildStepToStlArgs("/safe/input.step", "/safe/output.stl"),
    ["--export-stl", "--output", "/safe/output.stl", "/safe/input.step"],
  );
});

test("PrusaSlicer model diagnostics preserve STEP dimensions and detect entity loss or scaling", () => {
  const source = parsePrusaSlicerModelInfo(`[part.step]
size_x = 138.000000
size_y = 60.000000
size_z = 174.000000
number_of_facets = 65710
manifold = no
open_edges = 2
number_of_parts = 1
volume = 366961.343750
`);
  const derived = parsePrusaSlicerModelInfo(`[part.stl]
size_x = 138.000000
size_y = 60.000000
size_z = 174.000000
number_of_facets = 65708
manifold = yes
degenerate_facets = 2
facets_removed = 2
number_of_parts = 1
volume = 366967.593750
`);

  assert.deepEqual(validateStepConversionGeometry(source, derived), { x: 1, y: 1, z: 1 });
  assert.equal(source.openEdgeCount, 2);
  assert.equal(derived.degenerateFacetCount, 2);
  assert.equal(derived.removedFacetCount, 2);
  assert.throws(
    () => validateStepConversionGeometry(source, { ...derived, dimensions: { ...derived.dimensions, x: 1380 } }),
    /尺寸异常/,
  );
  assert.throws(
    () => validateStepConversionGeometry({ ...source, partCount: 2 }, derived),
    /实体数量减少/,
  );
});

test("derived STL verification enforces root, size, and SHA", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-derived-"));
  const inside = join(root, "inside");
  const outside = join(root, "outside.stl");
  await mkdir(inside);
  const filepath = join(inside, "preview.stl");
  await writeFile(filepath, validStl);
  await writeFile(outside, validStl);
  try {
    const artifact = await validateDerivedStlArtifact({ filepath, filesize: null, sha256: null, derivedDir: inside });
    assert.equal(artifact.filesize, Buffer.byteLength(validStl));
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
    await assert.rejects(
      () => validateDerivedStlArtifact({ filepath: outside, filesize: null, sha256: null, derivedDir: inside }),
      /outside the configured root/,
    );
    await assert.rejects(
      () => validateDerivedStlArtifact({ filepath, filesize: artifact.filesize + 1, sha256: artifact.sha256, derivedDir: inside }),
      /size verification failed/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP conversion atomically publishes once and removes partial output after failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "make3d-step-conversion-"));
  const sourcePath = join(root, "part.step");
  const derivedDir = join(root, "derived");
  const toolPath = join(root, "fake-prusa.mjs");
  const failingToolPath = join(root, "fake-prusa-fail.mjs");
  await mkdir(derivedDir);
  await writeFile(sourcePath, "ISO-10303-21;\nHEADER;\nDATA;\n#1=CARTESIAN_POINT('',(0.,0.,0.));\nENDSEC;\nEND-ISO-10303-21;\n");
  await writeFile(toolPath, fakePrusaSource({ failConversion: false }));
  await writeFile(failingToolPath, fakePrusaSource({ failConversion: true }));
  const baseConfig = {
    enabled: true,
    bin: process.execPath,
    profilePath: "",
    timeoutSeconds: 5,
    maxConcurrency: 1,
    pathMode: "native",
  };

  try {
    const artifact = await convertStepToStl({
      sourceFilepath: sourcePath,
      sourceSha256: "a".repeat(64),
      config: { ...baseConfig, commandPrefixArgs: [toolPath] },
      derivedDir,
      toolVersion: "fake-1",
    });
    assert.equal(artifact.diagnostics.reusedExisting, false);
    const replay = await convertStepToStl({
      sourceFilepath: sourcePath,
      sourceSha256: "a".repeat(64),
      config: { ...baseConfig, commandPrefixArgs: [toolPath] },
      derivedDir,
      toolVersion: "fake-1",
    });
    assert.equal(replay.diagnostics.reusedExisting, true);
    assert.equal(replay.sha256, artifact.sha256);

    await assert.rejects(
      () => convertStepToStl({
        sourceFilepath: sourcePath,
        sourceSha256: "b".repeat(64),
        config: { ...baseConfig, commandPrefixArgs: [failingToolPath] },
        derivedDir,
      }),
      /退出码 9/,
    );
    assert.equal((await readdir(derivedDir)).some((name) => name.endsWith(".part.stl")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function fakePrusaSource({ failConversion }) {
  return `import { writeFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args[0] === "--info") {
  console.log("size_x = 10\\nsize_y = 10\\nsize_z = 10\\nnumber_of_facets = 1\\nmanifold = yes\\nnumber_of_parts = 1\\nvolume = 1000");
  process.exit(0);
}
const output = args[args.indexOf("--output") + 1];
writeFileSync(output, ${JSON.stringify(validStl)});
process.exit(${failConversion ? 9 : 0});
`;
}
