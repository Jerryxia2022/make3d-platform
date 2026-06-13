export type AutoPricingMaterial = "PLA" | "PETG" | "ABS" | string;

export type AutoFilePriceInput = {
  material: AutoPricingMaterial;
  filamentWeightG: number;
  printTimeSeconds: number;
  packagingFee?: number;
  packagingShare?: number;
};

export type AutoOrderPriceInput = {
  filePrices: number[];
  shippingMethod: string;
};

const MATERIAL_RATES: Record<string, number> = {
  PLA: 0.25,
  PETG: 0.2,
  ABS: 0.35,
};

const LABOR_RATE_PER_HOUR = 1.5;
const MIN_LABOR_FEE = 5;
const ORDER_MIN_PRICE = 20;
const DEFAULT_DEVICE_COUNT = 6;
const DELIVERY_BUFFER_HOURS = 24;

export function calculateAutoFilePrice(input: AutoFilePriceInput) {
  const materialFee = roundMoney(
    safePositiveNumber(input.filamentWeightG) * getMaterialRate(input.material),
  );
  const printHours = safePositiveNumber(input.printTimeSeconds) / 3600;
  const laborFee = roundMoney(Math.max(printHours * LABOR_RATE_PER_HOUR, MIN_LABOR_FEE));
  const packagingFee = roundMoney(
    safePositiveNumber(input.packagingFee ?? input.packagingShare),
  );
  const estimatedPrice = roundMoney(materialFee + laborFee + packagingFee);

  return {
    materialFee,
    laborFee,
    packagingFee,
    packagingShare: packagingFee,
    estimatedPrice,
  };
}

export function calculateAutoLeadTimeHours(
  printTimeSecondsList: Array<number | null | undefined>,
  deviceCount = DEFAULT_DEVICE_COUNT,
) {
  const usablePrintTimes = printTimeSecondsList.filter(
    (seconds): seconds is number =>
      typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0,
  );
  const safeDeviceCount = Number.isFinite(deviceCount) && deviceCount > 0 ? deviceCount : 1;
  const printHours = usablePrintTimes.map((seconds) => safePositiveNumber(seconds) / 3600);
  const longestPrintHours = Math.max(...printHours);
  const remainingPrintHours = printHours.reduce((total, hours) => total + hours, 0) - longestPrintHours;
  const sharedRemainingHours = usablePrintTimes.length > 1 ? remainingPrintHours / safeDeviceCount : 0;

  return Math.ceil(longestPrintHours + sharedRemainingHours + DELIVERY_BUFFER_HOURS);
}

export function calculateAutoOrderPrice(input: AutoOrderPriceInput) {
  const subtotal = input.filePrices.reduce((total, price) => total + safePositiveNumber(price), 0);
  const shippingFee = getShippingFee(input.shippingMethod);
  const shippingAmount = shippingFee ?? 0;

  return {
    subtotal: roundMoney(subtotal),
    shippingFee,
    requiresManualShipping: shippingFee == null,
    estimatedPrice: roundMoney(Math.max(subtotal + shippingAmount, ORDER_MIN_PRICE)),
  };
}

export function getShippingFee(shippingMethod: string) {
  switch (shippingMethod) {
    case "顺丰快递":
      return 18;
    case "西安本地跑腿":
      return null;
    case "普通快递":
    default:
      return 10;
  }
}

export function getMaterialRate(material: AutoPricingMaterial) {
  return MATERIAL_RATES[String(material).toUpperCase()] ?? MATERIAL_RATES.PLA;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function safePositiveNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}
