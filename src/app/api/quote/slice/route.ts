import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { NextResponse } from "next/server";
import { calculateAutoFilePrice } from "@/backend/autoPricing";
import { convertStepToStl, type DerivedStlArtifact } from "@/backend/modelConversion";
import { getCustomerFromRequestCookie } from "@/backend/accountAuth";
import { addQuoteDraftFile, openDatabase } from "@/backend/database";
import { getPrusaSlicerConfig, runPrusaSlicer } from "@/backend/slicer";
import { analyzeStlTopology, readStlDimensions } from "@/backend/stlAnalysis";
import { saveUploadFile, type SavedUpload } from "@/backend/uploads";
import { evaluateAutoQuoteDimensions, type ModelDimensionsMm } from "@/shared/modelGeometry";

export const runtime = "nodejs";

const LAYER_HEIGHT = 0.2;
const INFILL_DENSITY = 50;
const SLICER_BASE_MATERIAL = "PLA";
const WEIGHT_MATERIAL = "PETG";
const PARSE_FAILURE_MESSAGE = "计算失败，需人工确认";
const MULTI_ENTITY_MANUAL_MESSAGE = "检测到该文件包含多个可拆分实体，需要人工确认报价。";

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
  saved_upload?: {
    filename: string;
    filepath: string;
    filesize: number;
  };
  draft_file_id?: number;
  error?: string;
  preview_available?: boolean;
  preview_filename?: string;
};

