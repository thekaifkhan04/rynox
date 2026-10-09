import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { listPublicEvents } from "@/server/events";

const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** The home page, the events list and every public event page. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const events = await listPublicEvents();
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/events`, changeFrequency: "daily", priority: 0.9 },
    ...events.map((e) => ({
      url: `${base}/events/${e.slug}`,
      lastModified: e.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
