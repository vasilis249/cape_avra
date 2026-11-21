import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { privateHeaders, securityHeaders } from "./security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [70, 80],
    deviceSizes: [480, 640, 828, 1080, 1280, 1600, 1920, 2400],
    imageSizes: [96, 160, 256, 384],
    localPatterns: [{ pathname: "/photos/**" }, { pathname: "/brand/**" }, { pathname: "/video/**" }, { pathname: "/media/**" }],
    // generated masters are content-hashed, so they can be cached for a year
    minimumCacheTTL: 31536000,
  },
  poweredByHeader: false,
  async headers() {
    const privatePaths = ["/admin/:path*", "/:locale/book/:step(checkout|confirmation|manage)", "/:locale/kratisi/:step(oloklirosi|epivevaiosi|diacheirisi)", "/api/:path*"];
    return [{ source: "/:path*", headers: securityHeaders }, ...privatePaths.map((source) => ({ source, headers: privateHeaders }))];
  },
  experimental: {
    // admin photo uploads are resized in the browser first (≤ 2400 px JPEG); Vercel caps bodies at 4.5 MB
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default withNextIntl(nextConfig);
