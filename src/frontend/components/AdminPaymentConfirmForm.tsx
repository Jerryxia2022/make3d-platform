"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const PAYMENT_METHODS = [
  { value: "wechat", label: "微信转账" },
  { value: "alipay", label: "支付宝转账" },
  { value: "bank_transfer", label: "银行转账" },
];

export function AdminPaymentConfirmForm({
  expectedAmount,
  orderId,
}: {
  expectedAmount: number;
  orderId: number;
}) {
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState("wechat");
  const [paidAmount, setPaidAmount] = useState(String(expectedAmount || ""));
  const [paidAt, setPaidAt] = useState("");
  const [payerName, setPayerName] = useState("");
  const [payerReference, setPayerReference] = useState("");
  const [platformTradeNo, setPlatformTradeNo] = useState("");
  const [paymentDifferenceReason, setPaymentDifferenceReason] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const parsedPaidAmount = Number(paidAmount);
  const hasDifference =
    Number.isFinite(parsedPaidAmount) && Math.round(parsedPaidAmount * 100) !== Math.round(expectedAmount * 100);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!Number.isFinite(parsedPaidAmount) || parsedPaidAmount <= 0) {
      setMessage("请填写有效实收金额");
      return;
    }

    if (hasDifference && !paymentDifferenceReason.trim()) {
      setMessage("实收金额与应收金额不一致时，请填写差额原因");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/payment-confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentMethod,
          paidAmount: parsedPaidAmount,
          paidAt,
          payerName,
          payerReference,
          platformTradeNo,
          paymentDifferenceReason,
          paymentNote,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "确认到账失败");
      }

      setMessage("已确认到账，订单状态已更新为已付款");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "确认到账失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="notice-warning p-4" onSubmit={handleSubmit}>
      <h2 className="text-base font-bold">待付款核对</h2>
      <p className="mt-2 text-sm text-graphite">付款时请备注：订单编号/手机号</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold">
          到账方式
          <select
            className="field-input mt-2 py-2"
            onChange={(event) => setPaymentMethod(event.target.value)}
            value={paymentMethod}
          >
            {PAYMENT_METHODS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          实收金额
          <input
            className="field-input mt-2 py-2"
            min="0.01"
            onChange={(event) => setPaidAmount(event.target.value)}
            step="0.01"
            type="number"
            value={paidAmount}
          />
        </label>
        <label className="text-sm font-semibold">
          到账时间
          <input
            className="field-input mt-2 py-2"
            onChange={(event) => setPaidAt(event.target.value)}
            type="datetime-local"
            value={paidAt}
          />
        </label>
        <label className="text-sm font-semibold">
          付款人/备注名
          <input className="field-input mt-2 py-2" onChange={(event) => setPayerName(event.target.value)} value={payerName} />
        </label>
        <label className="text-sm font-semibold">
          手机号/付款备注
          <input className="field-input mt-2 py-2" onChange={(event) => setPayerReference(event.target.value)} value={payerReference} />
        </label>
        <label className="text-sm font-semibold">
          平台流水号
          <input className="field-input mt-2 py-2" onChange={(event) => setPlatformTradeNo(event.target.value)} value={platformTradeNo} />
        </label>
      </div>
      {hasDifference ? (
        <label className="mt-3 block text-sm font-semibold">
          差额原因
          <textarea
            className="field-input mt-2 min-h-16"
            onChange={(event) => setPaymentDifferenceReason(event.target.value)}
            placeholder="例如：客户多付运费 / 抹零 / 补差价"
            required
            value={paymentDifferenceReason}
          />
        </label>
      ) : null}
      <label className="mt-3 block text-sm font-semibold">
        到账备注
        <textarea
          className="field-input mt-2 min-h-20"
          onChange={(event) => setPaymentNote(event.target.value)}
          placeholder="例如：微信到账 / 支付宝到账 / 银行转账到账"
          value={paymentNote}
        />
      </label>
      <button className="btn-primary mt-3 w-full px-4 py-2" disabled={isSubmitting} type="submit">
        {isSubmitting ? "确认中..." : "确认到账"}
      </button>
      {message ? <p className="mt-3 text-sm font-semibold text-coral">{message}</p> : null}
    </form>
  );
}
