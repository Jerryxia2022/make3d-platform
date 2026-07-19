export const AUTO_QUOTE_MIN_DIMENSION_MM = 10;
export const AUTO_QUOTE_MAX_DIMENSION_MM = 300;

export type ModelDimensionsMm = {
  x: number;
  y: number;
  z: number;
};

export type ModelDimensionEligibility = {
  eligible: boolean;
  reasonCode: "ELIGIBLE" | "DIMENSIONS_MISSING" | "DIMENSION_BELOW_MIN" | "DIMENSION_ABOVE_MAX";
  message: string;
};

export function evaluateAutoQuoteDimensions(
  dimensions: Partial<ModelDimensionsMm> | null | undefined,
): ModelDimensionEligibility {
  const values = [dimensions?.x, dimensions?.y, dimensions?.z];
  if (!values.every((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)) {
    return {
      eligible: false,
      reasonCode: "DIMENSIONS_MISSING",
      message: "模型尺寸无法完整识别，需人工确认。",
    };
  }

  if (values.some((value) => value < AUTO_QUOTE_MIN_DIMENSION_MM)) {
    return {
      eligible: false,
      reasonCode: "DIMENSION_BELOW_MIN",
      message: `模型任一方向小于 ${AUTO_QUOTE_MIN_DIMENSION_MM} mm，需人工确认。`,
    };
  }

  if (values.some((value) => value > AUTO_QUOTE_MAX_DIMENSION_MM)) {
    return {
      eligible: false,
      reasonCode: "DIMENSION_ABOVE_MAX",
      message: `模型任一方向大于 ${AUTO_QUOTE_MAX_DIMENSION_MM} mm，需人工确认。`,
    };
  }

  return {
    eligible: true,
    reasonCode: "ELIGIBLE",
    message: `模型尺寸位于 ${AUTO_QUOTE_MIN_DIMENSION_MM}-${AUTO_QUOTE_MAX_DIMENSION_MM} mm 自动报价范围内。`,
  };
}
