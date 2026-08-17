import { listOrganizations, listSurveys } from "@/services/org.service";
import { listUsers } from "@/services/user.service";
import { OrgsPanel } from "@/components/admin/OrgsPanel";

export const dynamic = "force-dynamic";

export default async function AdminOrgsPage() {
  const [orgs, surveys, users] = await Promise.all([
    listOrganizations(),
    listSurveys(),
    listUsers(),
  ]);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Organizations</h1>
      <OrgsPanel
        organizations={orgs.map((o) => ({
          id: o.id,
          name: o.name,
          description: o.description,
          userCount: o._count.users,
          surveyCount: o._count.surveys,
        }))}
        surveys={surveys.map((s) => ({
          id: s.id,
          organizationId: s.organizationId,
          name: s.name,
          questionnaireCount: s._count.questionnaires,
        }))}
        users={users.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          organizationId: u.organizationId,
        }))}
      />
    </div>
  );
}
