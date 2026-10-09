import type { NextConfig } from "next";
import { lanAddresses } from "./src/lib/lan";

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
