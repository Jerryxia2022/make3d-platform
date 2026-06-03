"use client";

import { useState } from "react";

type SlicerApiResponse = {
  success: boolean;
  message: string;
  job?: Record<string, unknown>;
  result?: SlicerQuoteResult;
  error?: string;
};

type SlicerQuoteResult = {
  filament_weight_g: number;
  print_time_seconds: number;
  material_fee: number;
  time_fee: number;
  estimated_price: number;
};

export function AdminSlicerTestButton({
  enabled,
  orderId,
  profilePath,
}: {
  enabled: boolean;
  orderId: number;
  profilePath: string;
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState(
    enabled ? "" : "自动切片报价尚未启用",
  );
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [quoteResult, setQuoteResult] = useState<SlicerQuoteResult | null>(null);
  const [quoteMaterial, setQuoteMaterial] = useState("-");

  async function handleClick() {
    if (!enabled || isRunning) {
      return;
    }

    setIsRunning(true);
    setStatus("running");
    setMessage("正在切片...");
    setQuoteResult(null);

    try {
      const response = await fetch(`/api/admin/orders/${orderId}/slice-test`, {
        method: "POST",
      });
      const result = (await response.json()) as SlicerApiResponse;
      const nextMessage = result.message || result.error || "切片失败";

      if (!response.ok || !result.success) {
        setStatus("error");
        setMessage(nextMessage);
        return;
      }

      setStatus("success");
      setMessage(nextMessage || "切片成功");
      setQuoteResult(result.result || null);
      setQuoteMaterial(String(result.job?.material || "-"));
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? `切片失败：${error.message}` : "切片失败");
    } finally {
      setIsRunning(false);
    }
  }

  const statusClass =
    status === "success"
      ? "text-green-700"
      : status === "error"
        ? "text-coral"
        : "text-graphite";

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        className="bg-ink px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-graphite/40"
        disabled={!enabled || isRunning}
        onClick={handleClick}
        type="button"
      >
        {isRunning ? "正在切片..." : "后台测试切片报价"}
      </button>
      <p className={`max-w-sm text-sm ${statusClass}`}>
        {message ||
          (profilePath
            ? `使用配置：${profilePath}`
            : "切片配置缺失，请先配置 profiles/bambu-p1s.ini")}
      </p>
      {quoteResult ? <SlicerQuoteResultView material={quoteMaterial} result={quoteResult} /> : null}
    </div>
  );
}

function SlicerQuoteResultView({
  material,
  result,
}: {
  material: string;
  result: SlicerQuoteResult;
}) {
  return (
    <dl className="grid w-full max-w-sm gap-2 text-left text-sm sm:text-right">
      <ResultLine label="耗材重量" value={`${result.filament_weight_g.toFixed(2)} g`} />
      <ResultLine label="打印时间" value={formatPrintTime(result.print_time_seconds)} />
      <ResultLine label="自动计算价格" value={formatMoney(result.estimated_price)} />
      <ResultLine label="材料费" value={formatMoney(result.material_fee)} />
      <ResultLine label="工时费" value={formatMoney(result.time_fee)} />
      <ResultLine label="使用材料" value={material} />
      <ResultLine label="使用配置" value="0.4喷嘴 / 0.2层高 / 50%填充" />
    </dl>
  );
}

function ResultLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-graphite">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatPrintTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.round((safeSeconds % 3600) / 60);

  return `${hours} 小时 ${minutes} 分钟`;
}

function formatMoney(value: number) {
  return `${value.toFixed(2)} 元`;
}
