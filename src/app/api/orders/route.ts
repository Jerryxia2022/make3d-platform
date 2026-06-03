import { NextResponse } from "next/server";
import {
  createOrderWithFiles,
  createSliceJob,
  getOrderById,
  openDatabase,
  updateSliceJobSuccess,
} from "@/backend/database";
import { calculateAutoLeadTimeHours } from "@/backend/autoPricing";
import { estimateFileBySize, estimateOrderSummary, getShippingEstimate } from "@/backend/estimates";
import { notifyAdminNewOrder } from "@/backend/email";
import { consumeUploadRateLimit, getClientIp } from "@/backend/rateLimit";
import { saveUploadFile } from "@/backend/uploads";

export const runtime = "nodejs";

const MAX_FILE_COUNT = 5;
const requiredFields = [
  "customerName",
  "phone",
  "wechat",
  "shippingMethod",
  "recipientName",
  "recipientPhone",
  "addressRegion",
  "addressDetail",
] as const;

export async function POST(request: Request) {
  try {
    const rateLimit = consumeUploadRateLimit(getClientIp(request));

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "上传过于频繁，请稍后再试" },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds || 600),
          },
        },
      );
    }

    const formData = await request.formData();
    const missingField = requiredFields.find((field) => !getString(formData, field));

    if (missingField) {
      return NextResponse.json(
        { error: `缺少必填字段：${missingField}` },
        { status: 400 },
      );
    }

    const rawFiles = formData.getAll("modelFiles");
    const uploadedFiles = rawFiles.filter(
      (file): file is File => file instanceof File && file.size > 0,
    );

    if (uploadedFiles.length === 0) {
      return NextResponse.json({ error: "请上传模型文件" }, { status: 400 });
    }

    if (uploadedFiles.length > MAX_FILE_COUNT) {
      return NextResponse.json({ error: "一次最多上传 5 个模型文件" }, { status: 400 });
    }

    const rawMaterials = formData.getAll("fileMaterials");
    const rawColors = formData.getAll("fileColors");
    const dimensionXs = getNumberList(formData, "fileDimensionX");
    const dimensionYs = getNumberList(formData, "fileDimensionY");
    const dimensionZs = getNumberList(formData, "fileDimensionZ");
    const sliceQuotes = getSliceQuoteList(formData);
    const materials = rawMaterials
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    const colors = rawColors
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    const savedFiles = await Promise.all(
      uploadedFiles.map(async (file, index) => {
        const material = materials[index] || "PLA";
        const dimensions = {
          x: dimensionXs[index],
          y: dimensionYs[index],
          z: dimensionZs[index],
        };
        const estimate = estimateFileBySize(file.size, material, dimensions);
        const sliceQuote = sliceQuotes[index];
        const estimatedFilePrice =
          sliceQuote?.status === "success"
            ? roundMoney(sliceQuote.materialFee + sliceQuote.timeFee)
            : estimate.priceMax;

        return {
          ...(await saveUploadFile(file)),
          material,
          color: colors[index] || "黑",
          boundingBoxX: dimensions.x,
          boundingBoxY: dimensions.y,
          boundingBoxZ: dimensions.z,
          estimatedPriceMin: estimatedFilePrice,
          estimatedPriceMax: estimatedFilePrice,
          estimatedLeadTimeMinHours: estimate.leadTimeMinHours,
          estimatedLeadTimeMaxHours: estimate.leadTimeMaxHours,
          riskNotice: estimate.riskNotice,
          riskLevel: estimate.riskLevel,
          requiresManualConfirmation: estimate.requiresManualConfirmation,
          materialSalesRate: estimate.materialSalesRate,
          materialCostRate: estimate.materialCostRate,
        };
      }),
    );
    const firstFile = savedFiles[0];
    const shippingMethod = getString(formData, "shippingMethod");
    const estimate = estimateOrderSummary(savedFiles, shippingMethod);
    const shipping = getShippingEstimate(shippingMethod);
    const packagingShare = 3 / savedFiles.length;
    const savedFilesWithPackaging = savedFiles.map((file, index) => {
      const sliceQuote = sliceQuotes[index];
      const filePrice =
        sliceQuote?.status === "success"
          ? roundMoney(sliceQuote.materialFee + sliceQuote.timeFee + packagingShare)
          : file.estimatedPriceMax;

      return {
        ...file,
        estimatedPriceMin: filePrice,
        estimatedPriceMax: filePrice,
      };
    });
    const autoPrintPrice = savedFilesWithPackaging.reduce(
      (total, file) => total + safePositiveNumber(file.estimatedPriceMax),
      0,
    );
    const shippingAmount = shipping.includedInAutoPrice ? shipping.amount || 0 : 0;
    const successfulPrintTimes = sliceQuotes
      .filter((quote) => quote?.status === "success")
      .map((quote) => quote.printTimeSeconds);
    const allFilesSliced =
      successfulPrintTimes.length === uploadedFiles.length && successfulPrintTimes.length > 0;
    const exactLeadTimeHours = allFilesSliced
      ? calculateAutoLeadTimeHours(successfulPrintTimes)
      : estimate.leadTimeMaxHours;
    const exactOrderPrice = roundMoney(Math.max(autoPrintPrice + shippingAmount, 20));
    const db = openDatabase();

    try {
      const orderInput = {
        customerName: getString(formData, "customerName"),
        phone: getString(formData, "phone"),
        wechat: getString(formData, "wechat"),
        email: getString(formData, "email"),
        company: "",
        material: firstFile.material,
        color: firstFile.color,
        quantity: savedFiles.length,
        remark: getString(formData, "remark"),
        estimatedPrice: exactOrderPrice,
        estimatedPriceMin: exactOrderPrice,
        estimatedPriceMax: exactOrderPrice,
        estimatedLeadTimeMinHours: exactLeadTimeHours,
        estimatedLeadTimeMaxHours: exactLeadTimeHours,
        packagingFee: estimate.packagingFee,
        shippingFee: shipping.amount,
        shippingMethod: getString(formData, "shippingMethod"),
        shippingFeeEstimate: shipping.label,
        recipientName: getString(formData, "recipientName"),
        recipientPhone: getString(formData, "recipientPhone"),
        addressRegion: getString(formData, "addressRegion"),
        addressDetail: getString(formData, "addressDetail"),
        shippingRemark: getString(formData, "shippingRemark"),
        files: savedFilesWithPackaging,
      };
      const order = createOrderWithFiles(db, orderInput);
      const orderDetail = getOrderById(db, order.id);

      orderDetail.files.forEach((file, index) => {
        const sliceQuote = sliceQuotes[index];
        if (sliceQuote?.status !== "success") {
          return;
        }

        const jobId = createSliceJob(db, {
          orderId: order.id,
          fileId: file.id,
          inputFilePath: file.filepath,
          gcodeFilePath: "",
          material: file.material || orderInput.material,
          layerHeight: 0.2,
          infillDensity: 50,
          needSupport: false,
        });
        updateSliceJobSuccess(db, jobId, {
          filamentWeightG: sliceQuote.filamentWeightG,
          printTimeSeconds: sliceQuote.printTimeSeconds,
          rawFilamentUsedMm: sliceQuote.rawFilamentUsedMm,
          rawFilamentUsedCm3: sliceQuote.rawFilamentUsedCm3,
          rawFilamentUsedG: sliceQuote.rawFilamentUsedG,
          filamentWeightSource: sliceQuote.filamentWeightSource,
          materialDensity: sliceQuote.materialDensity,
          materialFee: sliceQuote.materialFee,
          timeFee: sliceQuote.timeFee,
          estimatedPrice: savedFilesWithPackaging[index].estimatedPriceMax || 0,
        });
      });

      await notifyAdminNewOrder({
        ...order,
        ...orderInput,
      });

      return NextResponse.json(order, { status: 201 });
    } finally {
      db.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "提交失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getNumberList(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => {
    const parsed = typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });
}

