#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve("tests/fixtures/prusaslicer/20mm-cube.stl");
const stl = `solid make3d_phase06_20mm_cube
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 20 20 0
      vertex 20 0 0
    endloop
  endfacet
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 0 20 0
      vertex 20 20 0
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 20
      vertex 20 0 20
      vertex 20 20 20
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 0 20
      vertex 20 20 20
      vertex 0 20 20
    endloop
  endfacet
  facet normal 0 -1 0
    outer loop
      vertex 0 0 0
      vertex 20 0 0
      vertex 20 0 20
    endloop
  endfacet
  facet normal 0 -1 0
    outer loop
      vertex 0 0 0
      vertex 20 0 20
      vertex 0 0 20
    endloop
  endfacet
  facet normal 1 0 0
    outer loop
      vertex 20 0 0
      vertex 20 20 0
      vertex 20 20 20
    endloop
  endfacet
  facet normal 1 0 0
    outer loop
      vertex 20 0 0
      vertex 20 20 20
      vertex 20 0 20
    endloop
  endfacet
  facet normal 0 1 0
    outer loop
      vertex 20 20 0
      vertex 0 20 0
      vertex 0 20 20
    endloop
  endfacet
  facet normal 0 1 0
    outer loop
      vertex 20 20 0
      vertex 0 20 20
      vertex 20 20 20
    endloop
  endfacet
  facet normal -1 0 0
    outer loop
      vertex 0 20 0
      vertex 0 0 0
      vertex 0 0 20
    endloop
  endfacet
  facet normal -1 0 0
    outer loop
      vertex 0 20 0
      vertex 0 0 20
      vertex 0 20 20
    endloop
  endfacet
endsolid make3d_phase06_20mm_cube
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, stl, "utf8");
const sha256 = createHash("sha256").update(stl).digest("hex");
console.log(`${outputPath} ${sha256}`);
