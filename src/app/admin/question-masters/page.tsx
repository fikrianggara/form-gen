import { listQuestionMasters, listAllMasterVersions, listOptionSets } from "@/services/master-data.service";
import { MastersPanel } from "@/components/admin/MastersPanel";

export const dynamic = "force-dynamic";

export default async function AdminMastersPage() {
  const [masters, optionSets, history] = await Promise.all([
    listQuestionMasters({ all: true }),
    listOptionSets(),
    listAllMasterVersions(),
  ]);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Question masters</h1>
      <MastersPanel
        masters={masters.map((m) => ({
          id: m.id,
          code: m.code,
          title: m.title,
          description: m.description,
          questionType: m.questionType,
          requiredDefault: m.requiredDefault,
          optionSetId: m.optionSetId,
          version: m.version,
          isPublic: m.isPublic,
        }))}
        history={history.map((h) => ({
          id: h.id,
          code: h.code,
          title: h.title,
          version: h.version,
          isLatest: h.isLatest,
          updatedAt: h.updatedAt.toISOString(),
        }))}
        optionSets={optionSets.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
