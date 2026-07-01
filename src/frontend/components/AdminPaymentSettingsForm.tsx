"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PaymentSettings } from "@/backend/database";

export function AdminPaymentSettingsForm({ settings }: { settings: PaymentSettings }) {
  const router = useRouter();
  const [form, setForm] = useState({
    wechatEnabled: settings.wechatEnabled,
    wechatDisplayName: settings.wechatDisplayName || "微信转账",
    wechatQrImagePath: settings.wechatQrImagePath || settings.wechatQrPath || "",
    wechatPaymentInstruction: settings.wechatPaymentInstruction || "",
    alipayEnabled: settings.alipayEnabled,
    alipayDisplayName: settings.alipayDisplayName || "支付宝转账",
    alipayQrImagePath: settings.alipayQrImagePath || settings.alipayQrPath || "",
    alipayPaymentInstruction: settings.alipayPaymentInstruction || "",
    bankEnabled: settings.bankEnabled,
    bankAccountName: settings.bankAccountName || "",
    bankName: settings.bankName || "",
    bankBranch: settings.bankBranch || "",
    bankAccount: settings.bankAccount || "",
    bankPaymentInstruction: settings.bankPaymentInstruction || "",
    paymentNotice: settings.paymentNotice || "",
    customerServiceHours: settings.customerServiceHours || "",
    serviceAccountQrPath: settings.serviceAccountQrPath || "/brand/make3d-service-qrcode.png",
    publicSecurityRecordNumber: settings.publicSecurityRecordNumber || "",
    publicSecurityRecordUrl: settings.publicSecurityRecordUrl || "",
    publicSecurityRecordEnabled: settings.publicSecurityRecordEnabled,
  });
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/settings/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "付款设置保存失败");
      }

      setMessage("付款设置已保存");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "付款设置保存失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="surface-card mt-6 grid gap-5 p-6" onSubmit={handleSubmit}>
      <div className="notice-warning px-4 py-3 text-sm leading-6">
        付款方式默认关闭。请仅在收款码、银行信息和对账规则确认后启用，不要在代码仓库中保存真实银行完整信息。
      </div>

      <PaymentMethodSection
        checked={form.wechatEnabled}
        onToggle={(value) => updateField("wechatEnabled", value)}
        title="微信转账"
      >
        <TextInput label="显示名称" onChange={(value) => updateField("wechatDisplayName", value)} value={form.wechatDisplayName} />
        <TextInput label="微信收款码图片路径" onChange={(value) => updateField("wechatQrImagePath", value)} placeholder="/payment/wechat-qr.png" value={form.wechatQrImagePath} />
        <TextArea label="微信付款说明" onChange={(value) => updateField("wechatPaymentInstruction", value)} placeholder="付款时请备注订单编号或注册手机号。" value={form.wechatPaymentInstruction} />
      </PaymentMethodSection>

      <PaymentMethodSection
        checked={form.alipayEnabled}
        onToggle={(value) => updateField("alipayEnabled", value)}
        title="支付宝转账"
      >
        <TextInput label="显示名称" onChange={(value) => updateField("alipayDisplayName", value)} value={form.alipayDisplayName} />
        <TextInput label="支付宝收款码图片路径" onChange={(value) => updateField("alipayQrImagePath", value)} placeholder="/payment/alipay-qr.png" value={form.alipayQrImagePath} />
        <TextArea label="支付宝付款说明" onChange={(value) => updateField("alipayPaymentInstruction", value)} placeholder="付款后请等待管理员人工核对到账。" value={form.alipayPaymentInstruction} />
      </PaymentMethodSection>

      <PaymentMethodSection
        checked={form.bankEnabled}
        onToggle={(value) => updateField("bankEnabled", value)}
        title="银行转账"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput label="户名" onChange={(value) => updateField("bankAccountName", value)} value={form.bankAccountName} />
          <TextInput label="开户行" onChange={(value) => updateField("bankName", value)} value={form.bankName} />
          <TextInput label="支行（可选）" onChange={(value) => updateField("bankBranch", value)} value={form.bankBranch} />
          <TextInput label="账号" onChange={(value) => updateField("bankAccount", value)} value={form.bankAccount} />
        </div>
        <TextArea label="银行转账说明" onChange={(value) => updateField("bankPaymentInstruction", value)} placeholder="转账备注请填写订单编号或注册手机号。" value={form.bankPaymentInstruction} />
      </PaymentMethodSection>

      <div className="grid gap-4 md:grid-cols-2">
        <TextInput label="客服二维码路径" onChange={(value) => updateField("serviceAccountQrPath", value)} placeholder="/brand/make3d-service-qrcode.png" value={form.serviceAccountQrPath} />
        <TextInput label="客服响应时间" onChange={(value) => updateField("customerServiceHours", value)} placeholder="工作日晚上和周末优先处理复杂沟通" value={form.customerServiceHours} />
      </div>
      <TextArea label="客户付款页统一提示" onChange={(value) => updateField("paymentNotice", value)} placeholder="客户不能上传付款截图，到账后由管理员人工确认。" value={form.paymentNotice} />

      <PaymentMethodSection
        checked={form.publicSecurityRecordEnabled}
        onToggle={(value) => updateField("publicSecurityRecordEnabled", value)}
        title="公安联网备案"
      >
        <div className="notice-warning px-4 py-3 text-sm leading-6">
          未取得正式公安联网备案号前请保持关闭。关闭时客户页面不会显示任何公安备案占位内容。
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TextInput label="公安备案号" onChange={(value) => updateField("publicSecurityRecordNumber", value)} placeholder="取得后填写正式备案号" value={form.publicSecurityRecordNumber} />
          <TextInput label="公安备案链接" onChange={(value) => updateField("publicSecurityRecordUrl", value)} placeholder="取得后填写官方链接" value={form.publicSecurityRecordUrl} />
        </div>
      </PaymentMethodSection>

      <button className="btn-primary w-full px-5 py-3" disabled={isSubmitting} type="submit">
        {isSubmitting ? "保存中..." : "保存付款设置"}
      </button>
      {message ? <p className="text-sm font-semibold text-coral">{message}</p> : null}
    </form>
  );
}

function PaymentMethodSection({
  checked,
  children,
  onToggle,
  title,
}: {
  checked: boolean;
  children: React.ReactNode;
  onToggle: (checked: boolean) => void;
  title: string;
}) {
  return (
    <section className="surface-soft p-4">
      <label className="flex items-center justify-between gap-3 text-sm font-bold">
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <input checked={checked} className="h-4 w-4" onChange={(event) => onToggle(event.target.checked)} type="checkbox" />
          启用
        </span>
      </label>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function TextInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        className="field-input mt-2 py-2"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function TextArea({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <textarea
        className="field-input mt-2 min-h-24"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
