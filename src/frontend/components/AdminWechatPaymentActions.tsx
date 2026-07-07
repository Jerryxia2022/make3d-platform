"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminWechatPaymentActions({
  amountCents,
  paymentNo,
  refundedAmountCents,
  status,
}: {
  amountCents: number;
  paymentNo: string;
  refundedAmountCents: number;
  status: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [refundAmount, setRefundAmount] = useState(String(Math.max(0, amountCents - refundedAmountCents)));
  const [refundReason, setRefundReason] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const refundable = status === "paid" || status === "partially_refunded";

  async function post(path: string, body?: unknown) {
    setMessage("");
    const response = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "操作失败");
    }
    router.refresh();
    return result;
  }

  async function handleQuery() {
    try {
      await post(`/api/admin/payments/wechat/${paymentNo}/query`);
      setMessage("查单完成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "查单失败");
    }
  }

  async function handleClose() {
    try {
      await post(`/api/admin/payments/wechat/${paymentNo}/close`);
      setMessage("关单完成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "关单失败");
    }
  }

  async function handleRefund() {
    try {
      await post(`/api/admin/payments/wechat/${paymentNo}/refund`, {
        amountCents: Number(refundAmount),
        reason: refundReason,
        confirmText,
      });
      setMessage("退款已提交");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "退款失败");
    }
  }

  return (
    <div className="mt-3 grid gap-2 text-xs">
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary px-3 py-2" onClick={handleQuery} type="button">
          查询微信订单
        </button>
        {status === "pending" || status === "created" ? (
          <button className="btn-secondary px-3 py-2" onClick={handleClose} type="button">
            关闭未支付单
          </button>
        ) : null}
      </div>
      {refundable ? (
        <div className="grid gap-2 border-t border-ink/10 pt-3">
          <input
            className="field-input py-2"
            min="1"
            onChange={(event) => setRefundAmount(event.target.value)}
            placeholder="退款金额，单位分"
            type="number"
            value={refundAmount}
          />
          <input
            className="field-input py-2"
            onChange={(event) => setRefundReason(event.target.value)}
            placeholder="退款原因"
            value={refundReason}
          />
          <input
            className="field-input py-2"
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="输入 REFUND 二次确认"
            value={confirmText}
          />
          <button className="btn-secondary px-3 py-2" onClick={handleRefund} type="button">
            发起退款
          </button>
        </div>
      ) : null}
      {message ? <p className="font-semibold text-coral">{message}</p> : null}
    </div>
  );
}
