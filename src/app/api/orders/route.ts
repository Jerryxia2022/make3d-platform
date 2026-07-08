import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import {
  createContentSha256,
  createOrderEvidenceSnapshot,
  createOrderWithFiles,
  createOrderRiskAcceptance,
  createSliceJob,
  getCustomerAddressByIdForCustomer,
  getCustomerInvoiceProfileByIdForCustomer,
  getBeijingTimestamp,
  getCustomerById,
  getOrderById,
  markActiveQuoteDraftSubmitted,
  openDatabase,
  type OrderDetail,
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
import {
  INVOICE_TYPE_LABELS,
  calculateInvoiceTotalCents,
  centsToYuan,
  invoiceTypes,
  maskTaxpayerId,
  type InvoiceType,
  yuanToCents,
} from "@/shared/invoice";
import {
  CANCELLATION_POLICY_SNAPSHOT,
  COMPANY_LEGAL_SNAPSHOT,
  FILE_RETENTION_SNAPSHOT,
  LEGAL_PUBLIC_VERSION,
  LEGAL_SOURCE_VERSION,
  ORDER_RISK_CONFIRMATION_ITEMS,
  ORDER_RISK_CONFIRMATION_VERSION,
} from "@/shared/legalPolicy";
import { calculateLinePrintTotal, isSameMoney, roundMoney, safePositiveMoney } from "@/shared/pricing";

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

    const clientIp = getClientIp(request);
    const rateLimit = consumeUploadRateLimit(clientIp);

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

    if (!isChecked(formData, "riskAccepted")) {
      return NextResponse.json({ error: "请先确认下单风险、定制制造和售后规则" }, { status: 400 });
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
      return NextResponse.json({ error: "请先上传模型并完成报价" }, { status: 400 });
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
      const quantity = file.quantity || 1;
      const isAutoQuoted = sliceQuote?.status === "success" && !file.requiresManualConfirmation;

      if (!isAutoQuoted) {
        return {
          ...file,
          unitPrice: null,
          subtotalPrice: null,
          estimatedPriceMin: null,
          estimatedPriceMax: null,
        };
      }

      const calculatedUnitPrice = roundMoney(sliceQuote.materialFee + sliceQuote.timeFee + packagingShare);
      const { unitPrice, subtotalPrice } = calculateLinePrintTotal(calculatedUnitPrice, quantity);
      const submittedUnitPrice = fileUnitPrices[index];
      const submittedSubtotalPrice = fileSubtotalPrices[index];

      if (
        submittedUnitPrice != null &&
        submittedSubtotalPrice != null &&
        (!isSameMoney(submittedUnitPrice, unitPrice) || !isSameMoney(submittedSubtotalPrice, subtotalPrice))
      ) {
        throw new Error("报价金额已更新，请刷新后重试");
      }

      return {
        ...file,
        unitPrice,
        subtotalPrice,
        estimatedPriceMin: subtotalPrice,
        estimatedPriceMax: subtotalPrice,
      };
    });
    const autoPrintPrice = savedFilesWithPackaging.reduce(
      (total, file) => total + safePositiveMoney(file.subtotalPrice),
      0,
    );
    const allFilesAutoQuoted = savedFilesWithPackaging.every(
      (file) => !file.requiresManualConfirmation && file.subtotalPrice != null,
    );
    const shippingAmount = allFilesAutoQuoted && shipping.includedInAutoPrice ? shipping.amount || 0 : 0;
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
    const exactOrderPrice =
      allFilesAutoQuoted && shipping.includedInAutoPrice
        ? roundMoney(autoPrintPrice + shippingAmount)
        : null;
    const totalQuantity = savedFilesWithPackaging.reduce(
      (total, file) => total + (file.quantity || 1),
      0,
    );
    const savedFileHashes = await Promise.all(
      savedFilesWithPackaging.map(async (file) => ({
        filepath: file.filepath,
        sha256: await hashFileContent(file.filepath),
      })),
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
      const rawInvoiceType = getString(formData, "invoiceType");

      if (!invoiceTypes.includes(rawInvoiceType as InvoiceType)) {
        return NextResponse.json({ error: "请先选择发票类型" }, { status: 400 });
      }

      const invoiceType = rawInvoiceType as InvoiceType;
      const invoiceProfileId = getPositiveInteger(formData, "invoiceProfileId");
      const invoiceProfile =
        invoiceType === "none"
          ? null
          : getCustomerInvoiceProfileByIdForCustomer(db, customer.id, invoiceProfileId || 0);

      if (invoiceProfile && invoiceProfile.invoiceType !== invoiceType) {
        return NextResponse.json({ error: "请选择对应类型的发票资料" }, { status: 400 });
      }

      const baseAmountCents = yuanToCents(exactOrderPrice ?? autoPrintPrice + shippingAmount);
      const invoiceCalculation = calculateInvoiceTotalCents(baseAmountCents, invoiceType);
      const adjustedOrderPrice = centsToYuan(invoiceCalculation.invoiceTotalAmountCents);
      const invoiceProfileSnapshot = invoiceProfile
        ? {
            id: invoiceProfile.id,
            invoiceType: invoiceProfile.invoiceType,
            title: invoiceProfile.title,
            taxpayerIdMasked: maskTaxpayerId(invoiceProfile.taxpayerId),
            registeredAddress: invoiceProfile.registeredAddress,
            registeredPhone: invoiceProfile.registeredPhone,
            bankName: invoiceProfile.bankName,
            bankAccountMasked: maskTaxpayerId(invoiceProfile.bankAccount),
            receiverContact: invoiceProfile.receiverContact,
          }
        : null;
      const invoiceJson = {
        invoice_required: invoiceCalculation.invoiceRequired,
        invoice_type: invoiceType,
        invoice_type_label: INVOICE_TYPE_LABELS[invoiceType],
        invoice_title: invoiceProfile?.title || "",
        taxpayer_id_masked_or_hash: maskTaxpayerId(invoiceProfile?.taxpayerId),
        invoice_rate: invoiceCalculation.invoiceRateBps,
        invoice_price_adjustment_rate: invoiceCalculation.invoicePriceAdjustmentBps,
        invoice_base_amount_cents: invoiceCalculation.invoiceBaseAmountCents,
        invoice_adjustment_amount_cents: invoiceCalculation.invoiceAdjustmentAmountCents,
        invoice_total_amount_cents: invoiceCalculation.invoiceTotalAmountCents,
        invoice_profile_snapshot: invoiceProfileSnapshot,
        selected_at: getBeijingTimestamp(),
        policy_version: LEGAL_PUBLIC_VERSION,
        source_version: LEGAL_SOURCE_VERSION,
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
        estimatedPrice: adjustedOrderPrice,
        estimatedPriceMin: exactOrderPrice == null ? null : adjustedOrderPrice,
        estimatedPriceMax: exactOrderPrice == null ? null : adjustedOrderPrice,
        estimatedLeadTimeMinHours: exactLeadTimeHours,
        estimatedLeadTimeMaxHours: exactLeadTimeHours,
        packagingFee: estimate.packagingFee,
        shippingFee: allFilesAutoQuoted ? shipping.amount : null,
        printFeeTotal: autoPrintPrice,
        payablePrice: exactOrderPrice == null ? null : adjustedOrderPrice,
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
        invoiceJson: JSON.stringify(invoiceJson),
        cancellationPolicyJson: JSON.stringify(CANCELLATION_POLICY_SNAPSHOT),
        fileRetentionJson: JSON.stringify(FILE_RETENTION_SNAPSHOT),
        companySnapshotJson: JSON.stringify(COMPANY_LEGAL_SNAPSHOT),
        files: savedFilesWithPackaging,
      };
      const order = createOrderWithFiles(db, orderInput);
      const orderDetail = getOrderById(db, order.id);
      const riskContentJson = JSON.stringify({
        version: ORDER_RISK_CONFIRMATION_VERSION,
        items: ORDER_RISK_CONFIRMATION_ITEMS,
        legalVersion: LEGAL_PUBLIC_VERSION,
      });

      createOrderRiskAcceptance(db, {
        orderId: order.id,
        customerId: customer.id,
        version: ORDER_RISK_CONFIRMATION_VERSION,
        contentJson: riskContentJson,
        contentSha256: createContentSha256(riskContentJson),
        ipAddress: clientIp,
        userAgent: request.headers.get("user-agent"),
      });

      const evidenceSnapshotJson = await buildOrderEvidenceSnapshotJson({
        order: orderDetail,
        invoiceJson,
        cancellationPolicyJson: CANCELLATION_POLICY_SNAPSHOT,
        fileRetentionJson: FILE_RETENTION_SNAPSHOT,
        companySnapshotJson: COMPANY_LEGAL_SNAPSHOT,
        riskContentJson,
        fileHashes: savedFileHashes,
      });
      createOrderEvidenceSnapshot(db, {
        orderId: order.id,
        customerId: customer.id,
        snapshotJson: evidenceSnapshotJson,
        snapshotSha256: createContentSha256(evidenceSnapshotJson),
        invoiceJson: JSON.stringify(invoiceJson),
        cancellationPolicyJson: JSON.stringify(CANCELLATION_POLICY_SNAPSHOT),
        fileRetentionJson: JSON.stringify(FILE_RETENTION_SNAPSHOT),
        companySnapshotJson: JSON.stringify(COMPANY_LEGAL_SNAPSHOT),
      });

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

function isChecked(formData: FormData, key: string) {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

function parseJsonRecord(value: string | null) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function hashFileContent(filepath: string) {
  const buffer = await readFile(filepath);
  return createHash("sha256").update(buffer).digest("hex");
}

async function buildOrderEvidenceSnapshotJson({
  order,
  invoiceJson,
  cancellationPolicyJson,
  fileRetentionJson,
  companySnapshotJson,
  riskContentJson,
  fileHashes,
}: {
  order: OrderDetail;
  invoiceJson: Record<string, unknown>;
  cancellationPolicyJson: Record<string, unknown>;
  fileRetentionJson: Record<string, unknown>;
  companySnapshotJson: Record<string, unknown>;
  riskContentJson: string;
  fileHashes: Array<{ filepath: string; sha256: string }>;
}) {
  const hashByPath = new Map(fileHashes.map((file) => [file.filepath, file.sha256]));
  const files = order.files.map((file) => ({
    id: file.id,
    filename: file.filename,
    filesize: file.filesize,
    file_sha256: hashByPath.get(file.filepath) || "",
    material: file.material,
    color: file.color,
    quantity: file.quantity,
    unit_price: file.unitPrice,
    subtotal_price: file.subtotalPrice,
    dimensions_mm: {
      x: file.boundingBoxX,
      y: file.boundingBoxY,
      z: file.boundingBoxZ,
    },
    risk_notice: file.riskNotice,
    risk_level: file.riskLevel,
    requires_manual_confirmation: file.requiresManualConfirmation,
  }));

  return JSON.stringify({
    snapshot_version: "order-evidence-v1",
    created_at: getBeijingTimestamp(),
    order: {
      id: order.id,
      order_no: order.orderNo,
      customer_id: order.customerId,
      status: order.status,
      created_at: order.createdAt,
    },
    quote_amounts: {
      estimated_price: order.estimatedPrice,
      estimated_price_min: order.estimatedPriceMin,
      estimated_price_max: order.estimatedPriceMax,
      print_fee_total: order.printFeeTotal,
      packaging_fee: order.packagingFee,
      shipping_fee: order.shippingFee,
      payable_price: order.payablePrice,
    },
    invoice_json: invoiceJson,
    cancellation_policy_json: cancellationPolicyJson,
    file_retention_json: fileRetentionJson,
    company_snapshot_json: companySnapshotJson,
    files,
    address_snapshot: parseJsonRecord(order.shippingAddressSnapshot),
    agreement_version: LEGAL_PUBLIC_VERSION,
    legal_source_version: LEGAL_SOURCE_VERSION,
    risk_confirmation_version: ORDER_RISK_CONFIRMATION_VERSION,
    risk_confirmation_sha256: createContentSha256(riskContentJson),
  });
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

