export const MB = 1024 * 1024;
export const DEVICE_COUNT = 6;
export const PACKAGING_FEE = 3;
export const PACKAGING_TIME_HOURS = 2;
export const ORDER_MIN_PRICE = 20;
export const DEFAULT_LEAD_TIME_MIN_HOURS = 48;
export const DEFAULT_LEAD_TIME_MAX_HOURS = 72;

export type QuoteDimensions = {
  x: number | null;
  y: number | null;
  z: number | null;
};

export type QuoteFileLike = {
  name?: string | null;
  size?: number | null;
  lastModified?: number | null;
};

export type SelectedQuoteFile = {
  id: string;
  file: QuoteFileLike;
  material: string;
  color: string;
  quantity: number;
};

export type FileEstimate = ReturnType<typeof estimateFileBySize>;

export function createQuoteFileId(file: QuoteFileLike) {
  const randomUUID = globalThis.crypto?.randomUUID;
  const randomId =
    typeof randomUUID === "function"
      ? randomUUID.call(globalThis.crypto)
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${file.name || "model"}-${safeFileSize(file)}-${file.lastModified || 0}-${randomId}`;
}

export function estimateFiles<T extends SelectedQuoteFile>(files: T[]) {
  const safeFiles = Array.isArray(files) ? files : [];
  const packagingShare = safeFiles.length > 0 ? PACKAGING_FEE / safeFiles.length : 0;

  return safeFiles.map((item) => {
    const dimensions = estimateDisplayDimensions(item.file);
    const estimate = estimateFileBySize(safeFileSize(item.file), item.material, dimensions);

    return {
      item,
      dimensions,
      estimate: {
        ...estimate,
        priceMin: Math.ceil(estimate.priceMin + packagingShare),
        priceMax: Math.ceil(estimate.priceMax + packagingShare),
      },
    };
  });
}

export function estimateFileBySize(
  filesize: number | null | undefined,
  material: string,
  dimensions: QuoteDimensions | null = null,
) {
  const bucket = getSizeBucket(filesize);
  const risk = getDimensionRisk(dimensions);
  const salesRate = getMaterialSalesRate(material);
  const laborMin = Math.max(bucket.leadTimeMinHours * 1.5, 5);
  const laborMax = Math.max(bucket.leadTimeMaxHours * 1.5, 5);
  const riskMultiplier = (material === "ABS" ? 1.15 : 1) * risk.priceMultiplier;

  return {
    priceMin: Math.ceil((bucket.weightMinGrams * salesRate + laborMin) * riskMultiplier),
    priceMax: Math.ceil((bucket.weightMaxGrams * salesRate + laborMax) * riskMultiplier),
    leadTimeMinHours: DEFAULT_LEAD_TIME_MIN_HOURS,
    leadTimeMaxHours: DEFAULT_LEAD_TIME_MAX_HOURS,
    riskNotice: risk.notice,
    riskLevel: risk.level,
  };
}

export function estimateOrderSummary(
  fileEstimates: { estimate?: Partial<FileEstimate> | null }[] | null | undefined,
  shippingMethod: string,
) {
  const safeEstimates = Array.isArray(fileEstimates) ? fileEstimates : [];
  const shipping = getShippingEstimate(shippingMethod);
  const shippingAmount = shipping.includedInAutoPrice ? shipping.amount || 0 : 0;
  const filePriceMin = safeEstimates.reduce(
    (total, entry) => total + safePositiveNumber(entry.estimate?.priceMin),
    0,
  );
  const filePriceMax = safeEstimates.reduce(
    (total, entry) => total + safePositiveNumber(entry.estimate?.priceMax),
    0,
  );

  return {
    priceMin: Math.max(Math.ceil(filePriceMin + shippingAmount), ORDER_MIN_PRICE),
    priceMax: Math.max(Math.ceil(filePriceMax + shippingAmount), ORDER_MIN_PRICE),
    leadTimeMinHours: DEFAULT_LEAD_TIME_MIN_HOURS,
    leadTimeMaxHours: DEFAULT_LEAD_TIME_MAX_HOURS,
    shippingFeeEstimate: shipping.label,
  };
}

export function estimateDisplayDimensions(file: QuoteFileLike): QuoteDimensions | null {
  const size = safeFileSize(file);

  if (size <= 0 || !canUseApproximateDimensions(file)) {
    return null;
  }

  if (size < MB) {
    return { x: 8, y: 30, z: 30 };
  }

  if (size > 45 * MB) {
    return { x: 260, y: 180, z: 120 };
  }

  if (size >= 20 * MB) {
    return { x: 245, y: 160, z: 120 };
  }

  if (size >= 5 * MB) {
    return { x: 120, y: 80, z: 60 };
  }

  return { x: 60, y: 40, z: 30 };
}

export function formatDimensions(dimensions: QuoteDimensions | null | undefined) {
  const values = getValidDimensionValues(dimensions);

  if (values.length !== 3) {
    return "尺寸暂未识别，最终以人工确认为准。";
  }

  return `模型最大外形尺寸约：${values[0]} × ${values[1]} × ${values[2]} mm`;
}

export function formatOptionSummary(files: SelectedQuoteFile[] | null | undefined) {
  if (!Array.isArray(files) || files.length === 0) {
    return "-";
  }

  return files.map((item) => `${item.material || "PLA"}/${item.color || "黑"}`).join("，");
}

export function getSafeQuantity(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1000
    ? value
    : 1;
}

export function formatPrice(value: number | null | undefined) {
  const safeValue = Math.ceil(safePositiveNumber(value));
  return safeValue > 0 ? `${safeValue} 元` : "-";
}

export function formatLeadTimeRange(
  min: number | null | undefined,
  max: number | null | undefined,
) {
  const safeMin = Math.ceil(safePositiveNumber(min));
  const safeMax = Math.ceil(safePositiveNumber(max));

  return safeMin === 0 && safeMax === 0 ? "-" : `预计 ${safeMin}-${safeMax} 小时`;
}

export function formatBytes(value: number | null | undefined) {
  const bytes = safePositiveNumber(value);

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / MB).toFixed(2)} MB`;
}

