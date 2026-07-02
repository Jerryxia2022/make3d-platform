import { NextResponse } from "next/server";
import { extname } from "node:path";
import {
  createOrderWithFiles,
  createSliceJob,
  getCustomerAddressByIdForCustomer,
  getCustomerById,
  getOrderById,
  markActiveQuoteDraftSubmitted,
  openDatabase,
  updateSliceJobSuccess,
} from "@/backend/database";
import {
  getCustomerFromRequestCookie,
  logCustomerSessionDiagnostics,
} from "@/backend/accountAuth";
import { calculateAutoLeadTimeHours } from "@/backend/autoPricing";
import { estimateFileBySize, estimateOrderSummary, getShippingEstimate } from "@/backend/estimates";
import { notifyAdminNewOrder } from "@/backend/email";
import { consumeUploadRateLimit, getClientIp } from "@/backend/rateLimit";
import {
  saveUploadFile,
  validateSavedUploadReference,
  type SavedUpload,
} from "@/backend/uploads";
import { isValidMainlandPhone, mainlandPhoneErrorMessage } from "@/shared/phoneValidation";

export const runtime = "nodejs";

const MAX_FILE_COUNT = 5;
const requiredFields = [
  "customerName",
  "phone",
  "shippingMethod",
  "addressId",
] as const;

