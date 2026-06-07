import type { MetadataRoute } from "next";

const appUrl = process.env.APP_URL || "https://make3d.com.cn";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
