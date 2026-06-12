import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://make3d.com.cn"),
  title: {
    default: "Make3D 3D打印与小型研发制造服务",
    template: "%s | Make3D",
  },
  description: "Make3D 提供在线模型上传、STL 自动切片报价、模型修改、工装夹具和小型研发制造服务。",
  keywords: ["3D打印", "在线报价", "STL切片", "FDM打印", "模型修改", "工装夹具", "Make3D"],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Make3D 3D打印与小型研发制造服务",
    description: "上传模型获取自动报价，也可提交模型修改、工装夹具和研发咨询需求。",
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
