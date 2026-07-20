#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { calculateAutoFilePrice } from "../src/backend/autoPricing.ts";
import { convertStepToStl } from "../src/backend/modelConversion.ts";
import { inspectModelFile } from "../src/backend/modelFileValidation.ts";
import { runPrusaSlicer } from "../src/backend/slicer.ts";
import { inspectStlMesh } from "../src/backend/stlAnalysis.ts";

const inputPaths = process.argv.slice(2).map((value) => resolve(value));
if (inputPaths.length === 0) throw new Error("Provide one or more local STEP/STP paths");

const outputRoot = resolve(process.env.STEP_QUOTE_VALIDATION_ROOT || "tmp/phase08-step-regression/runtime");
const derivedDir = resolve(outputRoot, "derived");
const gcodeDir = resolve(outputRoot, "gcode");
await mkdir(derivedDir, { recursive: true });
await mkdir(gcodeDir, { recursive: true });

const repoRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, "$1:"));
const bridgePath = toWslPath(resolve(repoRoot, "scripts", "prusaslicer-wsl-bridge.sh"));
const config = {
  enabled: true,
  bin: "wsl.exe",
  commandPrefixArgs: ["-d", "Ubuntu-24.04", "--", "bash", bridgePath],
  pathMode: "wsl",
  profilePath: resolve(repoRoot, "profiles", "bambu-p1s.ini"),
  timeoutSeconds: 120,
  maxConcurrency: 1,
};

const results = [];
for (const sourceFilepath of inputPaths) {
  const startedAt = Date.now();
  const sourceBuffer = await readFile(sourceFilepath);
  const source = inspectModelFile(basename(sourceFilepath), sourceBuffer, "application/step");
  const artifact = await convertStepToStl({
    sourceFilepath,
    sourceSha256: source.sourceSha256,
    config,
    derivedDir,
    toolVersion: "2.7.2+dfsg-1build2",
  });
  const replay = await convertStepToStl({
    sourceFilepath,
    sourceSha256: source.sourceSha256,
    config,
    derivedDir,
    toolVersion: "2.7.2+dfsg-1build2",
  });
  if (!replay.diagnostics.reusedExisting || replay.sha256 !== artifact.sha256) {
    throw new Error(`${basename(sourceFilepath)} did not reuse its verified derived artifact`);
  }

  const mesh = await inspectStlMesh(artifact.filepath);
  const gcodeFilePath = resolve(gcodeDir, `${source.sourceSha256}.gcode`);
  const metadata = await runPrusaSlicer({
    inputFilePath: artifact.filepath,
    gcodeFilePath,
    material: "PLA",
    metadataMaterial: "PETG",
    layerHeight: 0.2,
    infillDensity: 50,
    needSupport: false,
    bedShape: "0x0,320x0,320x320,0x320",
    center: "160,160",
    config,
  });
  if (metadata.filamentWeightG == null || metadata.printTimeSeconds == null) {
    throw new Error(`${basename(sourceFilepath)} generated G-code without weight or time metadata`);
  }
  const gcodeStat = await stat(gcodeFilePath);
  const gcodeBuffer = await readFile(gcodeFilePath);
  if (gcodeStat.size <= 0 || /<html/i.test(gcodeBuffer.subarray(0, 4096).toString("utf8"))) {
    throw new Error(`${basename(sourceFilepath)} generated an invalid G-code artifact`);
  }
  const quote = calculateAutoFilePrice({
    material: "PETG",
    filamentWeightG: metadata.filamentWeightG,
    printTimeSeconds: metadata.printTimeSeconds,
    packagingFee: 0,
  });

  results.push({
    filename: basename(sourceFilepath),
    sourcePath: sourceFilepath,
    sourceSizeBytes: sourceBuffer.length,
    sourceSha256: source.sourceSha256,
    sourceFormat: source.sourceFormat,
    validationDetail: source.validationDetail,
    stepMetadata: source.stepMetadata,
    converter: { name: artifact.toolName, version: artifact.toolVersion },
    conversion: artifact.diagnostics,
    derivedPath: artifact.filepath,
    derivedSizeBytes: artifact.filesize,
    derivedSha256: artifact.sha256,
    mesh,
    gcodePath: gcodeFilePath,
    gcodeSizeBytes: gcodeStat.size,
    gcodeSha256: createHash("sha256").update(gcodeBuffer).digest("hex"),
    filamentWeightG: metadata.filamentWeightG,
    printTimeSeconds: metadata.printTimeSeconds,
    rawFilamentUsedMm: metadata.rawFilamentUsedMm,
    rawFilamentUsedCm3: metadata.rawFilamentUsedCm3,
    rawFilamentUsedG: metadata.rawFilamentUsedG,
    quote,
    durationMs: Date.now() - startedAt,
  });
}

process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), outputRoot, results }, null, 2)}\n`);

function toWslPath(path) {
  const normalized = path.replaceAll("\\", "/");
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2]}` : normalized;
}
