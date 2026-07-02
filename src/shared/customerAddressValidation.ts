import type { CustomerAddressInput } from "@/backend/database";
import {
  getCityByCode,
  getDistrictByCode,
  getProvinceByCode,
  OTHER_DISTRICT_CODE,
} from "@/shared/chinaRegions";

const phonePattern = /^1[3-9][0-9]{9}$/;

export type AddressInputResult =
  | { input: CustomerAddressInput; error: "" }
  | { input: null; error: string };

export function readCustomerAddressInput(body: Record<string, unknown>): CustomerAddressInput {
  const provinceCode = readString(body.provinceCode);
  const cityCode = readString(body.cityCode);
  const districtCode = readString(body.districtCode);
  const districtCustom = readString(body.districtCustom);
  const provinceName = readString(body.provinceName || body.province);
  const cityName = readString(body.cityName || body.city);
  const districtName = readString(body.districtName || body.district);

  return {
    recipientName: readString(body.recipientName),
    phone: readString(body.phone),
    province: provinceName,
    city: cityName,
    district: districtCustom || districtName,
    provinceCode,
    provinceName,
    cityCode,
    cityName,
    districtCode,
    districtName,
    districtCustom: districtCustom || null,
    detailAddress: readString(body.detailAddress),
    postalCode: readString(body.postalCode) || null,
    label: readString(body.label) || null,
    isDefault: Boolean(body.isDefault),
  };
}

export function validateAndNormalizeCustomerAddressInput(
  input: CustomerAddressInput,
): AddressInputResult {
  if (!isValidRecipientName(input.recipientName)) {
    return { input: null, error: "收件人姓名需 2-40 个字符，可包含中英文、数字、空格、连字符和间隔号，且至少包含一个中英文字符" };
  }

  if (!phonePattern.test(input.phone)) {
    return { input: null, error: "手机号必须为中国大陆 11 位手机号" };
  }

  const province = input.provinceCode ? getProvinceByCode(input.provinceCode) : null;
  if (!province) {
    return { input: null, error: "请选择有效省份" };
  }

  const city = input.cityCode ? getCityByCode(province.code, input.cityCode) : null;
  if (!city) {
    return { input: null, error: "请选择有效城市" };
  }

  const usesCustomDistrict = input.districtCode === OTHER_DISTRICT_CODE;
  const district = !usesCustomDistrict && input.districtCode
    ? getDistrictByCode(province.code, city.code, input.districtCode)
    : null;

  if (!usesCustomDistrict && !district) {
    return { input: null, error: "请选择有效区/县" };
  }

  if (usesCustomDistrict && !input.districtCustom?.trim()) {
    return { input: null, error: "选择其他区/县时，请填写区县名称" };
  }

  if (!input.detailAddress || input.detailAddress.trim().length < 5) {
    return { input: null, error: "详细地址不能为空，且建议不少于 5 个字符" };
  }

  if (input.label && input.label.length > 10) {
    return { input: null, error: "地址标签最多 10 个字符" };
  }

  if (input.postalCode && !/^[0-9]{1,10}$/.test(input.postalCode)) {
    return { input: null, error: "邮编只能填写数字，最多 10 位" };
  }

  const districtName = usesCustomDistrict ? "其他" : district?.name || "";
  const districtCustom = usesCustomDistrict ? input.districtCustom?.trim() || "" : null;

  return {
    input: {
      ...input,
      recipientName: input.recipientName.trim(),
      phone: input.phone.trim(),
      province: province.name,
      provinceName: province.name,
      provinceCode: province.code,
      city: city.name,
      cityName: city.name,
      cityCode: city.code,
      district: districtCustom || districtName,
      districtName,
      districtCode: usesCustomDistrict ? OTHER_DISTRICT_CODE : district?.code || "",
      districtCustom,
      detailAddress: input.detailAddress.trim(),
      postalCode: input.postalCode?.trim() || null,
      label: input.label?.trim() || null,
      isDefault: Boolean(input.isDefault),
    },
    error: "",
  };
}

export function isValidRecipientName(value: string) {
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 40) {
    return false;
  }

  if (!/^[\u4e00-\u9fa5A-Za-z0-9·\s-]+$/.test(normalized)) {
    return false;
  }

  return /[\u4e00-\u9fa5A-Za-z]/.test(normalized);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
