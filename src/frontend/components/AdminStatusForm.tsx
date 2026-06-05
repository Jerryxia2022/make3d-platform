"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ORDER_STATUSES, type OrderStatus } from "@/backend/orderStatus";

export function AdminStatusForm({
  orderId,
  status,
  shippingCompany,
  trackingNumber,
  adminRemark,
}: {
  orderId: number;
  status: OrderStatus;
  shippingCompany?: string | null;
  trackingNumber?: string | null;
  adminRemark?: string | null;
}) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [currentShippingCompany, setCurrentShippingCompany] = useState(shippingCompany || "");
  const [currentTrackingNumber, setCurrentTrackingNumber] = useState(trackingNumber || "");
  const [currentAdminRemark, setCurrentAdminRemark] = useState(adminRemark || "");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: selectedStatus,
          shippingCompany: currentShippingCompany,
          trackingNumber: currentTrackingNumber,
          adminRemark: currentAdminRemark,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "状态更新失败");
      }

      setMessage("状态已更新");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "状态更新失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="border border-ink/10 bg-white/80 p-4 shadow-sm" onSubmit={handleSubmit}>
      <label className="block text-sm font-semibold">
        修改状态
        <select
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setSelectedStatus(event.target.value as OrderStatus)}
          value={selectedStatus}
        >
          {ORDER_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-sm font-semibold">
        快递公司
        <input
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setCurrentShippingCompany(event.target.value)}
          value={currentShippingCompany}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        快递单号
        <input
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setCurrentTrackingNumber(event.target.value)}
          value={currentTrackingNumber}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        管理员备注
        <textarea
          className="mt-2 min-h-24 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setCurrentAdminRemark(event.target.value)}
          value={currentAdminRemark}
        />
      </label>
      <button
        className="mt-3 w-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:bg-graphite/60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "更新中..." : "保存状态"}
      </button>
      {message ? <p className="mt-3 text-sm font-semibold text-graphite">{message}</p> : null}
    </form>
  );
}
