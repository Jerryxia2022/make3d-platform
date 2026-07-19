import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, extname, join, relative, resolve } from "node:path";

import { inspectModelFile } from "./modelFileValidation.ts";
import { formatPrusaSlicerPath, type PrusaSlicerConfig } from "./slicer.ts";

export type DerivedStlArtifact = {
  filepath: string;
  filename: string;
  filesize: number;
  sha256: string;
  toolName: "PrusaSlicer";
  toolVersion: string;
};

export function getDerivedModelDir() {
  return process.env.DERIVED_MODEL_DIR || join(process.cwd(), "derived-models");
}

export async function convertStepToStl(input: {
  sourceFilepath: string;
  sourceSha256: string;
  config: PrusaSlicerConfig;
  derivedDir?: string;
  toolVersion?: string;
}): Promise<DerivedStlArtifact> {
  if (![".step", ".stp"].includes(extname(input.sourceFilepath).toLowerCase())) {
    throw new Error("STEP conversion source must use .step or .stp");
  }
  if (!/^[a-f0-9]{64}$/i.test(input.sourceSha256)) {
    throw new Error("STEP conversion source SHA-256 is invalid");
  }

  const root = resolve(input.derivedDir || getDerivedModelDir());
  await mkdir(root, { recursive: true, mode: 0o750 });
  const filename = `${input.sourceSha256.toLowerCase()}.preview.stl`;
  const filepath = resolve(root, filename);
  if (filepath !== join(root, filename) || basename(filepath) !== filename) {
    throw new Error("Derived STL path is outside the configured root");
  }

  const existing = await inspectDerivedStl(filepath).catch(() => null);
  if (existing) {
    return { ...existing, toolName: "PrusaSlicer", toolVersion: input.toolVersion || "unknown" };
  }

  const temporaryPath = join(root, `${input.sourceSha256}.${randomUUID()}.part.stl`);
  try {
    await spawnWithTimeout(
      input.config.bin,
      [
        ...input.config.commandPrefixArgs,
        ...buildStepToStlArgs(
          formatPrusaSlicerPath(input.sourceFilepath, input.config.pathMode),
          formatPrusaSlicerPath(temporaryPath, input.config.pathMode),
        ),
      ],
      input.config.timeoutSeconds * 1000,
    );
    const artifact = await inspectDerivedStl(temporaryPath);
    await chmod(temporaryPath, 0o640);
    await rename(temporaryPath, filepath);
    return {
      ...artifact,
      filepath,
      filename,
      toolName: "PrusaSlicer",
      toolVersion: input.toolVersion || "unknown",
    };
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export function buildStepToStlArgs(sourceFilepath: string, outputFilepath: string) {
  return ["--export-stl", "--output", outputFilepath, sourceFilepath];
}

export async function validateDerivedStlArtifact(input: {
  filepath: string;
  filesize: number | null;
  sha256: string | null;
  derivedDir?: string;
}) {
  const root = resolve(input.derivedDir || getDerivedModelDir());
  const filepath = resolve(input.filepath);
  const relativePath = relative(root, filepath);
  if (!relativePath || relativePath.startsWith("..") || resolve(root, relativePath) !== filepath) {
    throw new Error("Derived STL path is outside the configured root");
  }
  const artifact = await inspectDerivedStl(filepath);
  if (input.filesize != null && artifact.filesize !== input.filesize) {
    throw new Error("Derived STL size verification failed");
  }
  if (input.sha256 && artifact.sha256 !== input.sha256.toLowerCase()) {
    throw new Error("Derived STL SHA-256 verification failed");
  }
  return artifact;
}

async function inspectDerivedStl(filepath: string) {
  const fileStat = await stat(filepath);
  if (!fileStat.isFile() || fileStat.size <= 0) throw new Error("Derived STL is missing or empty");
  const buffer = await readFile(filepath);
  const inspection = inspectModelFile(filepath, buffer);
  if (inspection.sourceFormat !== "STL") throw new Error("Derived model is not STL");
  return {
    filepath,
    filename: basename(filepath),
    filesize: fileStat.size,
    sha256: inspection.sourceSha256,
  };
}

function spawnWithTimeout(command: string, args: string[], timeoutMs: number) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`STEP conversion timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      if (stderr.length < 16_384) stderr += String(chunk).slice(0, 16_384 - stderr.length);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      finish(code === 0 ? undefined : new Error(`STEP conversion failed with code ${code}: ${stderr.trim()}`));
    });
  });
}
