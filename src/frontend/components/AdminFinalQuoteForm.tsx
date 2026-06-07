"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminFinalQuoteForm({
  orderId,
  finalPrice,
  finalLeadTimeHours,
  priceAdjustmentReason,
  productionNote,
}: {
  orderId: number;
  finalPrice?: number | null;
  finalLeadTimeHours?: number | null;
  priceAdjustmentReason?: string | null;
  productionNote?: string | null;
}) {
  const router = useRouter();
  const [currentFinalPrice, setCurrentFinalPrice] = useState(
    typeof finalPrice === "number" ? finalPrice.toFixed(2) : "",
  );
  const [currentLeadTime, setCurrentLeadTime] = useState(
    typeof finalLeadTimeHours === "number" ? String(finalLeadTimeHours) : "",
  );
  const [currentReason, setCurrentReason] = useState(priceAdjustmentReason || "");
  const [currentProductionNote, setCurrentProductionNote] = useState(productionNote || "");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/final-quote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          finalPrice: currentFinalPrice,
          finalLeadTimeHours: currentLeadTime,
          priceAdjustmentReason: currentReason,
          productionNote: currentProductionNote,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "最终报价保存失败");
      }

      setMessage("最终报价已确认，已通知客户付款");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "最终报价保存失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="border border-ink/10 bg-white/80 p-4 shadow-sm" onSubmit={handleSubmit}>
      <label className="block text-sm font-semibold">
        最终报价
        <input
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
          inputMode="decimal"
          min="0"
          onChange={(event) => setCurrentFinalPrice(event.target.value)}
          placeholder="人工确认后的最终金额"
          step="0.01"
          type="number"
          value={currentFinalPrice}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        最终交货期（小时）
        <input
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-2"
          inputMode="numeric"
          min="0"
          onChange={(event) => setCurrentLeadTime(event.target.value)}
          placeholder="例如 72"
          step="1"
          type="number"
          value={currentLeadTime}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        调价原因
        <textarea
          className="mt-2 min-h-20 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setCurrentReason(event.target.value)}
          placeholder="如支撑、拆件、后处理、加急、人工确认等"
          value={currentReason}
        />
      </label>
      <label className="mt-3 block text-sm font-semibold">
        生产备注
        <textarea
          className="mt-2 min-h-20 w-full border border-ink/20 bg-white px-3 py-2"
          onChange={(event) => setCurrentProductionNote(event.target.value)}
          placeholder="材料、工艺、后处理、排产注意事项"
          value={currentProductionNote}
        />
      </label>
      <button
        className="mt-3 w-full bg-coral px-4 py-2 text-sm font-semibold text-white disabled:bg-graphite/60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "确认中..." : "确认报价并通知客户"}
      </button>
      {message ? <p className="mt-3 text-sm font-semibold text-graphite">{message}</p> : null}
    </form>
  );
}
