"use client";

import type { InputHTMLAttributes } from "react";
import { useMemo, useState } from "react";
import { mainlandPhoneErrorMessage, mainlandPhoneHtmlPattern } from "@/shared/phoneValidation";

export function RegisterForm() {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordMismatch = useMemo(
    () => Boolean(confirmPassword) && password !== confirmPassword,
    [confirmPassword, password],
  );

  return (
    <form action="/api/account/register" className="mt-6 space-y-4" method="post">
      <Field
        helpText="请输入 11 位中国大陆手机号。"
        inputMode="numeric"
        label="手机号"
        maxLength={11}
        name="phone"
        pattern={mainlandPhoneHtmlPattern}
        required
        title={mainlandPhoneErrorMessage}
        type="tel"
      />
      <PasswordField
        helpText="至少 8 位，允许粘贴。"
        label="密码"
        name="password"
        onChange={setPassword}
        visible={passwordVisible}
        onToggle={() => setPasswordVisible((value) => !value)}
        value={password}
      />
      <PasswordField
        error={passwordMismatch ? "两次输入的密码不一致" : ""}
        label="确认密码"
        name="confirmPassword"
        onChange={setConfirmPassword}
        visible={confirmVisible}
        onToggle={() => setConfirmVisible((value) => !value)}
        value={confirmPassword}
      />
      <Field label="姓名" name="name" required />
      <Field helpText="邮箱建议填写，用于找回密码。" label="邮箱" name="email" type="email" />
      <button className="btn-primary w-full px-5 py-3" disabled={passwordMismatch} type="submit">
        注册
      </button>
    </form>
  );
}

function PasswordField({
  error,
  helpText,
  label,
  name,
  onChange,
  onToggle,
  value,
  visible,
}: {
  error?: string;
  helpText?: string;
  label: string;
  name: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  value: string;
  visible: boolean;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <span className="mt-2 flex rounded-md border border-ink/10 bg-white focus-within:ring-2 focus-within:ring-coral/40">
        <input
          className="min-w-0 flex-1 bg-transparent px-3 py-3 outline-none"
          minLength={8}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={visible ? `隐藏${label}` : `显示${label}`}
          className="flex min-w-11 items-center justify-center px-3 text-graphite transition hover:text-coral"
          onClick={onToggle}
          type="button"
        >
          <EyeIcon hidden={visible} />
        </button>
      </span>
      {helpText ? <span className="mt-1 block text-xs text-graphite">{helpText}</span> : null}
      {error ? <span className="mt-1 block text-xs font-semibold text-coral">{error}</span> : null}
    </label>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      {hidden ? <path d="m4 4 16 16" /> : null}
    </svg>
  );
}

function Field({
  helpText,
  label,
  name,
  ...props
}: {
  helpText?: string;
  label: string;
  name: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input className="field-input mt-2 py-3" name={name} {...props} />
      {helpText ? <span className="mt-1 block text-xs text-graphite">{helpText}</span> : null}
    </label>
  );
}
