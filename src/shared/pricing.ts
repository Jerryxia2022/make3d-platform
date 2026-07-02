export const MIN_PRINT_UNIT_PRICE = 5;

export function roundMoney(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return Math.round(safeValue * 100) / 100;
}

export function safePositiveMoney(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

export function applyMinimumPrintUnitPrice(calculatedUnitPrice: number | null | undefined) {
  return roundMoney(Math.max(roundMoney(safePositiveMoney(calculatedUnitPrice)), MIN_PRINT_UNIT_PRICE));
}

export function calculateLinePrintTotal(calculatedUnitPrice: number | null | undefined, quantity: number) {
  const safeQuantity = getSafePrintQuantity(quantity);
  const unitPrice = applyMinimumPrintUnitPrice(calculatedUnitPrice);

  return {
    unitPrice,
    subtotalPrice: roundMoney(unitPrice * safeQuantity),
  };
}

export function getSafePrintQuantity(quantity: number | null | undefined) {
  return typeof quantity === "number" && Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000
    ? quantity
    : 1;
}

export function isSameMoney(left: number | null | undefined, right: number | null | undefined) {
  return Math.abs(safePositiveMoney(left) - safePositiveMoney(right)) < 0.01;
}