function getSliceQuoteList(formData: FormData) {
  const statuses = getStringList(formData, "fileSliceStatus");
  const filamentWeights = getNumberList(formData, "fileFilamentWeightG");
  const printTimes = getNumberList(formData, "filePrintTimeSeconds");
  const rawMms = getNullableNumberList(formData, "fileRawFilamentUsedMm");
  const rawCm3s = getNullableNumberList(formData, "fileRawFilamentUsedCm3");
  const rawGs = getNullableNumberList(formData, "fileRawFilamentUsedG");
  const sources = getStringList(formData, "fileFilamentWeightSource");
  const densities = getNullableNumberList(formData, "fileMaterialDensity");
  const materialFees = getNumberList(formData, "fileMaterialFee");
  const timeFees = getNumberList(formData, "fileTimeFee");

  return statuses.map((status, index) => ({
    status,
    filamentWeightG: filamentWeights[index] || 0,
    printTimeSeconds: printTimes[index] || 0,
    rawFilamentUsedMm: rawMms[index],
    rawFilamentUsedCm3: rawCm3s[index],
    rawFilamentUsedG: rawGs[index],
    filamentWeightSource: sources[index] || null,
    materialDensity: densities[index],
    materialFee: materialFees[index] || 0,
    timeFee: timeFees[index] || 0,
  }));
}

function getStringList(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => (typeof value === "string" ? value.trim() : ""));
}

function getNullableNumberList(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => {
    if (typeof value !== "string" || value.trim() === "") {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  });
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function safePositiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
