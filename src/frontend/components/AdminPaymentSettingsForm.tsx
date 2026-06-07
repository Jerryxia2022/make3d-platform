"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PaymentSettings } from "@/backend/database";

export function AdminPaymentSettingsForm({ settings }: { settings: PaymentSettings }) {
  const router = useRouter();
  const [wechatQrPath, setWechatQrPath] = useState(settings.wechatQrPath || "");
  const [alipayQrPath, setAlipayQrPath] = useState(settings.alipayQrPath || "");
  const [xianyuUrl, setXianyuUrl] = useState(settings.xianyuUrl || "");
  const [taobaoUrl, setTaobaoUrl] = useState(settings.taobaoUrl || "");
  const [otherNote, setOtherNote] = useState(settings.otherNote || "");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        body: JSON.stringify({
          wechatQrPath,
          alipayQrPath,
          xianyuUrl,
          taobaoUrl,
          otherNote,
        }),
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
    <form className="mt-6 grid gap-5 border border-ink/10 bg-white/80 p-6 shadow-sm" onSubmit={handleSubmit}>
      <TextInput
        label="微信收款二维码图片路径"
        onChange={setWechatQrPath}
        placeholder="/payment/wechat-qr.png"
        value={wechatQrPath}
      />
      <TextInput
        label="支付宝收款二维码图片路径"
        onChange={setAlipayQrPath}
        placeholder="/payment/alipay-qr.png"
        value={alipayQrPath}
      />
      <TextInput
        label="闲鱼付款链接"
        onChange={setXianyuUrl}
        placeholder="https://..."
        value={xianyuUrl}
      />
      <TextInput
        label="淘宝付款链接"
        onChange={setTaobaoUrl}
        placeholder="https://..."
        value={taobaoUrl}
      />
      <label className="text-sm font-semibold">
        其他付款说明
        <textarea
          className="mt-2 min-h-28 w-full border border-ink/20 bg-white px-3 py-2 font-normal"
          onChange={(event) => setOtherNote(event.target.value)}
          placeholder="例如：也可以通过微信人工沟通付款方式。"
          value={otherNote}
        />
      </label>
      <button
        className="w-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:bg-graphite/60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "保存中..." : "保存付款设置"}
      </button>
      {message ? <p className="text-sm font-semibold text-coral">{message}</p> : null}
    </form>
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
  placeholder: string;
  value: string;
}) {
  return (
    <label className="text-sm font-semibold">
      {label}
      <input
        className="mt-2 w-full border border-ink/20 bg-white px-3 py-2 font-normal"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
