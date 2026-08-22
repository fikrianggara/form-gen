import { getSession } from "@/lib/http";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || !(session.role === "ADMIN" || session.role === "DEV")) {
    redirect("/dashboard");
  }

  return (
    <AppShell
      user={{
        name: session.name,
        email: session.email,
        role: session.role,
      }}
    >
      {children}
    </AppShell>
  );
}
