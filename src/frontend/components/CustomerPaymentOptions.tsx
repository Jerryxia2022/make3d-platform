"use client";

import { useMemo, useState } from "react";
import type { PaymentSettings } from "@/backend/database";

type PaymentMethodView = {
  key: "wechat" | "alipay" | "bank";
  label: string;
};

export function CustomerPaymentOptions({ settings }: { settings: PaymentSettings }) {
  const methods = useMemo(() => getEnabledMethods(settings), [settings]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodView["key"]>(
    methods[0]?.key || "wechat",
  );
  const selected = methods.find((method) => method.key === selectedMethod) || methods[0];

  if (methods.length === 0) {
    return (
      <div className="surface-soft mt-5 p-5">
        <p className="text-sm font-semibold text-coral">在线付款资料正在配置中</p>
        <p className="mt-2 text-sm leading-6 text-graphite">
          请通过右下角在线咨询或公众号关键词【人工】确认付款方式。工作人员核对到账后会更新订单状态。
        </p>
        {settings.customerServiceHours ? (
          <p className="mt-2 text-sm text-graphite">客服时间：{settings.customerServiceHours}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="surface-soft mt-5 p-5">
      <label className="block text-sm font-semibold">
        付款方式
        <select
          className="field-input mt-2 py-2"
          onChange={(event) => setSelectedMethod(event.target.value as PaymentMethodView["key"])}
          value={selected?.key || ""}
        >
          {methods.map((method) => (
            <option key={method.key} value={method.key}>
              {method.label}
            </option>
          ))}
        </select>
      </label>
      {selected ? <PaymentMethodDetail method={selected.key} settings={settings} /> : null}
      {settings.paymentNotice ? (
        <p className="notice-warning mt-4 px-4 py-3 text-sm font-semibold">
          {settings.paymentNotice}
        </p>
      ) : null}
    </div>
  );
}

function getEnabledMethods(settings: PaymentSettings): PaymentMethodView[] {
  const methods: PaymentMethodView[] = [];

  if (settings.wechatEnabled) {
    methods.push({ key: "wechat", label: settings.wechatDisplayName || "微信转账" });
  }

  if (settings.alipayEnabled) {
    methods.push({ key: "alipay", label: settings.alipayDisplayName || "支付宝转账" });
  }

  if (settings.bankEnabled) {
    methods.push({ key: "bank", label: "银行转账" });
  }

  return methods;
}

function PaymentMethodDetail({
  method,
  settings,
}: {
  method: PaymentMethodView["key"];
  settings: PaymentSettings;
}) {
  if (method === "wechat") {
    return (
      <QrDetail
        alt="微信收款码"
        instruction={settings.wechatPaymentInstruction}
        path={settings.wechatQrImagePath || settings.wechatQrPath}
      />
    );
  }

  if (method === "alipay") {
    return (
      <QrDetail
        alt="支付宝收款码"
        instruction={settings.alipayPaymentInstruction}
        path={settings.alipayQrImagePath || settings.alipayQrPath}
      />
    );
  }

  return (
    <div className="mt-4 grid gap-3 text-sm">
      <PaymentInfo label="户名" value={settings.bankAccountName} />
      <PaymentInfo label="开户行" value={settings.bankName} />
      <PaymentInfo label="支行" value={settings.bankBranch} />
      <PaymentInfo label="账号" value={settings.bankAccount ? maskBankAccount(settings.bankAccount) : null} />
      <p className="whitespace-pre-wrap leading-6 text-graphite">
        {settings.bankPaymentInstruction || "转账时请备注订单编号或注册手机号，便于人工核对。"}
      </p>
    </div>
  );
}

function QrDetail({
  alt,
  instruction,
  path,
}: {
  alt: string;
  instruction?: string | null;
  path: string | null;
}) {
  if (!path) {
    return <p className="mt-4 text-sm text-graphite">收款码暂未配置，请联系工作人员获取。</p>;
  }

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start">
      {/* eslint-disable-next-line @next/next/no-img-element -- Payment QR paths are admin-configured and may be local or external. */}
      <img alt={alt} className="h-48 w-48 border border-ink/10 bg-white object-contain p-2" src={path} />
      <div className="text-sm leading-6 text-graphite">
        <p className="font-semibold text-ink">付款时请备注订单编号或注册手机号</p>
        <p className="mt-2 whitespace-pre-wrap">{instruction || "付款完成后无需额外提交材料，工作人员会人工核对到账。"}</p>
      </div>
    </div>
  );
}

function PaymentInfo({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-[4rem_1fr] gap-3">
      <span className="font-semibold text-graphite">{label}</span>
      <span className="break-all">{value || "-"}</span>
    </div>
  );
}

function maskBankAccount(value: string) {
  const normalized = value.replace(/\s+/g, "");
  if (normalized.length <= 8) {
    return normalized;
  }

  return `${normalized.slice(0, 4)} **** **** ${normalized.slice(-4)}`;
}
