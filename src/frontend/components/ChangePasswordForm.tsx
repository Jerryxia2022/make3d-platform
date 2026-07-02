"use client";

import { useState } from "react";

export function ChangePasswordForm() {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentVisible, setCurrentVisible] = useState(false);
  const [newVisible, setNewVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const passwordMismatch = Boolean(confirmNewPassword) && newPassword !== confirmNewPassword;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (passwordMismatch) {
      setMessage("两次输入的新密码不一致");
      return;
    }

    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "密码修改失败");
      }

      form.reset();
      setNewPassword("");
      setConfirmNewPassword("");
      setMessage("密码已修改");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "密码修改失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-5 grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
      <PasswordInput
        label="当前密码"
        name="currentPassword"
        visible={currentVisible}
        onToggle={() => setCurrentVisible((value) => !value)}
      />
      <PasswordInput
        label="新密码"
        minLength={8}
        name="newPassword"
        onChange={setNewPassword}
        value={newPassword}
        visible={newVisible}
        onToggle={() => setNewVisible((value) => !value)}
      />
      <PasswordInput
        error={passwordMismatch ? "两次输入的新密码不一致" : ""}
        label="确认新密码"
        minLength={8}
        name="confirmNewPassword"
        onChange={setConfirmNewPassword}
        value={confirmNewPassword}
        visible={confirmVisible}
        onToggle={() => setConfirmVisible((value) => !value)}
      />
      <div className="flex items-end">
        <button
          className="btn-primary w-full px-5 py-3"
          disabled={isSubmitting || passwordMismatch}
          type="submit"
        >
          {isSubmitting ? "修改中..." : "修改密码"}
        </button>
      </div>
      {message ? (
        <p className="text-sm font-semibold text-coral md:col-span-3">{message}</p>
      ) : null}
    </form>
  );
}

function PasswordInput({
  error,
  label,
  minLength,
  name,
  onChange,
  onToggle,
  value,
  visible,
}: {
  error?: string;
  label: string;
  minLength?: number;
  name: string;
  onChange?: (value: string) => void;
  onToggle: () => void;
  value?: string;
  visible: boolean;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <span className="mt-2 flex rounded-md border border-ink/10 bg-white focus-within:ring-2 focus-within:ring-coral/40">
        <input
          className="min-w-0 flex-1 bg-transparent px-3 py-3 outline-none"
          minLength={minLength}
          name={name}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
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
