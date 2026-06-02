import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

export type PrusaSlicerConfig = {
  enabled: boolean;
  bin: string;
  profilePath: string;
  timeoutSeconds: number;
  maxConcurrency: number;
};

export type PrusaSlicerJobInput = {
  inputFilePath: string;
  gcodeFilePath: string;
  material: string;
  layerHeight?: number;
  infillDensity?: number;
  needSupport?: boolean;
  profilePath?: string;
};

export type RunPrusaSlicerInput = PrusaSlicerJobInput & {
  config?: PrusaSlicerConfig;
};

export function getPrusaSlicerConfig(env: NodeJS.ProcessEnv = process.env): PrusaSlicerConfig {
  return {
    enabled: env.PRUSASLICER_ENABLED === "true",
    bin: env.PRUSASLICER_BIN || "prusa-slicer",
    profilePath: env.PRUSASLICER_PROFILE_PATH || "/app/profiles/bambu-p1s.ini",
    timeoutSeconds: parsePositiveInteger(env.SLICE_TIMEOUT_SECONDS, 120),
    maxConcurrency: parsePositiveInteger(env.MAX_SLICE_CONCURRENCY, 1),
  };
}

export function isPrusaSlicerEnabled(config = getPrusaSlicerConfig()) {
  return config.enabled;
}

export function buildPrusaSlicerArgs(input: PrusaSlicerJobInput) {
  const args = [
    "--export-gcode",
    "--load",
    input.profilePath || getPrusaSlicerConfig().profilePath,
    "--output",
    input.gcodeFilePath,
    "--filament-type",
    input.material,
    "--layer-height",
    String(input.layerHeight ?? 0.2),
    "--fill-density",
    `${input.infillDensity ?? 50}%`,
  ];

  if (input.needSupport) {
    args.push("--support-material");
  }

  args.push(input.inputFilePath);

  return args;
}

export async function runPrusaSlicer(input: RunPrusaSlicerInput) {
  const config = input.config || getPrusaSlicerConfig();

  if (!config.enabled) {
    throw new Error("PrusaSlicer is disabled");
  }

  const args = buildPrusaSlicerArgs({
    ...input,
    profilePath: input.profilePath || config.profilePath,
  });

  await spawnWithTimeout(config.bin, args, config.timeoutSeconds * 1000);

  const gcode = await readFile(input.gcodeFilePath, "utf8");
  return parseGcodeMetadata(gcode);
}

export function parseGcodeMetadata(gcode: string) {
  const tail = gcode.slice(-20000);
  const timeMatch = tail.match(/estimated printing time(?:\s*\([^)]+\))?\s*=\s*([^\n\r]+)/i);
  const weightMatch = tail.match(/(?:total\s+)?filament used\s*\[g\]\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);

  return {
    printTimeSeconds: timeMatch ? parsePrintingTimeSeconds(timeMatch[1]) : null,
    filamentWeightG: weightMatch ? Number(weightMatch[1]) : null,
  };
}

export function parsePrintingTimeSeconds(value: string) {
  const normalized = value.trim().toLowerCase();
  const hours = readTimePart(normalized, "h");
  const minutes = readTimePart(normalized, "m");
  const seconds = readTimePart(normalized, "s");

  return hours * 3600 + minutes * 60 + seconds;
}

function readTimePart(value: string, unit: "h" | "m" | "s") {
  const match = value.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}`));
  return match ? Number(match[1]) : 0;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function spawnWithTimeout(command: string, args: string[], timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`PrusaSlicer timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `PrusaSlicer exited with code ${code}`));
    });
  });
}
