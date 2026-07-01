import type { Metadata } from "next";
import { OnlineConsultWidget } from "@/frontend/components/OnlineConsultWidget";
import { SiteFooter } from "@/frontend/components/SiteFooter";
import { SITE_CONFIG } from "@/shared/siteConfig";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.appUrl),
  title: {
    default: "Make3D 3D打印与小型研发制造服务",
    template: "%s | Make3D",
  },
  description:
    "西安瑞淞增材技术有限公司旗下瑞淞Make3D快速制造提供在线模型上传、STL 自动切片报价、模型修改、工装夹具和小型研发制造服务。",
  keywords: ["3D打印", "在线报价", "STL切片", "FDM打印", "模型修改", "工装夹具", "Make3D"],
  icons: {
    icon: [
      { url: "/brand/favicon.ico", sizes: "any" },
      { url: "/brand/make3d-icon-square-256.png", sizes: "256x256", type: "image/png" },
      { url: "/brand/make3d-icon-square-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/make3d-icon-square-256.png", sizes: "256x256", type: "image/png" }],
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Make3D 3D打印与小型研发制造服务",
    description: "上传模型获取自动报价，也可提交模型修改、工装夹具和研发咨询需求。",
    url: "/",
    siteName: SITE_CONFIG.filingSiteName,
    locale: "zh_CN",
    type: "website",
  },
  other: {
    company: SITE_CONFIG.legalEntityName,
    "icp-filing": SITE_CONFIG.icpFilingNumber,
    "filing-site-name": SITE_CONFIG.filingSiteName,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <OnlineConsultWidget />
        <SiteFooter />
      </body>
    </html>
  );
}
