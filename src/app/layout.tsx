import type { Metadata } from "next";
import { Anton, Geist_Mono, Manrope } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const display = Anton({ variable: "--font-display", weight: "400", subsets: ["latin"] });
const body = Manrope({ variable: "--font-body", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "RYNOX";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: { default: siteName, template: `%s · ${siteName}` },
  description: "Running, lifting and endurance competitions. Register, pay and get your ticket.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        {children}
        <Toaster theme="dark" position="top-center" richColors />
      </body>
    </html>
  );
}
