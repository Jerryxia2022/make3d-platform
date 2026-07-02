"use client";

import type { ReactNode } from "react";

export function ContactSupportButton({
  className = "",
  children = "联系客服",
}: {
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      className={className}
      onClick={() => window.dispatchEvent(new Event("make3d:open-consult"))}
      type="button"
    >
      {children}
    </button>
  );
}
