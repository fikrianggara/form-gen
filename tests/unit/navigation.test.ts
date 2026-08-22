import { describe, it, expect } from "vitest";
import { getNavigationGroups, type Role } from "@/lib/navigation";

describe("navigation model", () => {
  it("ADMIN sees all nav groups including Users, Orgs, Masters, and API Keys", () => {
    const groups = getNavigationGroups("ADMIN");
    const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));

    expect(allHrefs).toContain("/dashboard");
    expect(allHrefs).toContain("/dashboard/proposals");
    expect(allHrefs).toContain("/admin/orgs");
    expect(allHrefs).toContain("/admin/users");
    expect(allHrefs).toContain("/admin/question-masters");
    expect(allHrefs).toContain("/admin/option-sets");
    expect(allHrefs).toContain("/admin/api-keys");
  });

  it("DEV sees API Keys and Masters, but NOT Users or Orgs", () => {
    const groups = getNavigationGroups("DEV");
    const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));

    expect(allHrefs).toContain("/dashboard");
    expect(allHrefs).toContain("/dashboard/proposals");
    expect(allHrefs).toContain("/admin/api-keys");
    expect(allHrefs).toContain("/admin/question-masters");
    expect(allHrefs).toContain("/admin/option-sets");
    expect(allHrefs).not.toContain("/admin/users");
    expect(allHrefs).not.toContain("/admin/orgs");
  });

  it("OPERATOR sees Dashboard, Proposals, Questionnaires, but NOT Users, Orgs, Masters, or API Keys", () => {
    const groups = getNavigationGroups("OPERATOR");
    const allHrefs = groups.flatMap((g) => g.items.map((i) => i.href));

    expect(allHrefs).toContain("/dashboard");
    expect(allHrefs).toContain("/dashboard/proposals");
    expect(allHrefs).not.toContain("/admin/users");
    expect(allHrefs).not.toContain("/admin/orgs");
    expect(allHrefs).not.toContain("/admin/api-keys");
  });

  it("returns primary quick actions for all authenticated roles", () => {
    for (const role of ["ADMIN", "DEV", "OPERATOR"] as Role[]) {
      const groups = getNavigationGroups(role);
      const actionGroup = groups.find((g) => g.id === "actions");
      expect(actionGroup).toBeDefined();
      const actionHrefs = actionGroup!.items.map((i) => i.href);
      expect(actionHrefs).toContain("/dashboard/new");
      expect(actionHrefs).toContain("/dashboard/generate");
    }
  });
});
