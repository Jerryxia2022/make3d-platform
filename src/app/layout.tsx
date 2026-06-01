import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Make3D V1.0",
  description: "在线3D打印报价与接单系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
