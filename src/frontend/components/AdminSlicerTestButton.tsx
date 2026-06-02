"use client";

import { useState } from "react";

type SlicerApiResponse = {
  success: boolean;
  message: string;
  job?: Record<string, unknown>;
  error?: string;
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

  async function handleClick() {
    if (!enabled || isRunning) {
      return;
    }

    setIsRunning(true);
    setStatus("running");
    setMessage("正在切片...");

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
    </div>
  );
}
