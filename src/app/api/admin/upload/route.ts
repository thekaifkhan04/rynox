import { put } from "@vercel/blob";
import { env } from "@/lib/env";
import { getUser } from "@/lib/session";

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
// Vercel functions accept request bodies up to 4.5 MB.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await getUser();
  if (!user?.isAdmin) return Response.json({ error: "Not authorised" }, { status: 403 });
  if (!env.blobToken) {
    return Response.json({ error: "Image uploads are not configured. Paste an image URL instead." }, { status: 503 });
  }
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file received" }, { status: 400 });
  if (!TYPES.includes(file.type)) {
    return Response.json({ error: "Use a JPG, PNG, WebP, AVIF or GIF image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Image must be smaller than 4 MB" }, { status: 400 });
  }
  const ext = file.type.split("/")[1].replace("jpeg", "jpg");
  const blob = await put(`events/${crypto.randomUUID()}.${ext}`, file, {
    access: "public",
    contentType: file.type,
    token: env.blobToken,
  });
  return Response.json({ url: blob.url });
}
