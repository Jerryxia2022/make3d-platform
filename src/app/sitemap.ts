import type { MetadataRoute } from "next";

const appUrl = process.env.APP_URL || "https://make3d.com.cn";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "",
    "/quote",
    "/request/design",
    "/request/development",
    "/account/login",
    "/account/register",
    "/account/forgot-password",
  ].map((path) => ({
    url: `${appUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
