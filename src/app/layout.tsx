import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://make3d.com.cn"),
  title: {
    default: "Make3D 在线3D打印接单系统",
    template: "%s | Make3D",
  },
  description: "Make3D 提供在线模型上传、STL 自动切片报价、人工确认和3D打印订单管理。",
  keywords: ["3D打印", "在线报价", "STL切片", "FDM打印", "Make3D"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Make3D 在线3D打印接单系统",
    description: "上传模型，获取自动报价和预计交货期，由人工确认最终报价与生产安排。",
    url: "/",
    siteName: "Make3D",
    locale: "zh_CN",
    type: "website",
  },
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
