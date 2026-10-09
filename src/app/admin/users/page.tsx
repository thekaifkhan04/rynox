import { count, desc, eq, ilike, or } from "drizzle-orm";
import { RoleToggle } from "@/components/admin/role-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/db";
import { orders, user as userTable } from "@/db/schema";
import { formatDate } from "@/lib/dates";
import { isAdminEmail } from "@/lib/env";
import { requireAdmin } from "@/lib/session";

// Admin pages are per-user and always fresh; let navigation wait for the server.
export const instant = false;

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireAdmin();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const like = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const users = await db
    .select({
      user: userTable,
      // Every order this account has started, paid or not.
      registrations: count(orders.id),
    })
    .from(userTable)
    .leftJoin(orders, eq(orders.userId, userTable.id))
    .where(q ? or(ilike(userTable.email, like), ilike(userTable.name, like)) : undefined)
    .groupBy(userTable.id)
    .orderBy(desc(userTable.role), desc(userTable.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Admins can manage events, registrations, refunds and check-in. The first account to sign
          in is an admin, and emails listed in <code>ADMIN_EMAILS</code> are always admins.
        </p>
      </div>
      <form method="get" className="flex gap-2">
        <Label htmlFor="q" className="sr-only">
          Search users
        </Label>
        <Input id="q" name="q" type="search" defaultValue={q} placeholder="Search by name or email" className="max-w-xs" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Orders</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="pr-4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(({ user: u, registrations }) => {
              const fromEnv = isAdminEmail(u.email);
              const isAdmin = u.role === "ADMIN" || fromEnv;
              return (
                <TableRow key={u.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        {u.image && <AvatarImage src={u.image} alt="" />}
                        <AvatarFallback>{u.name.slice(0, 1).toUpperCase() || "?"}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">
                        {u.name}
                        {u.id === me.id && <span className="ml-2 text-xs text-muted-foreground">You</span>}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-white/75">{u.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={isAdmin ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "text-white/65"}
                    >
                      {isAdmin ? "Admin" : "Attendee"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{registrations}</TableCell>
                  <TableCell className="text-white/75">{formatDate(u.createdAt, "Asia/Kolkata")}</TableCell>
                  <TableCell className="pr-4 text-right">
                    {fromEnv ? (
                      <span className="text-xs text-muted-foreground">Set in ADMIN_EMAILS</span>
                    ) : u.id === me.id ? null : (
                      <RoleToggle userId={u.id} isAdmin={isAdmin} name={u.name} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      <p className="text-sm text-muted-foreground">
        {users.length === 100 ? "Showing the first 100 users. Search to narrow the list." : `${users.length} user${users.length === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}
