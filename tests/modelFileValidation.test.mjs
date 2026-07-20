import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getModelSourceFormat,
  inspectStepPart21Metadata,
  inspectModelFile,
  validateStepPart21,
  validateStlContent,
} from "../src/backend/modelFileValidation.ts";

const asciiStl = Buffer.from(`solid cube
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 10 0 0
vertex 0 10 0
endloop
endfacet
endsolid cube
`);

const validStep = Buffer.from(`ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('fixture'),'1');
ENDSEC;
DATA;
#1=CARTESIAN_POINT('',(0.,0.,0.));
ENDSEC;
END-ISO-10303-21;
`);

test("model extensions are case-insensitive and distinguish STL from STEP", () => {
  assert.equal(getModelSourceFormat("part.STL"), "STL");
  assert.equal(getModelSourceFormat("part.STEP"), "STEP");
  assert.equal(getModelSourceFormat("part.StP"), "STEP");
  assert.equal(getModelSourceFormat("part.obj"), null);
});

test("validates ASCII STL and STEP Part 21 content and records source SHA", () => {
  assert.equal(validateStlContent(asciiStl), "STL_ASCII");
  assert.equal(validateStepPart21(validStep), "STEP_PART21");
  const inspected = inspectModelFile("04NF12.STEP", validStep, "application/step");
  assert.equal(inspected.sourceFormat, "STEP");
  assert.match(inspected.sourceSha256, /^[a-f0-9]{64}$/);
});

test("STEP Part 21 diagnostics identify schema, units, solids, shells, and surfaces", () => {
  const source = Buffer.from(`ISO-10303-21;
HEADER;
FILE_SCHEMA (('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
#1=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));
#2=ADVANCED_FACE('',(),#3,.T.);
#3=B_SPLINE_SURFACE_WITH_KNOTS('',1,1,(),.UNSPECIFIED.,.F.,.F.,.F.,(),(),.UNSPECIFIED.);
#4=CLOSED_SHELL('',(#2));
#5=MANIFOLD_SOLID_BREP('body',#4);
ENDSEC;
END-ISO-10303-21;
`);
  const metadata = inspectStepPart21Metadata(source);
  assert.equal(metadata.schema, "AUTOMOTIVE_DESIGN");
  assert.equal(metadata.unit, "mm");
  assert.equal(metadata.solidCount, 1);
  assert.equal(metadata.closedShellCount, 1);
  assert.equal(metadata.openShellCount, 0);
  assert.equal(metadata.advancedFaceCount, 1);
  assert.equal(metadata.bSplineSurfaceCount, 1);
  assert.equal(inspectModelFile("part.stp", source).stepMetadata?.unit, "mm");
});

test("rejects extension-content mismatch, malformed Part 21, null bytes, and MIME mismatch", () => {
  assert.throws(() => inspectModelFile("fake.step", asciiStl), /ISO-10303-21/);
  assert.throws(() => inspectModelFile("fake.stl", validStep), /STL/);
  assert.throws(() => validateStepPart21(Buffer.from("ISO-10303-21;\0DATA;")), /空字符/);
  assert.throws(() => validateStepPart21(Buffer.from("ISO-10303-21; HEADER; DATA; END-ISO-10303-21;")), /实体/);
  assert.throws(() => inspectModelFile("part.step", validStep, "image/png"), /MIME/);
});
