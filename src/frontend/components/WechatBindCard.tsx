"use client";

import { useState } from "react";

export function WechatBindCard({
  bound,
  maskedOpenid,
  subscribed,
  initialBindCode,
  initialExpiresAt,
}: {
  bound: boolean;
  maskedOpenid: string;
  subscribed: boolean;
  initialBindCode?: string | null;
  initialExpiresAt?: number | null;
}) {
  const [bindCode, setBindCode] = useState(initialBindCode || "");
  const [expiresAt, setExpiresAt] = useState(initialExpiresAt || null);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function generateBindCode() {
    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/account/wechat/bind-code", {
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "绑定码生成失败");
      }

      setBindCode(result.bindCode);
      setExpiresAt(result.expiresAt);
      setMessage("绑定码已生成，请在 30 分钟内发送给公众号。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "绑定码生成失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="surface-card mt-5 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- Public brand icon is a fixed SVG used as a compact account badge. */}
          <img alt="" className="h-12 w-12 shrink-0 object-contain" src="/brand/make3d-icon-square.svg" />
          <div>
            <h2 className="text-xl font-bold">微信公众号绑定</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-graphite">
              当前公众号采用关键词服务模式。关注 Make3D 公众号后，发送绑定码即可绑定账号，绑定后可接收订单状态通知。
            </p>
          </div>
        </div>
        <span
          className={
            bound
              ? "status-pill status-mint"
              : "status-pill status-orange"
          }
        >
          {bound ? "已绑定" : "未绑定"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <WechatMetric label="绑定 openid" value={bound ? maskedOpenid : "-"} />
            <WechatMetric label="订阅状态" value={bound ? (subscribed ? "已关注" : "已取消关注") : "-"} />
            <WechatMetric label="绑定码有效期" value={expiresAt ? formatExpiresAt(expiresAt) : "-"} />
          </div>
          <div className="surface-soft mt-4 px-4 py-3 text-sm">
            <p className="font-semibold text-ink">公众号关键词</p>
            <ul className="mt-2 grid gap-2 leading-6 text-graphite md:grid-cols-2">
              <li>发送【报价】获取在线报价入口</li>
              <li>发送【订单】查看订单入口</li>
              <li>发送【付款】查看付款说明</li>
              <li>发送【人工】联系人工客服</li>
              <li>发送绑定码完成账号绑定</li>
            </ul>
          </div>
        </div>
        <div className="metric-tile p-4">
          <p className="text-xs font-semibold text-graphite">当前绑定码</p>
          <p className="mt-2 text-2xl font-black tracking-[0.12em] text-ink">{bindCode || "未生成"}</p>
          <button
            className="btn-primary mt-4 w-full px-4 py-2"
            disabled={isSubmitting}
            onClick={generateBindCode}
            type="button"
          >
            {isSubmitting ? "生成中..." : "生成绑定码"}
          </button>
          {message ? <p className="mt-3 text-sm font-semibold text-graphite">{message}</p> : null}
        </div>
      </div>
    </section>
  );
}

function WechatMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile px-3 py-3">
      <p className="text-xs font-semibold text-graphite">{label}</p>
      <p className="mt-1 break-all font-bold">{value}</p>
    </div>
  );
}

function formatExpiresAt(value: number) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
