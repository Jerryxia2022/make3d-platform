"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ORDER_STATUSES, type OrderStatus } from "@/backend/orderStatus";

const PRINTER_OPTIONS = ["", "P1S-01", "P1S-02", "P1S-03", "P1S-04", "P1S-05", "P1S-06"];
const SHIPPING_COMPANIES = ["", "顺丰", "圆通", "韵达", "中通", "京东", "其他"];
const PAYMENT_METHODS = ["", "微信转账", "支付宝转账", "闲鱼付款", "淘宝付款", "其他人工沟通"];

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
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
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
          paymentMethod,
          paymentNote,
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
    <form className="surface-card p-4" onSubmit={handleSubmit}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">生产履约</h2>
          <p className="mt-1 text-xs leading-5 text-graphite">更新排产、生产、后处理和物流信息。</p>
        </div>
        <span className="status-pill status-gray">{status}</span>
      </div>

      <label className="mt-4 block text-sm font-semibold">
        修改状态
        <select
          className="field-input mt-2 py-2"
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

      {selectedStatus === "已付款" ? (
        <div className="notice-warning mt-4 p-3">
          <p className="text-sm font-bold text-coral">付款同步</p>
          <p className="mt-1 text-xs leading-5 text-graphite">
            通过状态下拉确认已付款时，会同步付款状态、付款时间、状态日志和公众号通知。
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm font-semibold">
              到账方式
              <select
                className="field-input mt-2 py-2"
                onChange={(event) => setPaymentMethod(event.target.value)}
                value={paymentMethod}
              >
                {PAYMENT_METHODS.map((item) => (
                  <option key={item || "empty"} value={item}>
                    {item || "未填写"}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold">
              付款备注
              <input
                className="field-input mt-2 py-2"
                onChange={(event) => setPaymentNote(event.target.value)}
                placeholder="例如：微信到账 / 客户备注手机号"
                value={paymentNote}
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold">
          分配打印机
          <select
            className="field-input mt-2 py-2"
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
            className="field-input mt-2 py-2"
            onChange={(event) => setCurrentEstimatedStartAt(event.target.value)}
            type="datetime-local"
            value={currentEstimatedStartAt}
          />
        </label>
        <label className="text-sm font-semibold">
          预计完成时间
          <input
            className="field-input mt-2 py-2"
            onChange={(event) => setCurrentEstimatedFinishAt(event.target.value)}
            type="datetime-local"
            value={currentEstimatedFinishAt}
          />
        </label>
        <label className="text-sm font-semibold">
          实际开始时间
          <input
            className="field-input mt-2 py-2"
            onChange={(event) => setCurrentActualStartAt(event.target.value)}
            type="datetime-local"
            value={currentActualStartAt}
          />
        </label>
        <label className="text-sm font-semibold">
          实际完成时间
          <input
            className="field-input mt-2 py-2"
            onChange={(event) => setCurrentActualFinishAt(event.target.value)}
            type="datetime-local"
            value={currentActualFinishAt}
          />
        </label>
        <label className="text-sm font-semibold">
          快递公司
          <select
            className="field-input mt-2 py-2"
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
            className="field-input mt-2 py-2"
            onChange={(event) => setCurrentTrackingNumber(event.target.value)}
            value={currentTrackingNumber}
          />
        </label>
        <label className="text-sm font-semibold">
          发货时间
          <input
            className="field-input mt-2 py-2"
            onChange={(event) => setCurrentShippedAt(event.target.value)}
            type="datetime-local"
            value={currentShippedAt}
          />
        </label>
      </div>

      <label className="mt-3 block text-sm font-semibold">
        生产备注
        <textarea
          className="field-input mt-2 min-h-20"
          onChange={(event) => setCurrentProductionNote(event.target.value)}
          value={currentProductionNote}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        内部备注
        <textarea
          className="field-input mt-2 min-h-20"
          onChange={(event) => setCurrentInternalNote(event.target.value)}
          value={currentInternalNote}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        物流备注
        <textarea
          className="field-input mt-2 min-h-16"
          onChange={(event) => setCurrentShippingNote(event.target.value)}
          value={currentShippingNote}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        状态日志备注
        <input
          className="field-input mt-2 py-2"
          onChange={(event) => setNote(event.target.value)}
          placeholder="例如：已安排 P1S-03，预计今晚开始"
          value={note}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        管理员备注
        <textarea
          className="field-input mt-2 min-h-20"
          onChange={(event) => setCurrentAdminRemark(event.target.value)}
          value={currentAdminRemark}
        />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          className="btn-primary px-4 py-2"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "保存中..." : "保存状态"}
        </button>
        <button
          className="btn-danger px-4 py-2"
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
