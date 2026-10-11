/** Only allow same-site relative paths as post-login destinations. */
export function safeNext(next: string | string[] | undefined, fallback = "/tickets") {
  const v = Array.isArray(next) ? next[0] : next;
  return v && v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : fallback;
}
