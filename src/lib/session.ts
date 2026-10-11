import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { isAdminEmail } from "./env";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  isAdmin: boolean;
};

/** Current user, or null. Deduped per request. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: string };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    image: u.image ?? null,
    // The allowlist also applies to accounts created before it was edited.
    isAdmin: u.role === "ADMIN" || isAdminEmail(u.email),
  };
});

export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getUser();
  if (!user) {
    redirect(returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : "/sign-in");
  }
  return user;
}

export async function requireAdmin(returnTo = "/admin"): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!user.isAdmin) redirect("/no-access");
  return user;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function assertAdmin(): Promise<SessionUser> {
  const user = await getUser();
  if (!user?.isAdmin) throw new Error("Not authorised");
  return user;
}
