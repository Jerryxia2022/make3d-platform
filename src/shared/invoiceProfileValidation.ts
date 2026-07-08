import {
  INVOICE_PROFILE_LIMIT,
  type InvoiceType,
  normalizeInvoiceType,
} from "@/shared/invoice";

export type InvoiceProfileInput = {
  invoiceType: Extract<InvoiceType, "ordinary" | "special">;
  title: string;
  taxpayerId: string;
  registeredAddress?: string | null;
  registeredPhone?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  receiverContact: string;
};

export function readInvoiceProfileInput(body: Record<string, unknown>): InvoiceProfileInput {
  const invoiceType = normalizeInvoiceType(body.invoiceType);

  return {
    invoiceType: invoiceType === "special" ? "special" : "ordinary",
    title: readString(body.title),
    taxpayerId: readString(body.taxpayerId),
    registeredAddress: readString(body.registeredAddress) || null,
    registeredPhone: readString(body.registeredPhone) || null,
    bankName: readString(body.bankName) || null,
    bankAccount: readString(body.bankAccount) || null,
    receiverContact: readString(body.receiverContact),
  };
}

export function validateInvoiceProfileInput(input: InvoiceProfileInput) {
  if (!input.title) {
    return "请填写发票抬头全称";
  }

  if (!input.taxpayerId) {
    return "请填写纳税人识别号或统一社会信用代码";
  }

  if (!input.receiverContact) {
    return "请填写接收邮箱或手机号";
  }

  if (input.invoiceType === "special") {
    const missing = [
      ["registeredAddress", "注册地址"],
      ["registeredPhone", "注册电话"],
      ["bankName", "开户银行"],
      ["bankAccount", "银行账号"],
    ].find(([key]) => !input[key as keyof InvoiceProfileInput]);

    if (missing) {
      return `增值税专用发票请填写${missing[1]}`;
    }
  }

  return "";
}

export { INVOICE_PROFILE_LIMIT };

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
