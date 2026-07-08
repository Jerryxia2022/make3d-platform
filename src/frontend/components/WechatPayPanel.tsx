"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

declare global {
  interface Window {
    WeixinJSBridge?: {
      invoke: (
        name: string,
        params: Record<string, string>,
        callback: (result: { err_msg?: string }) => void,
      ) => void;
    };
  }
}

type PaymentState = {
  paymentNo: string;
  scenario: "jsapi" | "native";
  amountCents: number;
  status: string;
  expiresAt: string;
  codeUrl?: string | null;
};

export function WechatPayPanel({
  amountCents,
  jsapiAvailable,
  merchantName,
  orderId,
  orderNo,
}: {
  amountCents: number;
  jsapiAvailable: boolean;
  merchantName: string;
  orderId: number;
  orderNo: string;
}) {
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const isWechatBrowser = useMemo(
    () => typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent),
    [],
  );
  const isMobile = useMemo(
    () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
    [],
  );

  useEffect(() => {
    if (!payment?.codeUrl) {
      setQrDataUrl("");
      return;
    }

    QRCode.toDataURL(payment.codeUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
    }).then(setQrDataUrl).catch(() => setMessage("二维码生成失败，请刷新后重试。"));
  }, [payment?.codeUrl]);

  const refreshStatus = useCallback(
    async (forceQuery: boolean) => {
      if (!payment?.paymentNo) {
        return;
      }

      const response = await fetch(
        `/api/payments/wechat/status?paymentNo=${encodeURIComponent(payment.paymentNo)}&query=${forceQuery ? "true" : "false"}`,
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "支付状态查询失败");
      }

      setPayment((current) =>
        current
          ? {
              ...current,
              ...result.payment,
              codeUrl: result.payment.codeUrl ?? current.codeUrl,
            }
          : result.payment,
      );
      if (result.payment.status === "paid") {
        setMessage("支付已确认，订单状态已更新。");
      }
      return result.payment as PaymentState;
    },
    [payment?.paymentNo],
  );

  useEffect(() => {
    if (!payment || payment.status === "paid" || payment.scenario !== "native") {
      return;
    }

    const expiresAt = new Date(payment.expiresAt).getTime();
    const delay = Math.max(0, expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      async function refreshExpiredPayment() {
        setMessage("二维码已超过30分钟，正在自动刷新。");
        setIsSubmitting(true);

        try {
          const response = await fetch("/api/payments/wechat/native", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId }),
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "微信支付创建失败");
          }
          setPayment(result.payment);
          setMessage("二维码已自动刷新，请使用新的二维码支付。");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "微信支付创建失败");
        } finally {
          setIsSubmitting(false);
        }
      }

      refreshExpiredPayment().catch(() => null);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [payment, orderId]);

  async function createPayment(scenario: "jsapi" | "native", automaticRefresh = false) {
    setMessage(automaticRefresh ? "二维码已超过30分钟，正在自动刷新。" : "");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/payments/wechat/${scenario}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "微信支付创建失败");
      }

      setPayment(result.payment);
      if (automaticRefresh) {
        setMessage("二维码已自动刷新，请使用新的二维码支付。");
      }
      if (scenario === "jsapi" && result.jsapiParams) {
        await invokeJsapiPay(result.jsapiParams);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "微信支付创建失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmPaid() {
    setIsChecking(true);
    setMessage("");

    try {
      const result = await refreshStatus(true);
      if (result?.status === "paid") {
        setMessage("支付已确认，订单状态已更新。");
      } else {
        setMessage("暂未查询到支付成功，请确认微信支付结果后再点击已付款。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "支付状态查询失败，请稍后再试。");
    } finally {
      setIsChecking(false);
    }
  }

  function confirmUnpaid() {
    setMessage("二维码将继续保留，可稍后继续扫码或点击已付款确认。");
  }

  async function invokeJsapiPay(params: Record<string, string>) {
    if (!window.WeixinJSBridge) {
      setMessage("请在微信内打开订单后再发起支付。");
      return;
    }

    window.WeixinJSBridge.invoke("getBrandWCPayRequest", params, () => {
      refreshStatus(true).catch(() => setMessage("支付状态查询失败，请稍后刷新。"));
    });
  }

  return (
    <section className="surface-card mt-5 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="eyebrow">WeChat Pay TEST</p>
          <h2 className="mt-2 text-2xl font-bold">微信支付测试</h2>
          <p className="mt-2 text-sm font-semibold text-coral">TEST环境，真实扣款</p>
        </div>
        <div className="text-sm font-semibold text-graphite">
          <p>{merchantName}</p>
          <p>{formatCents(amountCents)}</p>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <Detail label="订单编号" value={orderNo} />
        <Detail label="支付金额" value={formatCents(amountCents)} />
        <Detail label="支付状态" value={payment?.status || "未创建"} />
        <Detail label="有效期" value={payment?.expiresAt ? formatDate(payment.expiresAt) : "创建后30分钟"} />
      </dl>

      {isWechatBrowser ? (
        <button
          className="btn-primary mt-5 w-full px-5 py-3"
          disabled={isSubmitting || !jsapiAvailable}
          onClick={() => createPayment("jsapi")}
          type="button"
        >
          {isSubmitting ? "创建中..." : "微信支付"}
        </button>
      ) : isMobile ? (
        <p className="notice-warning mt-5 px-4 py-3 text-sm font-semibold">
          请在微信中打开订单，或使用电脑扫码支付。
        </p>
      ) : (
        <button
          className="btn-primary mt-5 w-full px-5 py-3"
          disabled={isSubmitting}
          onClick={() => createPayment("native")}
          type="button"
        >
          {isSubmitting ? "创建中..." : "生成动态扫码支付二维码"}
        </button>
      )}

      {qrDataUrl ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-[18rem_minmax(0,1fr)] sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR code is generated as a local data URL. */}
          <img alt="微信支付动态二维码" className="h-64 w-64 border border-ink/10 bg-white p-3" src={qrDataUrl} />
          <div className="text-sm leading-6 text-graphite">
            <p className="font-semibold text-ink">{merchantName}</p>
            <div className="my-4 flex flex-col gap-3 sm:flex-row">
              <button className="btn-primary px-4 py-2" disabled={isChecking} onClick={confirmPaid} type="button">
                {isChecking ? "确认中..." : "已付款"}
              </button>
              <button className="btn-secondary px-4 py-2" disabled={isChecking} onClick={confirmUnpaid} type="button">
                未付款
              </button>
            </div>
            <p>订单：{orderNo}</p>
            <p>金额：{formatCents(amountCents)}</p>
            <p>有效期：{payment?.expiresAt ? formatDate(payment.expiresAt) : "-"}</p>
          </div>
        </div>
      ) : null}

      {message ? <p className="mt-4 text-sm font-semibold text-coral">{message}</p> : null}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile p-4">
      <p className="text-xs font-semibold uppercase text-graphite">{label}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}

function formatCents(value: number) {
  return `${(value / 100).toFixed(2)} 元`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
