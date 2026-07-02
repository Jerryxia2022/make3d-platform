"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const CATEGORY_OPTIONS = [
  { value: "quote", label: "报价问题" },
  { value: "file", label: "文件问题" },
  { value: "payment", label: "付款问题" },
  { value: "production", label: "生产进度" },
  { value: "logistics", label: "物流发货" },
  { value: "after_sales", label: "售后问题" },
  { value: "invoice", label: "发票问题" },
  { value: "other", label: "其他" },
];

export function OnlineConsultWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("quote");
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const orderId = useMemo(() => {
    const match = pathname.match(/^\/account\/orders\/(\d+)/);
    return match ? Number(match[1]) : null;
  }, [pathname]);

  useEffect(() => {
    const openConsult = () => setOpen(true);

    window.addEventListener("make3d:open-consult", openConsult);
    return () => window.removeEventListener("make3d:open-consult", openConsult);
  }, []);

  if (pathname.startsWith("/admin")) {
    return null;
  }

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");

    if (!message.trim()) {
      setFeedback("请简单描述需要协助的问题");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/account/customer-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          category,
          message,
          orderId,
          source: orderId ? "order_page" : pathname === "/quote" ? "quote_page" : "website_floating",
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error || "提交失败");
      }

      setFeedback("已收到，我们会尽快回复。");
      setMessage("");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "提交失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <section className="w-[min(22rem,calc(100vw-2.5rem))] surface-card p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">在线咨询</p>
              <p className="mt-1 text-xs leading-5 text-graphite">工作日晚上和周末优先处理复杂沟通。</p>
            </div>
            <button className="text-sm font-semibold text-graphite" onClick={() => setOpen(false)} type="button">
              关闭
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)]">
            <div className="surface-soft p-2 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- Local service QR is maintained as a public brand asset. */}
              <img
                alt="Make3D 客服二维码"
                className="mx-auto h-24 w-24 object-contain"
                src="/brand/make3d-service-qrcode.png"
              />
              <p className="mt-2 text-xs text-graphite">扫码关注公众号</p>
            </div>
            <div className="text-xs leading-5 text-graphite">
              <p>公众号可发送：</p>
              <p>【报价】获取在线报价入口</p>
              <p>【订单】查看订单入口</p>
              <p>【付款】查看付款说明</p>
              <p>【人工】联系人工客服</p>
            </div>
          </div>
          <form className="mt-4 grid gap-3" onSubmit={submitRequest}>
            <label className="text-sm font-semibold">
              问题类型
              <select className="field-input mt-2 py-2" onChange={(event) => setCategory(event.target.value)} value={category}>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {orderId ? <p className="text-xs font-semibold text-coral">已关联订单 #{orderId}</p> : null}
            <label className="text-sm font-semibold">
              问题说明
              <textarea
                className="field-input mt-2 min-h-24"
                maxLength={1000}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="请留下订单号、手机号或问题描述，方便我们尽快核对。"
                value={message}
              />
            </label>
            <button className="btn-primary px-4 py-2" disabled={isSubmitting} type="submit">
              {isSubmitting ? "提交中..." : "提交咨询"}
            </button>
            {feedback ? <p className="text-sm font-semibold text-coral">{feedback}</p> : null}
            <p className="text-xs leading-5 text-graphite">
              未登录时请先<Link className="font-semibold text-coral" href="/account/login">登录账号</Link>，或直接通过公众号发送【人工】。
            </p>
          </form>
        </section>
      ) : null}
      <button className="btn-primary mt-3 px-4 py-3 shadow-lg" onClick={() => setOpen((value) => !value)} type="button">
        在线咨询
      </button>
    </div>
  );
}