export async function POST(request: Request) {
  try {
    const customer = getCustomerFromRequestCookie(request);

    if (!customer) {
      return jsonResponse({ success: false, message: "请先登录后使用自动报价", error: "Unauthorized" }, 401);
    }

    const formData = await request.formData();
    const file = formData.get("modelFile");
    const material = getString(formData, "material") || WEIGHT_MATERIAL;
    const color = getString(formData, "color") || "白";
    const quantity = getQuantity(formData, "quantity");

    if (!(file instanceof File) || file.size <= 0) {
      return jsonResponse({ success: false, message: "计算失败，需人工确认", error: "No file" }, 400);
    }

    const savedFile = await saveUploadFile(file);
    const slicerConfig = getPrusaSlicerConfig();
    let sliceInputFilepath = savedFile.filepath;
    let derivedArtifact: DerivedStlArtifact | null = null;

    if (savedFile.sourceFormat === "STEP") {
      if (!slicerConfig.enabled) {
        const draftFileId = saveQuoteDraftFile({
          customerId: customer.customerId,
          originalFilename: file.name,
          savedFile,
          material,
          color,
          quantity,
          sliceStatus: "manual",
          errorMessage: "STEP 转换服务未启用，需人工确认",
          manualQuoteReasonCode: "STEP_CONVERTER_DISABLED",
          conversionStatus: "pending",
        });
        return jsonResponse({
          success: true,
          message: "STEP 转换服务未启用，需人工确认",
          saved_upload: savedFile,
          draft_file_id: draftFileId,
          error: "STEP_CONVERTER_DISABLED",
        });
      }

      try {
        derivedArtifact = await enqueueSlice(() => convertStepToStl({
          sourceFilepath: savedFile.filepath,
          sourceSha256: savedFile.sourceSha256 || "",
          config: slicerConfig,
          toolVersion: process.env.PRUSASLICER_PACKAGE_VERSION || "unknown",
        }));
        sliceInputFilepath = derivedArtifact.filepath;
      } catch (error) {
        const message = error instanceof Error ? error.message : "STEP 转换失败";
        const draftFileId = saveQuoteDraftFile({
          customerId: customer.customerId,
          originalFilename: file.name,
          savedFile,
          material,
          color,
          quantity,
          sliceStatus: "manual",
          errorMessage: message,
          geometryStatus: "conversion_failed",
          manualQuoteReasonCode: "STEP_CONVERSION_FAILED",
          conversionStatus: "failed",
          conversionError: message,
        });
        return jsonResponse({
          success: true,
          message: "STEP 转换失败，需人工确认",
          saved_upload: savedFile,
          draft_file_id: draftFileId,
          error: "STEP_CONVERSION_FAILED",
        });
      }
    }

    let dimensions: ModelDimensionsMm;
    try {
      dimensions = await readStlDimensions(sliceInputFilepath);
      const eligibility = evaluateAutoQuoteDimensions(dimensions);
      if (!eligibility.eligible) {
        const draftFileId = saveQuoteDraftFile({
          customerId: customer.customerId,
          originalFilename: file.name,
          savedFile,
          material,
          color,
          quantity,
          sliceStatus: "manual",
          errorMessage: eligibility.message,
          dimensions,
          manualQuoteReasonCode: eligibility.reasonCode,
          derivedArtifact,
        });

        return jsonResponse({
          success: true,
          message: eligibility.message,
          saved_upload: savedFile,
          draft_file_id: draftFileId,
          error: eligibility.reasonCode,
          preview_available: Boolean(derivedArtifact),
          preview_filename: derivedArtifact?.filename,
        });
      }

      const analysis = await analyzeStlTopology(sliceInputFilepath);

      if (analysis.componentCount > 1) {
        const draftFileId = saveQuoteDraftFile({
          customerId: customer.customerId,
          originalFilename: file.name,
          savedFile,
          material,
          color,
          quantity,
          sliceStatus: "manual",
          errorMessage: `${MULTI_ENTITY_MANUAL_MESSAGE} 实体数量：${analysis.componentCount}`,
          dimensions,
          manualQuoteReasonCode: "MULTIPLE_STL_COMPONENTS",
          derivedArtifact,
        });

        return jsonResponse({
          success: true,
          message: MULTI_ENTITY_MANUAL_MESSAGE,
          saved_upload: savedFile,
          draft_file_id: draftFileId,
          error: "Multiple independent STL bodies",
          preview_available: Boolean(derivedArtifact),
          preview_filename: derivedArtifact?.filename,
        });
      }
    } catch (error) {
      const draftFileId = saveQuoteDraftFile({
        customerId: customer.customerId,
        originalFilename: file.name,
        savedFile,
        material,
        color,
        quantity,
        sliceStatus: "manual",
        errorMessage: error instanceof Error ? error.message : "模型网格异常，需要人工确认后报价。",
        geometryStatus: "invalid",
        manualQuoteReasonCode: "GEOMETRY_INVALID",
        derivedArtifact,
      });

      return jsonResponse({
        success: true,
        message: "模型网格异常，需要人工确认后报价。",
        saved_upload: savedFile,
        draft_file_id: draftFileId,
        error: "STL topology analysis failed",
      });
    }

    if (!slicerConfig.enabled) {
      const draftFileId = saveQuoteDraftFile({
        customerId: customer.customerId,
        originalFilename: file.name,
        savedFile,
        material,
        color,
        quantity,
        sliceStatus: "failed",
        errorMessage: "PrusaSlicer disabled",
        dimensions,
        manualQuoteReasonCode: "SLICER_DISABLED",
        derivedArtifact,
      });

      return jsonResponse({
        success: false,
        message: "本地未启用切片，需人工确认",
        saved_upload: savedFile,
        draft_file_id: draftFileId,
        error: "PrusaSlicer disabled",
      }, 400);
    }

    if (!(await fileExists(slicerConfig.profilePath))) {
      const draftFileId = saveQuoteDraftFile({
        customerId: customer.customerId,
        originalFilename: file.name,
        savedFile,
        material,
        color,
        quantity,
        sliceStatus: "failed",
        errorMessage: `Profile not found: ${slicerConfig.profilePath}`,
        dimensions,
        manualQuoteReasonCode: "SLICER_PROFILE_MISSING",
        derivedArtifact,
      });

      return jsonResponse({
        success: false,
        message: "计算失败，需人工确认",
        saved_upload: savedFile,
        draft_file_id: draftFileId,
        error: `Profile not found: ${slicerConfig.profilePath}`,
      }, 400);
    }

    const gcodeFilePath = createQuoteGcodeFilePath(savedFile.filename);
    await mkdir(dirname(gcodeFilePath), { recursive: true });
    const metadata = await enqueueSlice(() =>
      runPrusaSlicer({
        inputFilePath: sliceInputFilepath,
        gcodeFilePath,
        material: SLICER_BASE_MATERIAL,
        metadataMaterial: WEIGHT_MATERIAL,
        layerHeight: LAYER_HEIGHT,
        infillDensity: INFILL_DENSITY,
        needSupport: false,
        config: slicerConfig,
      }),
    );

    if (metadata.filamentWeightG == null || metadata.printTimeSeconds == null) {
      const draftFileId = saveQuoteDraftFile({
        customerId: customer.customerId,
        originalFilename: file.name,
        savedFile,
        material,
        color,
        quantity,
        sliceStatus: "failed",
        errorMessage: "G-code metadata parse failed",
        dimensions,
        manualQuoteReasonCode: "GCODE_METADATA_INVALID",
        derivedArtifact,
      });

      return jsonResponse({
        success: false,
        message: PARSE_FAILURE_MESSAGE,
        saved_upload: savedFile,
        draft_file_id: draftFileId,
        error: "G-code metadata parse failed",
      }, 422);
    }

    const price = calculateAutoFilePrice({
      material,
      filamentWeightG: metadata.filamentWeightG,
      printTimeSeconds: metadata.printTimeSeconds,
      packagingFee: 0,
    });
    const draftFileId = saveQuoteDraftFile({
      customerId: customer.customerId,
      originalFilename: file.name,
      savedFile,
      material,
      color,
      quantity,
      sliceStatus: "success",
      dimensions,
      derivedArtifact,
      filamentWeightG: metadata.filamentWeightG,
      printTimeSeconds: metadata.printTimeSeconds,
      rawFilamentUsedMm: metadata.rawFilamentUsedMm,
      rawFilamentUsedCm3: metadata.rawFilamentUsedCm3,
      rawFilamentUsedG: metadata.rawFilamentUsedG,
      filamentWeightSource: metadata.filamentWeightSource,
      materialDensity: metadata.materialDensity,
      materialFee: price.materialFee,
      timeFee: price.laborFee,
      basePrintPrice: price.estimatedPrice,
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
      saved_upload: savedFile,
      draft_file_id: draftFileId,
      preview_available: Boolean(derivedArtifact),
      preview_filename: derivedArtifact?.filename,
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

function getQuantity(formData: FormData, key: string) {
  const parsed = Number(getString(formData, key));
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1000 ? parsed : 1;
}

function saveQuoteDraftFile(input: {
  customerId: number;
  originalFilename: string;
  savedFile: SavedUpload;
  material: string;
  color: string;
  quantity: number;
  sliceStatus: string;
  errorMessage?: string | null;
  filamentWeightG?: number | null;
  printTimeSeconds?: number | null;
  rawFilamentUsedMm?: number | null;
  rawFilamentUsedCm3?: number | null;
  rawFilamentUsedG?: number | null;
  filamentWeightSource?: string | null;
  materialDensity?: number | null;
  materialFee?: number | null;
  timeFee?: number | null;
  basePrintPrice?: number | null;
  dimensions?: ModelDimensionsMm | null;
  geometryStatus?: string | null;
  manualQuoteReasonCode?: string | null;
  conversionStatus?: string | null;
  conversionError?: string | null;
  derivedArtifact?: DerivedStlArtifact | null;
}) {
  const db = openDatabase();

  try {
    const draftFile = addQuoteDraftFile(db, {
      customerId: input.customerId,
      originalFilename: input.originalFilename,
      filename: input.savedFile.filename,
      filepath: input.savedFile.filepath,
      filesize: input.savedFile.filesize,
      material: input.material,
      color: input.color,
      quantity: input.quantity,
      sliceStatus: input.sliceStatus,
      errorMessage: input.errorMessage,
      filamentWeightG: input.filamentWeightG,
      printTimeSeconds: input.printTimeSeconds,
      rawFilamentUsedMm: input.rawFilamentUsedMm,
      rawFilamentUsedCm3: input.rawFilamentUsedCm3,
      rawFilamentUsedG: input.rawFilamentUsedG,
      filamentWeightSource: input.filamentWeightSource,
      materialDensity: input.materialDensity,
      materialFee: input.materialFee,
      timeFee: input.timeFee,
      basePrintPrice: input.basePrintPrice,
      boundingBoxX: input.dimensions?.x,
      boundingBoxY: input.dimensions?.y,
      boundingBoxZ: input.dimensions?.z,
      sourceFormat: input.savedFile.sourceFormat,
      sourceSha256: input.savedFile.sourceSha256,
      geometryStatus: input.geometryStatus || input.savedFile.validationStatus || "valid",
      geometryUnits: "mm",
      geometryAnalyzedAt: getBeijingTimestampForGeometry(),
      quoteMode: input.sliceStatus === "success" ? "AUTO" : "MANUAL",
      manualQuoteReasonCode: input.manualQuoteReasonCode,
      conversionError: input.conversionError,
      derivedStlFilepath: input.derivedArtifact?.filepath,
      derivedStlSha256: input.derivedArtifact?.sha256,
      derivedStlFilesize: input.derivedArtifact?.filesize,
      geometryToolName: input.derivedArtifact?.toolName || (input.savedFile.sourceFormat === "STL" ? "make3d-stl-analysis" : "make3d-part21-validator"),
      geometryToolVersion: input.derivedArtifact?.toolVersion || "phase07-a2-v1",
      conversionStatus: input.derivedArtifact ? "success" : input.conversionStatus || (input.savedFile.sourceFormat === "STEP" ? "pending" : "not_required"),
    });

    return draftFile.id;
  } catch (error) {
    console.error("[make3d] quote draft save failed", error);
    return undefined;
  } finally {
    db.close();
  }
}

function getBeijingTimestampForGeometry() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date());
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
