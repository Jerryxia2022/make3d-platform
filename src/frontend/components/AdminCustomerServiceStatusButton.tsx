"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CustomerServiceRequestStatus } from "@/backend/database";

const STATUS_OPTIONS: Array<{ value: CustomerServiceRequestStatus; label: string }> = [
  { value: "pending", label: "待处理" },
  { value: "processing", label: "处理中" },
  { value: "waiting_customer", label: "待客户补充" },
  { value: "resolved", label: "已处理" },
  { value: "closed", label: "已关闭" },
];

export function AdminCustomerServiceStatusButton({
  adminNote,
  customerVisibleReply,
  requestId,
  status,
}: {
  adminNote?: string | null;
  customerVisibleReply?: string | null;
  requestId: number;
  status: CustomerServiceRequestStatus;
}) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState<CustomerServiceRequestStatus>(status);
  const [currentAdminNote, setCurrentAdminNote] = useState(adminNote || "");
  const [currentCustomerReply, setCurrentCustomerReply] = useState(customerVisibleReply || "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/customer-service/${requestId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: selectedStatus,
          adminNote: currentAdminNote,
          customerVisibleReply: currentCustomerReply,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "状态更新失败");
      }

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "状态更新失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-2" onSubmit={submit}>
      <select
        className="field-input py-1 text-xs"
        onChange={(event) => setSelectedStatus(event.target.value as CustomerServiceRequestStatus)}
        value={selectedStatus}
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        className="field-input py-1 text-xs"
        onChange={(event) => setCurrentAdminNote(event.target.value)}
        placeholder="内部备注"
        value={currentAdminNote}
      />
      <input
        className="field-input py-1 text-xs"
        onChange={(event) => setCurrentCustomerReply(event.target.value)}
        placeholder="客户可见回复"
        value={currentCustomerReply}
      />
      <button className="btn-primary px-3 py-2 text-xs" disabled={isSubmitting} type="submit">
        {isSubmitting ? "保存中..." : "保存"}
      </button>
      {message ? <p className="text-xs font-semibold text-coral">{message}</p> : null}
    </form>
  );
}
