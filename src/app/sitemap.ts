import type { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/shared/siteConfig";

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
    url: `${SITE_CONFIG.appUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
