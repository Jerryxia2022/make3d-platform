export type EstimateMaterial = "PLA" | "PETG" | "ABS" | string;

export type EstimateFileInput = {
  filesize: number;
  material: EstimateMaterial;
  color: string;
};

export type ShippingMethod = "普通快递" | "顺丰快递" | "西安本地跑腿" | "到店自取" | string;

const MB = 1024 * 1024;
const MANUAL_ORDER_FEE = 10;

export function estimateFileBySize(filesize: number, material: EstimateMaterial) {
  const bucket =
    filesize < 5 * MB
      ? { priceMin: 20, priceMax: 50, leadTimeMinHours: 4, leadTimeMaxHours: 8 }
      : filesize < 20 * MB
        ? { priceMin: 50, priceMax: 120, leadTimeMinHours: 8, leadTimeMaxHours: 24 }
        : { priceMin: 120, priceMax: 300, leadTimeMinHours: 24, leadTimeMaxHours: 48 };

  return {
    ...bucket,
    materialRate: getMaterialRate(material),
  };
}

export function estimateOrderSummary(files: EstimateFileInput[], shippingMethod: ShippingMethod) {
  const fileEstimates = files.map((file) => estimateFileBySize(file.filesize, file.material));

  return {
    priceMin: fileEstimates.reduce((total, estimate) => total + estimate.priceMin, MANUAL_ORDER_FEE),
    priceMax: fileEstimates.reduce((total, estimate) => total + estimate.priceMax, MANUAL_ORDER_FEE),
    leadTimeMinHours: fileEstimates.reduce(
      (total, estimate) => total + estimate.leadTimeMinHours,
      0,
    ),
    leadTimeMaxHours: fileEstimates.reduce(
      (total, estimate) => total + estimate.leadTimeMaxHours,
      0,
    ),
    shippingFeeEstimate: getShippingEstimate(shippingMethod),
  };
}

export function getShippingEstimate(shippingMethod: ShippingMethod) {
  switch (shippingMethod) {
    case "顺丰快递":
      return "18 元起";
    case "西安本地跑腿":
      return "需人工确认";
    case "到店自取":
      return "0 元";
    case "普通快递":
    default:
      return "10 元起";
  }
}

function getMaterialRate(material: EstimateMaterial) {
  switch (material) {
    case "PETG":
      return 0.25;
    case "ABS":
      return 0.3;
    case "PLA":
    default:
      return 0.15;
  }
}
