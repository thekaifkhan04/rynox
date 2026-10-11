import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Event images come from arbitrary organiser-supplied hosts, so next/image is not used.
    rules: { "@next/next/no-img-element": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    ".next-load/**",
    // Vendored pdfcn components, kept as the registry ships them.
    "src/components/pdf/**",
    "src/lib/pdf-*.tsx",
    "src/lib/pdf-themes/**",
    "src/lib/resolve-color.ts",
    "src/types/pdf-*.ts",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
