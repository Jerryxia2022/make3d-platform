"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminCustomerServiceStatusButton({
  requestId,
  disabled,
}: {
  requestId: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function markHandled() {
    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/customer-service/${requestId}/status`, {
        method: "POST",
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
    <div className="space-y-2">
      <button
        className="btn-primary px-3 py-2 text-xs"
        disabled={disabled || isSubmitting}
        onClick={markHandled}
        type="button"
      >
        {disabled ? "已处理" : isSubmitting ? "处理中..." : "标记已处理"}
      </button>
      {message ? <p className="text-xs font-semibold text-coral">{message}</p> : null}
    </div>
  );
}
