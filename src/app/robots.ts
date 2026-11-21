import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

/** Only the production deployment is indexable; previews and local builds are not. */
export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : process.env.ALLOW_INDEXING === "true";
  if (!isProduction) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }, sitemap: `${siteUrl}/sitemap.xml`, host: siteUrl };
}
