import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { useCleanDb } from "./helpers";
import { issueApiKey } from "@/services/api-key.service";
import { GET as listQuestionnaires } from "@/app/api/v1/questionnaires/route";
import { GET as getQuestionnaire } from "@/app/api/v1/questionnaires/[id]/route";
import { GET as listResponses } from "@/app/api/v1/questionnaires/[id]/responses/route";
import { GET as getResponse } from "@/app/api/v1/responses/[id]/route";
import { GET as getReport } from "@/app/api/v1/questionnaires/[id]/report/route";
import { GET as listMasters } from "@/app/api/v1/masters/route";
import { GET as getOptionSet } from "@/app/api/v1/option-sets/[id]/route";
import { GET as health } from "@/app/api/v1/health/route";
import { NextRequest } from "next/server";

useCleanDb();

function v1Request(path: string, secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret) headers.authorization = `Bearer ${secret}`;
  return new NextRequest(`http://localhost${path}`, { headers });
}

const ctx = (id: string) => ({ params: { id } });

describe("v1 health (public)", () => {
  it("returns ok without a key", async () => {
    const res = await health(v1Request("/api/v1/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe("ok");
  });
});

describe("v1 auth + scopes", () => {
  // useCleanDb truncates before EVERY test — issue a fresh key per test.
  async function fullKey() {
    const issued = await issueApiKey({
      name: "route test",
      scopes: ["questionnaires:read", "responses:read", "reports:read", "masters:read", "option-sets:read"],
    });
    return issued.secret;
  }

  it("rejects missing key on protected routes (401)", async () => {
    const res = await listQuestionnaires(v1Request("/api/v1/questionnaires"));
    expect(res.status).toBe(401);
  });

  it("rejects a key without the required scope (403)", async () => {
    const limited = await issueApiKey({ name: "limited", scopes: ["masters:read"] });
    const res = await listQuestionnaires(v1Request("/api/v1/questionnaires", limited.secret));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("SCOPE_FORBIDDEN");
  });

  it("lists questionnaires with pagination meta", async () => {
    const secret = await fullKey();
    await db.questionnaire.create({
      data: { title: "Q1", slug: "q1", status: "ACTIVE" },
    });
    const res = await listQuestionnaires(
      v1Request("/api/v1/questionnaires?page=1&pageSize=10", secret)
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
    expect(body.meta.totalPages).toBe(1);
  });

  it("filters by status", async () => {
    const secret = await fullKey();
    await db.questionnaire.create({
      data: { title: "Draft", slug: "d1", status: "DRAFT" },
    });
    const res = await listQuestionnaires(
      v1Request("/api/v1/questionnaires?status=DRAFT", secret)
    );
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].slug).toBe("d1");
  });

  it("returns questionnaire detail, 404 for missing", async () => {
    const secret = await fullKey();
    const q = await db.questionnaire.create({
      data: { title: "Q1", slug: "q1", status: "ACTIVE" },
    });
    const ok = await getQuestionnaire(v1Request(`/api/v1/questionnaires/${q.id}`, secret), ctx(q.id));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.data.id).toBe(q.id);

    const missing = await getQuestionnaire(
      v1Request("/api/v1/questionnaires/nope", secret),
      ctx("nope")
    );
    expect(missing.status).toBe(404);
  });

  it("lists responses with filters and returns detail", async () => {
    const secret = await fullKey();
    const q = await db.questionnaire.create({
      data: { title: "Q1", slug: "q1", status: "ACTIVE" },
    });
    const r = await db.response.create({
      data: {
        questionnaireId: q.id,
        respondentToken: "tok-route-test",
        status: "SUBMITTED",
        progress: 100,
      },
    });
    const list = await listResponses(
      v1Request(`/api/v1/questionnaires/${q.id}/responses?status=SUBMITTED`, secret),
      ctx(q.id)
    );
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].id).toBe(r.id);

    const detail = await getResponse(v1Request(`/api/v1/responses/${r.id}`, secret), ctx(r.id));
    expect(detail.status).toBe(200);
    const detailBody = await detail.json();
    expect(detailBody.data.id).toBe(r.id);
  });

  it("returns report data", async () => {
    const secret = await fullKey();
    const q = await db.questionnaire.create({
      data: { title: "Q1", slug: "q1", status: "ACTIVE" },
    });
    const res = await getReport(v1Request(`/api/v1/questionnaires/${q.id}/report`, secret), ctx(q.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.questionnaire.id).toBe(q.id);
  });

  it("lists masters with pagination", async () => {
    const secret = await fullKey();
    await db.questionMaster.create({
      data: { code: "M001", title: "Master A", version: 1, isLatest: true, status: "PUBLISHED", questionType: "TEXT" },
    });
    const res = await listMasters(v1Request("/api/v1/masters?pageSize=5", secret));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.meta.total).toBe(1);
  });

  it("returns option set detail, 404 for missing", async () => {
    const secret = await fullKey();
    const os = await db.optionSet.create({
      data: { name: "OS1", version: 1, isLatest: true, options: { create: [{ label: "A", value: "a", order: 1 }] } },
    });
    const ok = await getOptionSet(v1Request(`/api/v1/option-sets/${os.id}`, secret), ctx(os.id));
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.data.options).toHaveLength(1);

    const missing = await getOptionSet(
      v1Request("/api/v1/option-sets/nope", secret),
      ctx("nope")
    );
    expect(missing.status).toBe(404);
  });

  it("logs every request to ApiRequestLog (metadata only)", async () => {
    const secret = await fullKey();
    const before = await db.apiRequestLog.count();
    await listQuestionnaires(v1Request("/api/v1/questionnaires", secret));
    const after = await db.apiRequestLog.count();
    expect(after).toBeGreaterThan(before);
  });
});
