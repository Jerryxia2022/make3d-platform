export const INVOICE_PROFILE_LIMIT = 2;
export const INVOICE_FACE_TAX_RATE_BPS = 100;

export const invoiceTypes = ["none", "ordinary", "special"] as const;
export type InvoiceType = (typeof invoiceTypes)[number];

export const INVOICE_TYPE_LABELS: Record<InvoiceType, string> = {
  none: "不需要发票",
  ordinary: "电子普通发票",
  special: "增值税专用发票",
};

export const INVOICE_PRICE_ADJUSTMENT_BPS: Record<InvoiceType, number> = {
  none: 0,
  ordinary: 300,
  special: 700,
};

export type InvoiceCalculation = {
  invoiceType: InvoiceType;
  invoiceRequired: boolean;
  invoiceRateBps: number;
  invoicePriceAdjustmentBps: number;
  invoiceBaseAmountCents: number;
  invoiceAdjustmentAmountCents: number;
  invoiceTotalAmountCents: number;
};

export function normalizeInvoiceType(value: unknown): InvoiceType {
  return invoiceTypes.includes(value as InvoiceType) ? (value as InvoiceType) : "none";
}

export function isInvoiceRequired(invoiceType: InvoiceType) {
  return invoiceType !== "none";
}

export function calculateInvoiceTotalCents(
  baseAmountCents: number,
  invoiceType: InvoiceType,
): InvoiceCalculation {
  const safeBase = Number.isInteger(baseAmountCents) && baseAmountCents > 0 ? baseAmountCents : 0;
  const adjustmentBps = INVOICE_PRICE_ADJUSTMENT_BPS[invoiceType];
  const total = roundRatioToCents(safeBase, 10000 + adjustmentBps, 10000);

  return {
    invoiceType,
    invoiceRequired: isInvoiceRequired(invoiceType),
    invoiceRateBps: INVOICE_FACE_TAX_RATE_BPS,
    invoicePriceAdjustmentBps: adjustmentBps,
    invoiceBaseAmountCents: safeBase,
    invoiceAdjustmentAmountCents: total - safeBase,
    invoiceTotalAmountCents: total,
  };
}

export function yuanToCents(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function centsToYuan(cents: number) {
  return cents / 100;
}

export function formatCentsAsYuan(cents: number) {
  return `¥${(cents / 100).toFixed(2)}`;
}

export function formatBpsPercent(bps: number) {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

export function maskTaxpayerId(value: string | null | undefined) {
  const normalized = String(value || "").trim();

  if (normalized.length <= 6) {
    return normalized ? `${normalized.slice(0, 2)}***` : "";
  }

  return `${normalized.slice(0, 3)}***${normalized.slice(-3)}`;
}

function roundRatioToCents(amountCents: number, numerator: number, denominator: number) {
  return Math.floor((amountCents * numerator + denominator / 2) / denominator);
}
