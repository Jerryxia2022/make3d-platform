export type EstimateMaterial = "PLA" | "PETG" | "ABS" | string;

export type DimensionsMm = {
  x?: number | null;
  y?: number | null;
  z?: number | null;
};

export type EstimateFileInput = {
  filesize: number;
  material: EstimateMaterial;
  color: string;
  dimensions?: DimensionsMm;
};

export type ShippingMethod = "普通快递" | "顺丰快递" | "西安本地跑腿" | string;

export const DEVICE_COUNT = 6;
export const PACKAGING_FEE = 3;
export const PACKAGING_TIME_HOURS = 2;

const MB = 1024 * 1024;
const ORDER_MIN_PRICE = 20;

export function estimateFileBySize(
  filesize: number,
  material: EstimateMaterial,
  dimensions: DimensionsMm = {},
) {
  const bucket = getSizeBucket(filesize);
  const dimensionRisk = getDimensionRisk(dimensions);
  const materialSalesRate = getMaterialSalesRate(material);
  const materialCostRate = getMaterialCostRate(material);
  const laborMin = Math.max(bucket.leadTimeMinHours * 1.5, 5);
  const laborMax = Math.max(bucket.leadTimeMaxHours * 1.5, 5);
  const materialMin = bucket.weightMinGrams * materialSalesRate;
  const materialMax = bucket.weightMaxGrams * materialSalesRate;
  const riskMultiplier =
    (material === "ABS" ? 1.15 : 1) * (dimensionRisk.priceMultiplier || 1);

  return {
    priceMin: Math.ceil((materialMin + laborMin) * riskMultiplier),
    priceMax: Math.ceil((materialMax + laborMax) * riskMultiplier),
    leadTimeMinHours: bucket.leadTimeMinHours,
    leadTimeMaxHours: bucket.leadTimeMaxHours,
    materialSalesRate,
    materialCostRate,
    riskNotice: dimensionRisk.notice,
    riskLevel: dimensionRisk.level,
    requiresManualConfirmation: dimensionRisk.requiresManualConfirmation,
  };
}

export function estimateOrderSummary(files: EstimateFileInput[], shippingMethod: ShippingMethod) {
  const fileEstimates = files.map((file) =>
    estimateFileBySize(file.filesize, file.material, file.dimensions),
  );
  const shipping = getShippingEstimate(shippingMethod);
  const shippingAmount = shipping.includedInAutoPrice ? shipping.amount || 0 : 0;
  const rawPriceMin =
    fileEstimates.reduce((total, estimate) => total + estimate.priceMin, 0) +
    PACKAGING_FEE +
    shippingAmount;
  const rawPriceMax =
    fileEstimates.reduce((total, estimate) => total + estimate.priceMax, 0) +
    PACKAGING_FEE +
    shippingAmount;
  const printTimeMin = fileEstimates.reduce(
    (total, estimate) => total + estimate.leadTimeMinHours,
    0,
  );
  const printTimeMax = fileEstimates.reduce(
    (total, estimate) => total + estimate.leadTimeMaxHours,
    0,
  );

  return {
    priceMin: Math.max(Math.ceil(rawPriceMin), ORDER_MIN_PRICE),
    priceMax: Math.max(Math.ceil(rawPriceMax), ORDER_MIN_PRICE),
    leadTimeMinHours: Math.ceil(printTimeMin / DEVICE_COUNT + PACKAGING_TIME_HOURS),
    leadTimeMaxHours: Math.ceil(printTimeMax / DEVICE_COUNT + PACKAGING_TIME_HOURS),
    packagingFee: PACKAGING_FEE,
    shippingFee: shipping.amount,
    shippingFeeEstimate: shipping.label,
    requiresManualConfirmation: fileEstimates.some(
      (estimate) => estimate.requiresManualConfirmation,
    ),
  };
}

export function getShippingEstimate(shippingMethod: ShippingMethod) {
  switch (shippingMethod) {
    case "顺丰快递":
      return { label: "18 元", amount: 18, includedInAutoPrice: true };
    case "西安本地跑腿":
      return { label: "人工确认", amount: null, includedInAutoPrice: false };
    case "普通快递":
    default:
      return { label: "10 元", amount: 10, includedInAutoPrice: true };
  }
}

export function getMaterialSalesRate(material: EstimateMaterial) {
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

export function getMaterialCostRate(material: EstimateMaterial) {
  switch (material) {
    case "PETG":
      return 0.03;
    case "ABS":
      return 0.05;
    case "PLA":
    default:
      return 0.05;
  }
}

function getSizeBucket(filesize: number) {
  if (filesize < 5 * MB) {
    return {
      weightMinGrams: 65,
      weightMaxGrams: 169,
      leadTimeMinHours: 4,
      leadTimeMaxHours: 8,
    };
  }

  if (filesize < 20 * MB) {
    return {
      weightMinGrams: 35,
      weightMaxGrams: 250,
      leadTimeMinHours: 8,
      leadTimeMaxHours: 24,
    };
  }

  return {
    weightMinGrams: 300,
    weightMaxGrams: 700,
    leadTimeMinHours: 24,
    leadTimeMaxHours: 48,
  };
}

function getDimensionRisk(dimensions: DimensionsMm) {
  const values = [dimensions.x, dimensions.y, dimensions.z].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  if (values.length === 0) {
    return {
      notice: "",
      level: "none",
      priceMultiplier: 1,
      requiresManualConfirmation: false,
    };
  }

  if (values.some((value) => value > 256)) {
    return {
      notice: "模型超出单台设备成型尺寸，通常需要分件打印，最终报价需人工确认。",
      level: "danger",
      priceMultiplier: 1.1,
      requiresManualConfirmation: true,
    };
  }

  if (values.some((value) => value > 240)) {
    return {
      notice: "模型接近设备成型极限，可能需要调整摆放或拆件。",
      level: "warning",
      priceMultiplier: 1.1,
      requiresManualConfirmation: false,
    };
  }

  if (values.some((value) => value < 10)) {
    return {
      notice: "模型尺寸较小，可能无法稳定打印，需要人工确认。",
      level: "warning",
      priceMultiplier: 1.15,
      requiresManualConfirmation: false,
    };
  }

  return {
    notice: "",
    level: "none",
    priceMultiplier: 1,
    requiresManualConfirmation: false,
  };
}