export async function POST(request: Request) {
  try {
    const customer = getCustomerFromRequest(request);

    if (!customer) {
      return NextResponse.json({ error: "请先登录后提交订单" }, { status: 401 });
    }

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

    const phone = getString(formData, "phone");

    if (!isValidMainlandPhone(phone)) {
      return NextResponse.json({ error: mainlandPhoneErrorMessage }, { status: 400 });
    }

    const addressId = getPositiveInteger(formData, "addressId");

    if (!addressId) {
      return NextResponse.json({ error: "请选择收货地址" }, { status: 400 });
    }

    const rawFiles = formData.getAll("modelFiles");
    const uploadedFiles = rawFiles.filter(
      (file): file is File => file instanceof File && file.size > 0,
    );

    const savedUploadRefs = getSavedUploadList(formData);
    const fileCount = savedUploadRefs.length || uploadedFiles.length;

    if (fileCount === 0) {
      return NextResponse.json({ error: "请上传模型文件" }, { status: 400 });
    }

    if (fileCount > MAX_FILE_COUNT) {
      return NextResponse.json({ error: "一次最多上传 5 个模型文件" }, { status: 400 });
    }

    const rawMaterials = formData.getAll("fileMaterials");
    const rawColors = formData.getAll("fileColors");
    const quantities = getQuantityList(formData, "fileQuantities");
    const fileUnitPrices = getNumberList(formData, "fileUnitPrice");
    const fileSubtotalPrices = getNumberList(formData, "fileSubtotalPrice");
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

    if (quantities.length !== fileCount || quantities.some((quantity) => !isValidQuantity(quantity))) {
      return NextResponse.json({ error: "数量必须是 1-1000 的整数" }, { status: 400 });
    }

    const uploadReferences =
      savedUploadRefs.length > 0
        ? await Promise.all(savedUploadRefs.map((upload) => validateSavedUploadReference(upload)))
        : await Promise.all(uploadedFiles.map((file) => saveUploadFile(file)));
    const savedFiles = uploadReferences.map((upload, index) => {
        const material = materials[index] || "PLA";
        const quantity = quantities[index];
        const dimensions = {
          x: dimensionXs[index],
          y: dimensionYs[index],
          z: dimensionZs[index],
        };
        const estimate = estimateFileBySize(upload.filesize, material, dimensions);
        const sliceQuote = sliceQuotes[index];
        const manualReviewReason = getManualReviewReason(upload.filename, sliceQuote, estimate);
        const estimatedFilePrice =
          sliceQuote?.status === "success"
            ? roundMoney(sliceQuote.materialFee + sliceQuote.timeFee)
            : estimate.priceMax;

        return {
          ...upload,
          material,
          color: colors[index] || "黑",
          boundingBoxX: dimensions.x,
          boundingBoxY: dimensions.y,
          boundingBoxZ: dimensions.z,
          estimatedPriceMin: estimatedFilePrice,
          estimatedPriceMax: estimatedFilePrice,
          estimatedLeadTimeMinHours: estimate.leadTimeMinHours,
          estimatedLeadTimeMaxHours: estimate.leadTimeMaxHours,
          riskNotice: manualReviewReason || estimate.riskNotice,
          riskLevel: manualReviewReason ? "danger" : estimate.riskLevel,
          requiresManualConfirmation: Boolean(manualReviewReason || estimate.requiresManualConfirmation),
          materialSalesRate: estimate.materialSalesRate,
          materialCostRate: estimate.materialCostRate,
          quantity,
          unitPrice: fileUnitPrices[index],
          subtotalPrice: fileSubtotalPrices[index],
        };
      });
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
      const quantity = file.quantity || 1;
      const subtotalPrice = roundMoney(filePrice * quantity);

      return {
        ...file,
        unitPrice: filePrice,
        subtotalPrice,
        estimatedPriceMin: subtotalPrice,
        estimatedPriceMax: subtotalPrice,
      };
    });
    const autoPrintPrice = savedFilesWithPackaging.reduce(
      (total, file) => total + safePositiveNumber(file.estimatedPriceMax),
      0,
    );
    const shippingAmount = shipping.includedInAutoPrice ? shipping.amount || 0 : 0;
    const successfulPrintTimes = sliceQuotes.flatMap((quote, index) =>
      quote?.status === "success"
        ? [quote.printTimeSeconds * (savedFilesWithPackaging[index]?.quantity || 1)]
        : [],
    );
    const allFilesSliced =
      successfulPrintTimes.length === fileCount && successfulPrintTimes.length > 0;
    const exactLeadTimeHours = allFilesSliced
      ? calculateAutoLeadTimeHours(successfulPrintTimes)
      : estimate.leadTimeMaxHours;
    const exactOrderPrice = roundMoney(Math.max(autoPrintPrice + shippingAmount, 20));
    const totalQuantity = savedFilesWithPackaging.reduce(
      (total, file) => total + (file.quantity || 1),
      0,
    );
    const db = openDatabase();

    try {
      const persistedCustomer = getCustomerById(db, customer.id);

      if (!persistedCustomer) {
        return NextResponse.json({ error: "请先登录后提交订单" }, { status: 401 });
      }

      const shippingAddress = getCustomerAddressByIdForCustomer(db, customer.id, addressId);
      const district = shippingAddress.districtCustom || shippingAddress.district;
      const addressRegion = [shippingAddress.province, shippingAddress.city, district]
        .filter(Boolean)
        .join(" ");
      const addressSnapshot = {
        id: shippingAddress.id,
        recipientName: shippingAddress.recipientName,
        phone: shippingAddress.phone,
        province: shippingAddress.province,
        provinceCode: shippingAddress.provinceCode,
        provinceName: shippingAddress.provinceName,
        city: shippingAddress.city,
        cityCode: shippingAddress.cityCode,
        cityName: shippingAddress.cityName,
        cityCustom: shippingAddress.cityCustom,
        district,
        districtCode: shippingAddress.districtCode,
        districtName: shippingAddress.districtName,
        districtCustom: shippingAddress.districtCustom,
        detailAddress: shippingAddress.detailAddress,
        postalCode: shippingAddress.postalCode,
        label: shippingAddress.label,
      };

      const orderInput = {
        customerId: customer.id,
        customerName: getString(formData, "customerName"),
        phone,
        wechat: getString(formData, "wechat") || persistedCustomer.wechat,
        email: getString(formData, "email") || persistedCustomer.email || "",
        company: "",
        material: firstFile.material,
        color: firstFile.color,
        quantity: totalQuantity,
        remark: getString(formData, "remark"),
        estimatedPrice: exactOrderPrice,
        estimatedPriceMin: exactOrderPrice,
        estimatedPriceMax: exactOrderPrice,
        estimatedLeadTimeMinHours: exactLeadTimeHours,
        estimatedLeadTimeMaxHours: exactLeadTimeHours,
        packagingFee: estimate.packagingFee,
        shippingFee: shipping.amount,
        printFeeTotal: autoPrintPrice,
        payablePrice: exactOrderPrice,
        estimatedLeadTimeHours: exactLeadTimeHours,
        shippingMethod: getString(formData, "shippingMethod"),
        shippingFeeEstimate: shipping.label,
        recipientName: shippingAddress.recipientName,
        recipientPhone: shippingAddress.phone,
        addressRegion,
        addressDetail: shippingAddress.detailAddress,
        shippingProvince: shippingAddress.province,
        shippingCity: shippingAddress.city,
        shippingCityCustom: shippingAddress.cityCustom,
        shippingDistrict: district,
        shippingProvinceCode: shippingAddress.provinceCode,
        shippingProvinceName: shippingAddress.provinceName,
        shippingCityCode: shippingAddress.cityCode,
        shippingCityName: shippingAddress.cityName,
        shippingDistrictCode: shippingAddress.districtCode,
        shippingDistrictName: shippingAddress.districtName,
        shippingDistrictCustom: shippingAddress.districtCustom,
        shippingDetailAddress: shippingAddress.detailAddress,
        shippingPostalCode: shippingAddress.postalCode,
        shippingLabel: shippingAddress.label,
        shippingAddressSnapshot: JSON.stringify(addressSnapshot),
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
      markActiveQuoteDraftSubmitted(db, customer.id);

      void notifyAdminNewOrder({
        ...order,
        ...orderInput,
      }).catch((error) => {
        console.error("[make3d] admin new order email failed", error);
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

function getPositiveInteger(formData: FormData, key: string) {
  const parsed = Number(getString(formData, key));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getCustomerFromRequest(request: Request) {
  const session = getCustomerFromRequestCookie(request);
  if (!session) {
    logCustomerSessionDiagnostics("[make3d] /api/orders customer session failed", request);
  }
  return session ? { id: session.customerId } : null;
}

function getNumberList(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => {
    const parsed = typeof value === "string" ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });
}

function getQuantityList(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => {
    const parsed = typeof value === "string" ? Number(value) : NaN;
    return isValidQuantity(parsed) ? parsed : NaN;
  });
}

function getSavedUploadList(formData: FormData): SavedUpload[] {
  const filenames = getStringList(formData, "savedFilenames");
  const filepaths = getStringList(formData, "savedFilepaths");
  const filesizes = getNumberList(formData, "savedFilesizes");

  if (filenames.length === 0 && filepaths.length === 0 && filesizes.length === 0) {
    return [];
  }

  if (filenames.length !== filepaths.length || filenames.length !== filesizes.length) {
    throw new Error("文件信息不完整，请重新上传");
  }

  return filenames.map((filename, index) => {
    const filesize = filesizes[index];

    if (!filename || !filepaths[index] || filesize == null) {
      throw new Error("文件信息不完整，请重新上传");
    }

    return {
      filename,
      filepath: filepaths[index],
      filesize,
    };
  });
}

function isValidQuantity(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 1000;
}

function getSliceQuoteList(formData: FormData) {
  const statuses = getStringList(formData, "fileSliceStatus");
  const messages = getStringList(formData, "fileSliceMessage");
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
    message: messages[index] || "",
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

function getManualReviewReason(
  filename: string,
  sliceQuote: ReturnType<typeof getSliceQuoteList>[number] | undefined,
  estimate: ReturnType<typeof estimateFileBySize>,
) {
  const extension = extname(filename).toLowerCase();

  if (extension === ".step" || extension === ".stp") {
    return "该模型需要人工确认后报价。原因：STEP/STP 文件暂不自动切片。";
  }

  if (sliceQuote?.status === "manual") {
    return sliceQuote.message || "该模型需要人工确认后报价。";
  }

  if (sliceQuote?.status === "failed") {
    return sliceQuote.message || "该模型需要人工确认后报价。原因：自动切片失败。";
  }

  if (estimate.requiresManualConfirmation) {
    return estimate.riskNotice || "该模型需要人工确认后报价。";
  }

  return "";
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
