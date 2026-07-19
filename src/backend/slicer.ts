import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

export type PrusaSlicerConfig = {
  enabled: boolean;
  bin: string;
  commandPrefixArgs: string[];
  pathMode: "native" | "wsl";
  profilePath: string;
  timeoutSeconds: number;
  maxConcurrency: number;
};

export type PrusaSlicerJobInput = {
  inputFilePath: string;
  gcodeFilePath: string;
  material: string;
  metadataMaterial?: string;
  layerHeight?: number;
  infillDensity?: number;
  needSupport?: boolean;
  profilePath?: string;
  bedShape?: string;
  center?: string;
};

export type RunPrusaSlicerInput = PrusaSlicerJobInput & {
  config?: PrusaSlicerConfig;
};

export type GcodeMetadata = {
  printTimeSeconds: number | null;
  filamentWeightG: number | null;
  rawFilamentUsedMm: number | null;
  rawFilamentUsedCm3: number | null;
  rawFilamentUsedG: number | null;
  filamentWeightSource: "mm" | "cm3" | "g" | null;
  materialDensity: number;
};

const FILAMENT_DIAMETER_MM = 1.75;
const MATERIAL_DENSITIES: Record<string, number> = {
  PLA: 1.24,
  PETG: 1.27,
  ABS: 1.04,
};

export function getPrusaSlicerConfig(env: NodeJS.ProcessEnv = process.env): PrusaSlicerConfig {
  return {
    enabled: env.PRUSASLICER_ENABLED === "true",
    bin: env.PRUSASLICER_BIN || "prusa-slicer",
    commandPrefixArgs: parseCommandPrefixArgs(env.PRUSASLICER_COMMAND_PREFIX_ARGS_JSON),
    pathMode: env.PRUSASLICER_PATH_MODE === "wsl" ? "wsl" : "native",
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

  if (input.bedShape) {
    args.push("--bed-shape", input.bedShape);
  }

  if (input.center) {
    args.push("--center", input.center);
  }

  args.push(input.inputFilePath);

  return args;
}

export async function runPrusaSlicer(input: RunPrusaSlicerInput) {
  const config = input.config || getPrusaSlicerConfig();

  if (!config.enabled) {
    throw new Error("PrusaSlicer is disabled");
  }

  const args = [
    ...config.commandPrefixArgs,
    ...buildPrusaSlicerArgs({
      ...input,
      inputFilePath: formatPrusaSlicerPath(input.inputFilePath, config.pathMode),
      gcodeFilePath: formatPrusaSlicerPath(input.gcodeFilePath, config.pathMode),
      profilePath: formatPrusaSlicerPath(input.profilePath || config.profilePath, config.pathMode),
    }),
  ];

  await spawnWithTimeout(config.bin, args, config.timeoutSeconds * 1000);

  const gcode = await readFile(input.gcodeFilePath, "utf8");
  return parseGcodeMetadata(gcode, input.metadataMaterial || input.material);
}

export function formatPrusaSlicerPath(path: string, mode: PrusaSlicerConfig["pathMode"]) {
  return mode === "wsl" && /^[A-Za-z]:[\\/]/.test(path) ? path.replaceAll("\\", "/") : path;
}

function parseCommandPrefixArgs(value: string | undefined) {
  if (!value) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("PRUSASLICER_COMMAND_PREFIX_ARGS_JSON must be valid JSON");
  }

  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string" || item.includes("\0"))) {
    throw new Error("PRUSASLICER_COMMAND_PREFIX_ARGS_JSON must be a JSON string array");
  }

  return parsed;
}

export function parseGcodeMetadata(gcode: string, material = "PLA"): GcodeMetadata {
  const tail = gcode.slice(-20000);
  const timeMatch = tail.match(/estimated printing time(?:\s*\([^)]+\))?\s*=\s*([^\n\r]+)/i);
  const rawTotalFilamentUsedG = readTotalFilamentWeightG(tail);
  const rawDirectFilamentUsedG = readDirectFilamentWeightG(tail);
  const rawFilamentUsedG = rawTotalFilamentUsedG ?? rawDirectFilamentUsedG;
  const rawFilamentUsedCm3 = readFilamentValue(tail, "cm3");
  const rawFilamentUsedMm = readFilamentValue(tail, "mm");
  const materialDensity = getMaterialDensity(material);
  const { filamentWeightG, filamentWeightSource } = calculateFilamentWeight({
    materialDensity,
    rawDirectFilamentUsedG,
    rawFilamentUsedCm3,
    rawFilamentUsedMm,
    rawTotalFilamentUsedG,
  });

  return {
    printTimeSeconds: timeMatch ? parsePrintingTimeSeconds(timeMatch[1]) : null,
    filamentWeightG,
    rawFilamentUsedMm,
    rawFilamentUsedCm3,
    rawFilamentUsedG,
    filamentWeightSource,
    materialDensity,
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

function readFilamentValue(gcodeTail: string, unit: "mm" | "cm3") {
  const match = gcodeTail.match(
    new RegExp(`(?:total\\s+)?filament\\s+used\\s*\\[${unit}\\]\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)`, "i"),
  );

  return match ? Number(match[1]) : null;
}

function readTotalFilamentWeightG(gcodeTail: string) {
  const match = gcodeTail.match(
    /total\s+filament\s+used\s*\[g\]\s*=\s*([0-9]+(?:\.[0-9]+)?)/i,
  );

  return match ? Number(match[1]) : null;
}

function readDirectFilamentWeightG(gcodeTail: string) {
  for (const line of gcodeTail.split(/\r?\n/)) {
    if (/total\s+filament\s+used/i.test(line)) {
      continue;
    }

    const match = line.match(/filament\s+used\s*\[g\]\s*=\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function calculateFilamentWeight({
  materialDensity,
  rawDirectFilamentUsedG,
  rawFilamentUsedCm3,
  rawFilamentUsedMm,
  rawTotalFilamentUsedG,
}: {
  materialDensity: number;
  rawDirectFilamentUsedG: number | null;
  rawFilamentUsedCm3: number | null;
  rawFilamentUsedMm: number | null;
  rawTotalFilamentUsedG: number | null;
}) {
  if (rawFilamentUsedCm3 != null && rawFilamentUsedCm3 > 0) {
    return {
      filamentWeightG: roundWeight(rawFilamentUsedCm3 * materialDensity),
      filamentWeightSource: "cm3" as const,
    };
  }

  if (rawFilamentUsedMm != null && rawFilamentUsedMm > 0) {
    const volumeMm3 = rawFilamentUsedMm * Math.PI * (FILAMENT_DIAMETER_MM / 2) ** 2;
    const volumeCm3 = volumeMm3 / 1000;

    return {
      filamentWeightG: roundWeight(volumeCm3 * materialDensity),
      filamentWeightSource: "mm" as const,
    };
  }

  if (rawTotalFilamentUsedG != null && rawTotalFilamentUsedG > 0) {
    return {
      filamentWeightG: rawTotalFilamentUsedG,
      filamentWeightSource: "g" as const,
    };
  }

  if (rawDirectFilamentUsedG != null && rawDirectFilamentUsedG > 0) {
    return {
      filamentWeightG: rawDirectFilamentUsedG,
      filamentWeightSource: "g" as const,
    };
  }

  return {
    filamentWeightG: null,
    filamentWeightSource: null,
  };
}

function getMaterialDensity(material: string) {
  return MATERIAL_DENSITIES[String(material).toUpperCase()] ?? MATERIAL_DENSITIES.PLA;
}

function roundWeight(value: number) {
  return Math.round(value * 10000) / 10000;
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
