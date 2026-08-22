import { listUsers } from "@/services/user.service";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { getSession } from "@/lib/http";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (session?.role !== "ADMIN") redirect("/dashboard");

  const users = await listUsers();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Users</h1>
      <UsersPanel
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          isActive: u.isActive,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
