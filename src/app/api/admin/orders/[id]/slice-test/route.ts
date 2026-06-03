import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { NextResponse } from "next/server";
import { calculateAutoFilePrice } from "@/backend/autoPricing";
import {
  createSliceJob,
  getOrderById,
  openDatabase,
  updateSliceJobFailure,
  updateSliceJobSuccess,
} from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { getPrusaSlicerConfig, runPrusaSlicer } from "@/backend/slicer";

export const runtime = "nodejs";

type SliceTestResponse = {
  success: boolean;
  message: string;
  job?: Record<string, unknown>;
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
    estimated_price: number;
  };
  error?: string;
};

const LAYER_HEIGHT = 0.2;
const INFILL_DENSITY = 50;
const PARSE_FAILURE_MESSAGE = "切片完成，但未解析到重量/时间，请检查 G-code 输出格式。";
const WEIGHT_PARSE_FAILURE_MESSAGE = "耗材重量解析失败，请检查 G-code 输出。";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await requireAdminSession())) {
    return jsonResponse(
      {
        success: false,
        message: "未登录",
        error: "unauthorized",
      },
      401,
    );
  }

  const slicerConfig = getPrusaSlicerConfig();

  if (!slicerConfig.enabled) {
    return jsonResponse(
      {
        success: false,
        message: "自动切片报价尚未启用",
        error: "PrusaSlicer disabled",
      },
      400,
    );
  }

  if (!(await fileExists(slicerConfig.profilePath))) {
    return jsonResponse(
      {
        success: false,
        message: "切片配置缺失，请先配置 profiles/bambu-p1s.ini",
        error: `Profile not found: ${slicerConfig.profilePath}`,
      },
      400,
    );
  }

  const { id } = await params;
  const db = openDatabase();
  let activeSliceJobId: number | null = null;

  try {
    const order = getOrderById(db, Number(id));
    const firstFile = order.files[0];

    if (!firstFile) {
      return jsonResponse(
        {
          success: false,
          message: "切片失败：订单没有可切片文件",
          error: "No files found",
        },
        400,
      );
    }

    const material = firstFile.material || order.material;
    const gcodeFilePath = createGcodeFilePath(order.orderNo, firstFile.id);
    await mkdir(dirname(gcodeFilePath), { recursive: true });
    const jobId = createSliceJob(db, {
      orderId: order.id,
      fileId: firstFile.id,
      inputFilePath: firstFile.filepath,
      gcodeFilePath,
      material,
      layerHeight: LAYER_HEIGHT,
      infillDensity: INFILL_DENSITY,
      needSupport: false,
    });
    activeSliceJobId = jobId;
    const metadata = await runPrusaSlicer({
      inputFilePath: firstFile.filepath,
      gcodeFilePath,
      material,
      layerHeight: LAYER_HEIGHT,
      infillDensity: INFILL_DENSITY,
      needSupport: false,
      config: slicerConfig,
    });

    if (metadata.filamentWeightG == null) {
      updateSliceJobFailure(db, jobId, WEIGHT_PARSE_FAILURE_MESSAGE);
      return jsonResponse(
        {
          success: false,
          message: WEIGHT_PARSE_FAILURE_MESSAGE,
          job: {
            id: jobId,
            orderId: order.id,
            fileId: firstFile.id,
            status: "failed",
            inputFilePath: firstFile.filepath,
            gcodeFilePath,
            material,
          },
          error: WEIGHT_PARSE_FAILURE_MESSAGE,
        },
        422,
      );
    }

    if (metadata.printTimeSeconds == null) {
      updateSliceJobFailure(db, jobId, PARSE_FAILURE_MESSAGE);
      return jsonResponse(
        {
          success: false,
          message: PARSE_FAILURE_MESSAGE,
          job: {
            id: jobId,
            orderId: order.id,
            fileId: firstFile.id,
            status: "failed",
            inputFilePath: firstFile.filepath,
            gcodeFilePath,
            material,
          },
          error: PARSE_FAILURE_MESSAGE,
        },
        422,
      );
    }

    const price = calculateAutoFilePrice({
      material,
      filamentWeightG: metadata.filamentWeightG,
      printTimeSeconds: metadata.printTimeSeconds,
      packagingShare: (order.packagingFee ?? 3) / Math.max(order.files.length, 1),
    });
    updateSliceJobSuccess(db, jobId, {
      filamentWeightG: metadata.filamentWeightG,
      printTimeSeconds: metadata.printTimeSeconds,
      rawFilamentUsedMm: metadata.rawFilamentUsedMm,
      rawFilamentUsedCm3: metadata.rawFilamentUsedCm3,
      rawFilamentUsedG: metadata.rawFilamentUsedG,
      filamentWeightSource: metadata.filamentWeightSource,
      materialDensity: metadata.materialDensity,
      materialFee: price.materialFee,
      timeFee: price.laborFee,
      estimatedPrice: price.estimatedPrice,
    });

    return jsonResponse({
      success: true,
      message: "切片成功",
      job: {
        id: jobId,
        orderId: order.id,
        fileId: firstFile.id,
        status: "success",
        inputFilePath: firstFile.filepath,
        gcodeFilePath,
        material,
        profilePath: slicerConfig.profilePath,
      },
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
        estimated_price: price.estimatedPrice,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    if (activeSliceJobId != null) {
      updateSliceJobFailure(db, activeSliceJobId, message);
    }

    return jsonResponse(
      {
        success: false,
        message: `切片失败：${message}`,
        error: message,
      },
      400,
    );
  } finally {
    db.close();
  }
}

function createGcodeFilePath(orderNo: string, fileId: number) {
  const gcodeDir = process.env.GCODE_DIR || join(process.cwd(), "gcode");
  return join(gcodeDir, `${orderNo}-${fileId}.gcode`);
}

function jsonResponse(body: SliceTestResponse, status = 200) {
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
