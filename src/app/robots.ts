import type { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/shared/siteConfig";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api"],
      },
    ],
    sitemap: `${SITE_CONFIG.appUrl}/sitemap.xml`,
  };
}