export function safeFileSize(file: QuoteFileLike | null | undefined) {
  return safePositiveNumber(file?.size);
}

function canUseApproximateDimensions(file: QuoteFileLike) {
  const filename = typeof file.name === "string" ? file.name.toLowerCase() : "";
  return Boolean(filename && [".step", ".stp"].some((extension) => filename.endsWith(extension)));
}

function getSizeBucket(filesize: number | null | undefined) {
  const size = safePositiveNumber(filesize);

  if (size < 5 * MB) {
    return { weightMinGrams: 65, weightMaxGrams: 169, leadTimeMinHours: 4, leadTimeMaxHours: 8 };
  }

  if (size < 20 * MB) {
    return { weightMinGrams: 35, weightMaxGrams: 250, leadTimeMinHours: 8, leadTimeMaxHours: 24 };
  }

  return { weightMinGrams: 300, weightMaxGrams: 700, leadTimeMinHours: 24, leadTimeMaxHours: 48 };
}

function getDimensionRisk(dimensions: QuoteDimensions | null | undefined) {
  const values = getValidDimensionValues(dimensions);

  if (values.length === 0) {
    return {
      notice: "",
      level: "none",
      priceMultiplier: 1,
    };
  }

  if (values.some((value) => value > 256)) {
    return {
      notice: "模型超出单台设备成型尺寸，通常需要分件打印，最终报价需人工确认。",
      level: "danger",
      priceMultiplier: 1.1,
    };
  }

  if (values.some((value) => value > 240)) {
    return {
      notice: "模型接近设备成型极限，可能需要调整摆放或拆件。",
      level: "warning",
      priceMultiplier: 1.1,
    };
  }

  if (values.some((value) => value < 10)) {
    return {
      notice: "模型尺寸较小，可能无法稳定打印，需要人工确认。",
      level: "warning",
      priceMultiplier: 1.15,
    };
  }

  return { notice: "", level: "none", priceMultiplier: 1 };
}

function getShippingEstimate(method: string) {
  switch (method) {
    case "顺丰快递":
      return { label: "18 元", amount: 18, includedInAutoPrice: true };
    case "西安本地跑腿":
      return { label: "人工确认", amount: null, includedInAutoPrice: false };
    case "普通快递":
    default:
      return { label: "10 元", amount: 10, includedInAutoPrice: true };
  }
}

function getMaterialSalesRate(material: string) {
  switch (material) {
    case "PETG":
      return 0.2;
    case "ABS":
      return 0.35;
    case "PLA":
    default:
      return 0.25;
  }
}

function getValidDimensionValues(dimensions: QuoteDimensions | null | undefined) {
  return [dimensions?.x, dimensions?.y, dimensions?.z].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
}

function safePositiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
