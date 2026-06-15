"use client";

import { useEffect, useMemo, useState } from "react";

import {
  isValidMainlandPhone,
  mainlandPhoneErrorMessage,
  mainlandPhoneHtmlPattern,
} from "@/shared/phoneValidation";

type LoginResponse = {
  success?: boolean;
  redirect?: string;
  message?: string;
  error?: string;
  blockedUntil?: number | null;
  permanentlyBlocked?: boolean;
};

const wrongCredentialsMessage = "手机号或密码错误，请重新输入";
const tenMinuteBlockMessage = "密码错误次数过多，请10分钟后再试";
const dayBlockMessage = "安全系统检测到异常，请24小时后再试";
const permanentBlockMessage = "当前请求暂不可用";

export function CustomerLoginForm() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [blockedUntil, setBlockedUntil] = useState<number | null>(null);
  const [permanentlyBlocked, setPermanentlyBlocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!blockedUntil) {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [blockedUntil]);

  const remainingSeconds = useMemo(() => {
    if (!blockedUntil) {
      return 0;
    }

    return Math.max(0, Math.ceil((blockedUntil - now) / 1000));
  }, [blockedUntil, now]);
  const isTenMinuteBlocked = blockedUntil != null && remainingSeconds > 0 && message === tenMinuteBlockMessage;
  const isButtonDisabled = isSubmitting || isTenMinuteBlocked || permanentlyBlocked;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedPhone = phone.trim();

    if (!isValidMainlandPhone(trimmedPhone)) {
      setMessage(mainlandPhoneErrorMessage);
      setPassword("");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    setPermanentlyBlocked(false);

    try {
      const formData = new FormData();
      formData.set("phone", trimmedPhone);
      formData.set("password", password);

      const response = await fetch("/api/account/login", {
        body: formData,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as LoginResponse;

      if (response.ok && result.redirect) {
        window.location.href = result.redirect;
        return;
      }

      const nextMessage = result.message || result.error || wrongCredentialsMessage;
      setMessage(nextMessage);
      setPassword("");
      setBlockedUntil(result.blockedUntil || null);
      setPermanentlyBlocked(Boolean(result.permanentlyBlocked || response.status === 403));
    } catch {
      setMessage(wrongCredentialsMessage);
      setPassword("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
      {message ? (
        <p className="notice-warning px-4 py-3 text-sm font-semibold">
          {formatMessage(message, remainingSeconds)}
        </p>
      ) : null}
      <label className="block text-sm font-semibold">
        手机号
        <input
          className="field-input mt-2 py-3"
          name="phone"
          onChange={(event) => setPhone(event.target.value)}
          inputMode="numeric"
          maxLength={11}
          pattern={mainlandPhoneHtmlPattern}
          required
          title={mainlandPhoneErrorMessage}
          type="tel"
          value={phone}
        />
      </label>
      <label className="block text-sm font-semibold">
        密码
        <input
          className="field-input mt-2 py-3"
          minLength={8}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      <button
        className="btn-primary w-full px-5 py-3"
        disabled={isButtonDisabled}
        type="submit"
      >
        {isSubmitting ? "登录中..." : isTenMinuteBlocked ? formatCountdown(remainingSeconds) : "登录"}
      </button>
    </form>
  );
}

function formatMessage(message: string, remainingSeconds: number) {
  if (message === tenMinuteBlockMessage && remainingSeconds > 0) {
    return `${tenMinuteBlockMessage}（${formatCountdown(remainingSeconds)}）`;
  }

  if (message === dayBlockMessage) {
    return dayBlockMessage;
  }

  if (message === permanentBlockMessage) {
    return permanentBlockMessage;
  }

  return message;
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}
