"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createOrganizationAction,
  updateOrganizationAction,
  assignUserOrganizationAction,
  createSurveyAction,
} from "@/lib/actions/org";
import { Badge, Button, Card, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/toast";
import { IconPlus } from "@/components/icons";

export interface OrgRow {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
  surveyCount: number;
}

export interface SurveyRow {
  id: string;
  organizationId: string;
  name: string;
  questionnaireCount: number;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR" | "DEV";
  organizationId: string | null;
}

/** Admin organization management (TKT-014): orgs, memberships, surveys. */
export function OrgsPanel({
  organizations,
  surveys,
  users,
}: {
  organizations: OrgRow[];
  surveys: SurveyRow[];
  users: UserRow[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDesc, setNewOrgDesc] = useState("");
  const [newSurvey, setNewSurvey] = useState<Record<string, string>>({});
  const [assignee, setAssignee] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const usersByOrg = useMemo(() => {
    const map: Record<string, UserRow[]> = {};
    for (const u of users) {
      if (u.organizationId) (map[u.organizationId] ??= []).push(u);
    }
    return map;
  }, [users]);

  const surveysByOrg = useMemo(() => {
    const map: Record<string, SurveyRow[]> = {};
    for (const s of surveys) (map[s.organizationId] ??= []).push(s);
    return map;
  }, [surveys]);

  const unassignedUsers = users.filter((u) => u.organizationId === null);

  const run = (fn: () => Promise<{ error?: string }>, success: string) => {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) {
        setError(res.error);
        toast.error("Action failed", res.error);
      } else {
        toast.success(success);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <Card className="p-6">
        <h2 className="mb-4 font-semibold">Add organization</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Name" required>
            <input
              className={inputClass}
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="e.g. BPS Pusat"
            />
          </Field>
          <Field label="Description">
            <input
              className={inputClass}
              value={newOrgDesc}
              onChange={(e) => setNewOrgDesc(e.target.value)}
              placeholder="Optional"
            />
          </Field>
          <div className="flex items-end">
            <Button
              disabled={pending || !newOrgName.trim()}
              onClick={() =>
                run(
                  () =>
                    createOrganizationAction({
                      name: newOrgName,
                      description: newOrgDesc || null,
                    }),
                  "Organization created"
                )
              }
            >
              <IconPlus size={15} className="mr-2" />
              Create
            </Button>
          </div>
        </div>
      </Card>

      {organizations.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
          No organizations yet — create one above.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {organizations.map((org) => (
            <Card key={org.id} className="p-6">
              <div className="flex items-center justify-between gap-2">
                {editingId === org.id ? (
                  <div className="flex flex-1 flex-col gap-2">
                    <input
                      className={inputClass}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Name"
                    />
                    <input
                      className={inputClass}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Description"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        disabled={!editName.trim()}
                        onClick={() =>
                          run(
                            () =>
                              updateOrganizationAction({
                                id: org.id,
                                name: editName,
                                description: editDesc || null,
                              }),
                            "Organization updated"
                          )
                        }
                      >
                        Save
                      </Button>
                      <Button variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <h3 className="font-semibold text-gray-900">{org.name}</h3>
                      {org.description && (
                        <p className="text-xs text-gray-500">{org.description}</p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">
                        {org.userCount} users · {org.surveyCount} surveys
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingId(org.id);
                        setEditName(org.name);
                        setEditDesc(org.description ?? "");
                      }}
                    >
                      Edit
                    </Button>
                  </>
                )}
              </div>

              {/* Surveys */}
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">Surveys</h4>
                {(surveysByOrg[org.id] ?? []).length === 0 ? (
                  <p className="text-xs text-gray-400">No surveys yet.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {(surveysByOrg[org.id] ?? []).map((s) => (
                      <li key={s.id} className="flex items-center justify-between">
                        <span className="text-gray-700">{s.name}</span>
                        <Badge tone="gray">{s.questionnaireCount} questionnaires</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex gap-2">
                  <input
                    className={`${inputClass} !py-1 text-xs`}
                    placeholder="New survey name"
                    value={newSurvey[org.id] ?? ""}
                    onChange={(e) =>
                      setNewSurvey((prev) => ({ ...prev, [org.id]: e.target.value }))
                    }
                  />
                  <Button
                    variant="secondary"
                    className="!px-2 !py-1 text-xs"
                    disabled={pending || !(newSurvey[org.id] ?? "").trim()}
                    onClick={() =>
                      run(
                        () =>
                          createSurveyAction({
                            organizationId: org.id,
                            name: newSurvey[org.id] ?? "",
                          }),
                        "Survey created"
                      )
                    }
                  >
                    Add survey
                  </Button>
                </div>
              </div>

              {/* Membership */}
              <div className="mt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">Members</h4>
                {(usersByOrg[org.id] ?? []).length === 0 ? (
                  <p className="text-xs text-gray-400">No members assigned.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {(usersByOrg[org.id] ?? []).map((u) => (
                      <li key={u.id} className="flex items-center justify-between">
                        <span className="text-gray-700">
                          {u.name} <span className="text-xs text-gray-400">({u.email})</span>
                        </span>
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          onClick={() =>
                            run(
                              () => assignUserOrganizationAction({ userId: u.id, organizationId: null }),
                              "User unassigned"
                            )
                          }
                        >
                          Unassign
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {unassignedUsers.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    <select
                      className={`${inputClass} !py-1 text-xs`}
                      value={assignee[org.id] ?? ""}
                      onChange={(e) =>
                        setAssignee((prev) => ({ ...prev, [org.id]: e.target.value }))
                      }
                    >
                      <option value="">Assign user…</option>
                      {unassignedUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      className="!px-2 !py-1 text-xs"
                      disabled={!assignee[org.id]}
                      onClick={() =>
                        run(
                          () =>
                            assignUserOrganizationAction({
                              userId: assignee[org.id],
                              organizationId: org.id,
                            }),
                          "User assigned"
                        )
                      }
                    >
                      Assign
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
