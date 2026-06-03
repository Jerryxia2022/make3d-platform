export const mainlandPhoneHtmlPattern = "^1[3-9][0-9]{9}$";
export const mainlandPhoneErrorMessage = "请填写正确的11位中国大陆手机号";

const mainlandPhonePattern = /^1[3-9]\d{9}$/;

export function normalizePhone(value: string) {
  return value.trim();
}

export function isValidMainlandPhone(value: string) {
  return mainlandPhonePattern.test(normalizePhone(value));
}
