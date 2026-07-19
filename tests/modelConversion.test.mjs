import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildStepToStlArgs,
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
