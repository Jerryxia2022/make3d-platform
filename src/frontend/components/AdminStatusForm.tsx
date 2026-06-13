"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ORDER_STATUSES, type OrderStatus } from "@/backend/orderStatus";

const PRINTER_OPTIONS = ["", "P1S-01", "P1S-02", "P1S-03", "P1S-04", "P1S-05", "P1S-06"];
const SHIPPING_COMPANIES = ["", "顺丰", "圆通", "韵达", "中通", "京东", "其他"];

export function AdminStatusForm({
  orderId,
  status,
  assignedPrinter,
  estimatedStartAt,
  estimatedFinishAt,
  actualStartAt,
  actualFinishAt,
  productionNote,
  internalNote,
  shippingCompany,
  trackingNumber,
  shippedAt,
  shippingNote,
  adminRemark,
}: {
  orderId: number;
  status: OrderStatus;
  assignedPrinter?: string | null;
  estimatedStartAt?: string | null;
  estimatedFinishAt?: string | null;
  actualStartAt?: string | null;
  actualFinishAt?: string | null;
  productionNote?: string | null;
  internalNote?: string | null;
  shippingCompany?: string | null;
  trackingNumber?: string | null;
  shippedAt?: string | null;
  shippingNote?: string | null;
  adminRemark?: string | null;
}) {
  const router = useRouter();
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [currentAssignedPrinter, setCurrentAssignedPrinter] = useState(assignedPrinter || "");
  const [currentEstimatedStartAt, setCurrentEstimatedStartAt] = useState(formatDateTimeInput(estimatedStartAt));
  const [currentEstimatedFinishAt, setCurrentEstimatedFinishAt] = useState(formatDateTimeInput(estimatedFinishAt));
  const [currentActualStartAt, setCurrentActualStartAt] = useState(formatDateTimeInput(actualStartAt));
  const [currentActualFinishAt, setCurrentActualFinishAt] = useState(formatDateTimeInput(actualFinishAt));
  const [currentProductionNote, setCurrentProductionNote] = useState(productionNote || "");
  const [currentInternalNote, setCurrentInternalNote] = useState(internalNote || "");
  const [currentShippingCompany, setCurrentShippingCompany] = useState(shippingCompany || "");
  const [currentTrackingNumber, setCurrentTrackingNumber] = useState(trackingNumber || "");
  const [currentShippedAt, setCurrentShippedAt] = useState(formatDateTimeInput(shippedAt));
  const [currentShippingNote, setCurrentShippingNote] = useState(shippingNote || "");
  const [currentAdminRemark, setCurrentAdminRemark] = useState(adminRemark || "");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitStatus(nextStatus: OrderStatus, successMessage: string) {
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: nextStatus,
          note,
          assignedPrinter: currentAssignedPrinter,
          estimatedStartAt: currentEstimatedStartAt,
          estimatedFinishAt: currentEstimatedFinishAt,
          actualStartAt: currentActualStartAt,
          actualFinishAt: currentActualFinishAt,
          productionNote: currentProductionNote,
          internalNote: currentInternalNote,
          shippingCompany: currentShippingCompany,
          trackingNumber: currentTrackingNumber,
          shippedAt: currentShippedAt,
          shippingNote: currentShippingNote,
          adminRemark: currentAdminRemark,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "状态更新失败");
      }

      setMessage(successMessage);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "状态更新失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitStatus(selectedStatus, "状态和生产信息已保存");
  }

  return (
    <form className="border border-ink/10 bg-white/90 p-4 shadow-sm" onSubmit={handleSubmit}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">生产履约</h2>
          <p className="mt-1 text-xs leading-5 text-graphite">更新排产、生产、后处理和物流信息。</p>
        </div>
        <span className="border border-ink/10 bg-paper px-2 py-1 text-xs font-bold">{status}</span>
      </div>

      <label className="mt-4 block text-sm font-semibold">
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

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold">
          分配打印机
          <select
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
            onChange={(event) => setCurrentAssignedPrinter(event.target.value)}
            value={currentAssignedPrinter}
          >
            {PRINTER_OPTIONS.map((item) => (
              <option key={item || "empty"} value={item}>
                {item || "未分配"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          预计开始时间
          <input
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
            onChange={(event) => setCurrentEstimatedStartAt(event.target.value)}
            type="datetime-local"
            value={currentEstimatedStartAt}
          />
        </label>
        <label className="text-sm font-semibold">
          预计完成时间
          <input
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
            onChange={(event) => setCurrentEstimatedFinishAt(event.target.value)}
            type="datetime-local"
            value={currentEstimatedFinishAt}
          />
        </label>
        <label className="text-sm font-semibold">
          实际开始时间
          <input
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
            onChange={(event) => setCurrentActualStartAt(event.target.value)}
            type="datetime-local"
            value={currentActualStartAt}
          />
        </label>
        <label className="text-sm font-semibold">
          实际完成时间
          <input
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
            onChange={(event) => setCurrentActualFinishAt(event.target.value)}
            type="datetime-local"
            value={currentActualFinishAt}
          />
        </label>
        <label className="text-sm font-semibold">
          快递公司
          <select
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
            onChange={(event) => setCurrentShippingCompany(event.target.value)}
            value={currentShippingCompany}
          >
            {SHIPPING_COMPANIES.map((item) => (
              <option key={item || "empty"} value={item}>
                {item || "未填写"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          运单号
          <input
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
            onChange={(event) => setCurrentTrackingNumber(event.target.value)}
            value={currentTrackingNumber}
          />
        </label>
        <label className="text-sm font-semibold">
          发货时间
          <input
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
            onChange={(event) => setCurrentShippedAt(event.target.value)}
            type="datetime-local"
            value={currentShippedAt}
          />
        </label>
      </div>

      <label className="mt-3 block text-sm font-semibold">
        生产备注
        <textarea
          className="mt-2 min-h-20 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setCurrentProductionNote(event.target.value)}
          value={currentProductionNote}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        内部备注
        <textarea
          className="mt-2 min-h-20 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setCurrentInternalNote(event.target.value)}
          value={currentInternalNote}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        物流备注
        <textarea
          className="mt-2 min-h-16 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setCurrentShippingNote(event.target.value)}
          value={currentShippingNote}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        状态日志备注
        <input
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setNote(event.target.value)}
          placeholder="例如：已安排 P1S-03，预计今晚开始"
          value={note}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        管理员备注
        <textarea
          className="mt-2 min-h-20 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setCurrentAdminRemark(event.target.value)}
          value={currentAdminRemark}
        />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          className="bg-ink px-4 py-2 text-sm font-semibold text-white disabled:bg-graphite/60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "保存中..." : "保存状态"}
        </button>
        <button
          className="border border-coral bg-coral/10 px-4 py-2 text-sm font-semibold text-coral disabled:border-graphite/30 disabled:text-graphite"
          disabled={isSubmitting}
          onClick={() => submitStatus("已发货", "发货信息已确认")}
          type="button"
        >
          确认发货
        </button>
      </div>
      {message ? <p className="mt-3 text-sm font-semibold text-graphite">{message}</p> : null}
    </form>
  );
}

function formatDateTimeInput(value?: string | null) {
  if (!value) {
    return "";
  }

  return value.replace(" ", "T").slice(0, 16);
}
