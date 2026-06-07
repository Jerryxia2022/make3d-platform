"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminPaymentConfirmForm({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState("微信转账");
  const [paymentNote, setPaymentNote] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/payment-confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentMethod,
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
    <form className="border border-coral/30 bg-coral/5 p-4 shadow-sm" onSubmit={handleSubmit}>
      <h2 className="text-base font-bold">待付款核对</h2>
      <p className="mt-2 text-sm text-graphite">付款时请备注：订单编号/手机号</p>
      <label className="mt-4 block text-sm font-semibold">
        到账方式
        <select
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setPaymentMethod(event.target.value)}
          value={paymentMethod}
        >
          {["微信转账", "支付宝转账", "闲鱼付款", "淘宝付款", "其他人工沟通"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-sm font-semibold">
        到账备注
        <textarea
          className="mt-2 min-h-20 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setPaymentNote(event.target.value)}
          placeholder="例如：微信到账 / 支付宝到账 / 闲鱼付款 / 淘宝付款"
          value={paymentNote}
        />
      </label>
      <button
        className="mt-3 w-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:bg-graphite/60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "确认中..." : "确认到账"}
      </button>
      {message ? <p className="mt-3 text-sm font-semibold text-coral">{message}</p> : null}
    </form>
  );
}
