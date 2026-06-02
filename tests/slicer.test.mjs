import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildPrusaSlicerArgs,
  getPrusaSlicerConfig,
  isPrusaSlicerEnabled,
  parseGcodeMetadata,
  runPrusaSlicer,
} from "../src/backend/slicer.ts";

test("parses PrusaSlicer G-code printing time and filament weight from tail comments", () => {
  const metadata = parseGcodeMetadata(`
; random gcode
; estimated printing time (normal mode) = 1h 23m 45s
; total filament used [g] = 42.6
`);

  assert.equal(metadata.printTimeSeconds, 5025);
  assert.equal(metadata.filamentWeightG, 42.6);
});

test("builds PrusaSlicer command as argument array without shell concatenation", () => {
  const args = buildPrusaSlicerArgs({
    inputFilePath: "/uploads/model.stl",
    gcodeFilePath: "/tmp/model.gcode",
    material: "PLA",
    layerHeight: 0.2,
    infillDensity: 50,
    needSupport: true,
    profilePath: "/app/profiles/bambu-p1s.ini",
  });

  assert.deepEqual(args, [
    "--export-gcode",
    "--load",
    "/app/profiles/bambu-p1s.ini",
    "--output",
    "/tmp/model.gcode",
    "--filament-type",
    "PLA",
    "--layer-height",
    "0.2",
    "--fill-density",
    "50%",
    "--support-material",
    "/uploads/model.stl",
  ]);
});

test("PrusaSlicer is disabled by default and refuses execution", async () => {
  const originalEnabled = process.env.PRUSASLICER_ENABLED;

  delete process.env.PRUSASLICER_ENABLED;

  try {
    const config = getPrusaSlicerConfig();

    assert.equal(config.enabled, false);
    assert.equal(config.bin, "prusa-slicer");
    assert.equal(config.profilePath, "/app/profiles/bambu-p1s.ini");
    assert.equal(config.timeoutSeconds, 120);
    assert.equal(config.maxConcurrency, 1);
    assert.equal(isPrusaSlicerEnabled(config), false);

    await assert.rejects(
      () =>
        runPrusaSlicer({
          inputFilePath: "/uploads/model.stl",
          gcodeFilePath: "/tmp/model.gcode",
          material: "PLA",
          config,
        }),
      /PrusaSlicer is disabled/,
    );
  } finally {
    if (originalEnabled == null) {
      delete process.env.PRUSASLICER_ENABLED;
    } else {
      process.env.PRUSASLICER_ENABLED = originalEnabled;
    }
  }
});
