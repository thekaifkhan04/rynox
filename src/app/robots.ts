import type { MetadataRoute } from "next";

const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Public pages may be indexed; private and machine pages may not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/orders", "/tickets", "/sign-in"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
