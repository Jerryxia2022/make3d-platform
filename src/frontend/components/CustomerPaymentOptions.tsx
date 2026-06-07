"use client";

import { useState } from "react";
import type { PaymentSettings } from "@/backend/database";

const methods = ["微信转账", "支付宝转账", "闲鱼链接", "淘宝链接", "其他人工沟通"] as const;

export function CustomerPaymentOptions({ settings }: { settings: PaymentSettings }) {
  const [selectedMethod, setSelectedMethod] = useState<(typeof methods)[number]>("微信转账");

  return (
    <div className="mt-5 border border-ink/10 bg-white p-5">
      <label className="block text-sm font-semibold">
        付款方式
        <select
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setSelectedMethod(event.target.value as (typeof methods)[number])}
          value={selectedMethod}
        >
          {methods.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </label>
      <PaymentMethodDetail method={selectedMethod} settings={settings} />
    </div>
  );
}

function PaymentMethodDetail({
  method,
  settings,
}: {
  method: (typeof methods)[number];
  settings: PaymentSettings;
}) {
  if (method === "微信转账") {
    return <QrDetail alt="微信收款码" path={settings.wechatQrPath} />;
  }

  if (method === "支付宝转账") {
    return <QrDetail alt="支付宝收款码" path={settings.alipayQrPath} />;
  }

  if (method === "闲鱼链接") {
    return <LinkDetail label="打开闲鱼付款链接" url={settings.xianyuUrl} />;
  }

  if (method === "淘宝链接") {
    return <LinkDetail label="打开淘宝付款链接" url={settings.taobaoUrl} />;
  }

  return (
    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-graphite">
      {settings.otherNote || "请通过微信或电话与工作人员确认其他付款方式。"}
    </p>
  );
}

function QrDetail({ alt, path }: { alt: string; path: string | null }) {
  if (!path) {
    return <p className="mt-4 text-sm text-graphite">收款码暂未配置，请联系工作人员获取。</p>;
  }

  return (
    <div className="mt-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- Payment QR paths are admin-configured and may be local or external. */}
      <img alt={alt} className="h-48 w-48 border border-ink/10 object-contain" src={path} />
      <p className="mt-3 break-all text-sm text-graphite">{path}</p>
    </div>
  );
}

function LinkDetail({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return <p className="mt-4 text-sm text-graphite">付款链接暂未配置，请联系工作人员获取。</p>;
  }

  return (
    <a
      className="mt-4 inline-flex border border-ink/20 px-4 py-2 text-sm font-semibold"
      href={url}
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </a>
  );
}
