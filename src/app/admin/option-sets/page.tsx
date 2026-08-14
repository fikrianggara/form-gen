import { listOptionSets, listAllOptionSetVersions } from "@/services/master-data.service";
import { OptionSetsPanel } from "@/components/admin/OptionSetsPanel";

export const dynamic = "force-dynamic";

export default async function AdminOptionSetsPage() {
  const [optionSets, history] = await Promise.all([
    listOptionSets(),
    listAllOptionSetVersions(),
  ]);
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Option sets</h1>
      <OptionSetsPanel
        optionSets={optionSets.map((s) => ({
          id: s.id,
          familyId: s.familyId,
          name: s.name,
          source: s.source,
          apiUrl: s.apiUrl,
          apiMethod: s.apiMethod,
          apiHeaders: (s.apiHeaders ?? {}) as Record<string, string> | null,
          itemsPath: s.itemsPath,
          apiLabelKey: s.apiLabelKey,
          apiValueKey: s.apiValueKey,
          options: s.options.map((o) => ({ label: o.label, value: o.value })),
          version: s.version,
        }))}
        history={history.map((h) => ({
          id: h.id,
          familyId: h.familyId,
          name: h.name,
          version: h.version,
          isLatest: h.isLatest,
          updatedAt: h.updatedAt.toISOString(),
          optionCount: h.options.length,
        }))}
      />
    </div>
  );
}
