#!/usr/bin/env node
import { resolve } from "node:path";

import {
  PARSER_VERSION,
  parsePrusaSlicerGcode,
} from "../worker/prusaslicer-result-parser.mjs";

const [gcodeArgument] = process.argv.slice(2);
if (!gcodeArgument) {
  throw new Error("usage: node scripts/phase06-verify-local-gcode.mjs <gcode-path>");
}

const allowedRoot = resolve("/srv/make3d-worker/results/orders");
const gcodePath = resolve(gcodeArgument);
if (gcodePath !== allowedRoot && !gcodePath.startsWith(`${allowedRoot}/`)) {
  throw new Error("G-code path must stay inside /srv/make3d-worker/results/orders");
}

const parsed = await parsePrusaSlicerGcode(gcodePath, {
  allowedRoots: [allowedRoot],
  parserVersion: PARSER_VERSION,
  sliceParams: {
    material: "PLA",
    printer_model: "Bambu Lab P1S",
    nozzle_diameter_microns: 400,
    layer_height_microns: 200,
    fill_density_percent: 50,
    support_mode: "none",
    brim_width_microns: 0,
  },
  input: {
    file_id: 46,
    filename: "masked-order-model.stl",
    path: null,
    sha256: "92bd7880b5dc3c321c4ecafb6e2da034f64fd82274400e78e799258161219ac3",
    size_bytes: 144484,
    dimensions: { x_mm: 116, y_mm: 83.0754165649414, z_mm: 230 },
  },
  slicer: {
    name: "PrusaSlicer",
    package_version: "2.7.2+dfsg-1build2",
    binary_path: "/usr/bin/prusa-slicer",
    profile_path: "/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini",
    profile_sha256: "7953997131a3d18245b4a9b25af7853846cf7026a097077b387650c947a21706",
  },
  slice: {
    started_at: "2026-07-18T13:48:31.018Z",
    finished_at: "2026-07-18T13:48:34.802Z",
    duration_ms: 3784,
    exit_code: 0,
  },
});

const evidence = {
  parser_version: parsed.parse.parser_version,
  parse_status: parsed.parse.status,
  metrics_status: parsed.validation.metrics_status,
  quote_ready: parsed.validation.quote_ready,
  print_time_seconds: parsed.result.print_time_seconds,
  filament_weight_mg: parsed.result.filament_weight_mg,
  dimensions: parsed.result.dimensions,
  gcode_size_bytes: parsed.result.gcode_size_bytes,
  gcode_sha256: parsed.result.gcode_sha256,
  metric_sources: parsed.metric_sources,
  warnings: parsed.parse.warnings,
};

if (evidence.parse_status !== "parsed"
  || evidence.metrics_status !== "ok"
  || evidence.quote_ready !== true
  || !(evidence.print_time_seconds > 0)
  || !(evidence.filament_weight_mg > 0)
  || !(evidence.gcode_size_bytes > 0)) {
  throw new Error(`G-code verification did not produce complete metrics: ${JSON.stringify(evidence)}`);
}

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
