import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { NextResponse } from "next/server";
import { calculateAutoFilePrice } from "@/backend/autoPricing";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import { getPrusaSlicerConfig, runPrusaSlicer } from "@/backend/slicer";
import { saveUploadFile } from "@/backend/uploads";

export const runtime = "nodejs";

const LAYER_HEIGHT = 0.2;
const INFILL_DENSITY = 50;
const PARSE_FAILURE_MESSAGE = "计算失败，需人工确认";

let sliceQueue: Promise<void> = Promise.resolve();

type QuoteSliceResponse = {
  success: boolean;
  message: string;
  result?: {
    filament_weight_g: number;
    print_time_seconds: number;
    raw_filament_used_mm: number | null;
    raw_filament_used_cm3: number | null;
    raw_filament_used_g: number | null;
    filament_weight_source: string | null;
    material_density: number | null;
    material_fee: number;
    time_fee: number;
    base_print_price: number;
  };
  error?: string;
};

export async function POST(request: Request) {
  try {
    if (!getCustomerFromRequestCookie(request)) {
      return jsonResponse({ success: false, message: "请先登录后使用在线报价功能。", error: "Unauthorized" }, 401);
    }

    const formData = await request.formData();
    const file = formData.get("modelFile");
    const material = getString(formData, "material") || "PLA";

    if (!(file instanceof File) || file.size <= 0) {
      return jsonResponse({ success: false, message: "计算失败，需人工确认", error: "No file" }, 400);
    }

    if (!file.name.toLowerCase().endsWith(".stl")) {
      return jsonResponse({
        success: false,
        message: "需人工确认",
        error: "Only STL files support automatic slicing",
      }, 400);
    }

    const slicerConfig = getPrusaSlicerConfig();

    if (!slicerConfig.enabled) {
      return jsonResponse({
        success: false,
        message: "计算失败，需人工确认",
        error: "PrusaSlicer disabled",
      }, 400);
    }

    if (!(await fileExists(slicerConfig.profilePath))) {
      return jsonResponse({
        success: false,
        message: "计算失败，需人工确认",
        error: `Profile not found: ${slicerConfig.profilePath}`,
      }, 400);
    }

    const savedFile = await saveUploadFile(file);
    const gcodeFilePath = createQuoteGcodeFilePath(savedFile.filename);
    await mkdir(dirname(gcodeFilePath), { recursive: true });
    const metadata = await enqueueSlice(() =>
      runPrusaSlicer({
        inputFilePath: savedFile.filepath,
        gcodeFilePath,
        material,
        layerHeight: LAYER_HEIGHT,
        infillDensity: INFILL_DENSITY,
        needSupport: false,
        config: slicerConfig,
      }),
    );

    if (metadata.filamentWeightG == null || metadata.printTimeSeconds == null) {
      return jsonResponse({
        success: false,
        message: PARSE_FAILURE_MESSAGE,
        error: "G-code metadata parse failed",
      }, 422);
    }

    const price = calculateAutoFilePrice({
      material,
      filamentWeightG: metadata.filamentWeightG,
      printTimeSeconds: metadata.printTimeSeconds,
      packagingFee: 0,
    });

    return jsonResponse({
      success: true,
      message: "已完成",
      result: {
        filament_weight_g: metadata.filamentWeightG,
        print_time_seconds: metadata.printTimeSeconds,
        raw_filament_used_mm: metadata.rawFilamentUsedMm,
        raw_filament_used_cm3: metadata.rawFilamentUsedCm3,
        raw_filament_used_g: metadata.rawFilamentUsedG,
        filament_weight_source: metadata.filamentWeightSource,
        material_density: metadata.materialDensity,
        material_fee: price.materialFee,
        time_fee: price.laborFee,
        base_print_price: price.estimatedPrice,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(
      {
        success: false,
        message: PARSE_FAILURE_MESSAGE,
        error: message,
      },
      400,
    );
  }
}

function enqueueSlice<T>(task: () => Promise<T>) {
  const nextTask = sliceQueue.then(task, task);
  sliceQueue = nextTask.then(
    () => undefined,
    () => undefined,
  );
  return nextTask;
}

function createQuoteGcodeFilePath(filename: string) {
  const gcodeDir = process.env.GCODE_DIR || join(process.cwd(), "gcode");
  return join(gcodeDir, `quote-${filename}.gcode`);
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function jsonResponse(body: QuoteSliceResponse, status = 200) {
  return NextResponse.json(body, { status });
}

async function fileExists(path: string) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
