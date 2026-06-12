"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const SERVICE_REQUEST_STATUSES = ["待评估", "已联系", "已报价", "已接受", "已拒绝", "已完成"] as const;
type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export function AdminRequestStatusForm({
  adminNote,
  requestId,
  status,
}: {
  adminNote?: string | null;
  requestId: number;
  status: ServiceRequestStatus;
}) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [currentAdminNote, setCurrentAdminNote] = useState(adminNote || "");
  const [contactNote, setContactNote] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/requests/${requestId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: selectedStatus,
          adminNote: currentAdminNote,
          contactNote,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "需求状态更新失败");
      }

      setContactNote("");
      setMessage("状态已更新");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "需求状态更新失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="border border-ink/10 bg-white/90 p-4 shadow-sm" onSubmit={handleSubmit}>
      <label className="block text-sm font-semibold">
        修改状态
        <select
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setSelectedStatus(event.target.value as ServiceRequestStatus)}
          value={selectedStatus}
        >
          {SERVICE_REQUEST_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-sm font-semibold">
        管理员备注
        <textarea
          className="mt-2 min-h-24 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setCurrentAdminNote(event.target.value)}
          value={currentAdminNote}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        联系记录
        <textarea
          className="mt-2 min-h-20 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setContactNote(event.target.value)}
          placeholder="例如：已电话沟通，客户补充图纸后再报价"
          value={contactNote}
        />
      </label>
      <button
        className="mt-3 w-full bg-ink px-4 py-2 text-sm font-semibold text-white disabled:bg-graphite/60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "更新中..." : "保存需求状态"}
      </button>
      {message ? <p className="mt-3 text-sm font-semibold text-graphite">{message}</p> : null}
    </form>
  );
}
