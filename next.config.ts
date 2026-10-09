import type { NextConfig } from "next";
import { lanAddresses } from "./src/lib/lan";

const dev = process.env.NODE_ENV !== "production";

/**
 * What the pages may load. It names the outside services the site uses:
 * Razorpay's checkout, and YouTube / Google Maps for landing-page embeds.
 * Images may come from any https address, because organisers paste links.
 *
 * It is sent in report-only mode: the browser logs anything that would be
 * blocked (in the console, prefixed "[Report Only]") without blocking it. Once
 * a real payment and a full click-through show no such messages, change the
 * header name below to "Content-Security-Policy" to enforce it.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js needs inline scripts, and its dev tools also need eval.
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.razorpay.com${dev ? " ws: wss:" : ""}`,
  "frame-src 'self' https://*.razorpay.com https://www.youtube-nocookie.com https://www.google.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Lets a second, isolated dev server run beside the main one (see tests/e2e/run.sh).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The PDF engine loads a WebAssembly module from its own package folder, so it
  // is left unbundled, and the ticket fonts are shipped with every server function.
  serverExternalPackages: ["takumi-pdf", "@takumi-rs/helpers"],
  outputFileTracingIncludes: { "/**": ["./assets/fonts/*.ttf"] },
  // Development only: lets a phone on the same Wi-Fi load the site by this machine's IP address.
  allowedDevOrigins: lanAddresses(),
  // Baseline security headers for every response.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The admin landing-page preview frames the site itself, so same-origin framing stays allowed.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // The camera is needed for QR check-in; nothing else is.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
        ],
      },
    ];
  },
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
};

export default nextConfig;
