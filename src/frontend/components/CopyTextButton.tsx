"use client";

import { useState } from "react";

export function CopyTextButton({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyText() {
    if (!text.trim()) {
      return;
    }

    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button className="btn-secondary px-3 py-2 text-xs" onClick={copyText} type="button">
      {copied ? "已复制" : label}
    </button>
  );
}
