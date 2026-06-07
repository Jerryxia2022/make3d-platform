"use client";

import { useState } from "react";

export function ChangePasswordForm() {
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
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
      setMessage("密码已修改");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "密码修改失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-5 grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
      <label className="block text-sm font-semibold">
        当前密码
        <input
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
          name="currentPassword"
          required
          type="password"
        />
      </label>
      <label className="block text-sm font-semibold">
        新密码
        <input
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
          minLength={8}
          name="newPassword"
          required
          type="password"
        />
      </label>
      <div className="flex items-end">
        <button
          className="w-full bg-ink px-5 py-3 font-semibold text-white disabled:bg-graphite/60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "修改中..." : "修改密码"}
        </button>
      </div>
      {message ? (
        <p className="md:col-span-3 text-sm font-semibold text-coral">{message}</p>
      ) : null}
    </form>
  );
}
