# FormGen — System Analysis v03 (2026-08-15)

Requirements analysis: **public REST web service** for the questionnaire app —
API key authentication, capabilities/scopes, rate limiting, request logging,
documentation. Owner request (2026-08-15): "create web service of our
questionnaire apps, analyze the requirement to implement the feature from the
REST api body and response format, security, authorization, and the api
documentation. we can use api key mechanism to know who is accessing the api,
and what capability it has, we can also use rate limiting and the request
logging."

Status: analysis complete — owner decisions recorded in §9 (2026-08-17); tickets filed (see §10).

## 1. What is being built

A machine-to-machine REST API (`/api/v1/*`) that lets authorized consumers
read questionnaire data and submit/fetch responses programmatically. This is
distinct from the existing public respondent API (browser form flow, no auth)
and the dashboard (session-auth, human UI).

Consumers (hypothesis, to confirm): partner systems, data-exchange pipelines,
mobile/native clients, BPS-style statistical integrations that need
questionnaire metadata + response data without a browser.

## 2. Current-state inventory (verified in code)

| Capability | Exists today | Notes |
|---|---|---|
| Public JSON routes | ✅ | `/api/questionnaires*`, `/api/option-sets/*/options`, `/api/invitations/*` — respondent flow, no auth |
| Session auth (JWT cookie) | ✅ | `fg_session`, dashboard/admin only |
| RBAC permissions | ✅ | `rbac.ts` (ADMIN/OPERATOR) — for dashboard, not for API consumers |
| Rate limiting | ✅ | `rate-limit.service.ts` generalized (TKT-023): `assertWithinLimit(key, limit, windowMs)` + `recordRateLimitEvent` over `RateLimitEvent` table |
| Request logging | ❌ | None for API consumers (Next server logs only) |
| API keys / scopes | ❌ | No ApiKey model, no key auth |
| API docs | ❌ | Specs are internal docs only |
| Standard error envelope | ✅ | `{ error: { code, message } }` via `jsonError` |
| Success envelope | ⚠️ | Ad-hoc per route (`{ questionnaire }`, `{ response }`, ...) — needs standardization for v1 API |

## 3. Requirements (derived + owner-stated)

### 3.1 Authentication — API keys (owner-stated)
- Each consumer gets an opaque API key; the key identifies WHO is calling and
  WHAT they may do (capability set).
- Key lifecycle: issue (admin), view metadata, rotate, revoke, optional expiry.
- Key must be stored **hashed** (never plaintext at rest); shown in full only
  once at creation.
- Transport: `Authorization: Bearer fg_live_<secret>` (or `X-API-Key` — decide,
  §9).

### 3.2 Authorization — scopes/capabilities
- Each key carries a set of scopes, e.g.:
  - `questionnaires:read` — list + detail
  - `responses:read` — list + detail
  - `responses:write` — submit responses programmatically
  - `reports:read` — report/export data
- Scopes are enforced **server-side in every v1 route** (never just hidden in
  docs). A key without the scope gets 403.

### 3.3 Rate limiting (owner-stated)
- Per-key limits (e.g. 60 req/min default, configurable per key/tier).
- Per-IP backstop for unauthenticated or abnormal traffic.
- Reuse the existing `assertWithinLimit`/`recordRateLimitEvent` machinery —
  do NOT invent a second rate-limit system.
- 429 with the stable `RATE_LIMITED` shape.

### 3.4 Request logging (owner-stated)
- Log every API request: apiKey (or anonymous), method, path, status,
  durationMs, IP, user-agent, timestamp.
- **Never log request/response bodies** — responses contain PII (respondent
  answers). Logging the shape/metadata only.
- Storage: `ApiRequestLog` table (append-only).

### 3.5 Documentation (owner-stated)
- OpenAPI 3.0 spec (machine-readable, can render + generate clients).
- Developer guide (auth, errors, examples, rate limits, scopes) as markdown.
- Decide: static files in `docs/`, or a live `/api/docs` page.

## 4. Proposed API surface (v1 — decided 2026-08-17)

Decisions applied: **read-only v1** (no `responses:write` in v1; POST deferred),
Bearer header, page/pageSize pagination, scopes extended with
`masters:read` + `option-sets:read`.

| Method | Path | Scope | Purpose |
|---|---|---|---|
| GET | `/api/v1/questionnaires` | questionnaires:read | List (paged), optional status filter |
| GET | `/api/v1/questionnaires/{id}` | questionnaires:read | Detail incl. blocks/questions/options |
| GET | `/api/v1/questionnaires/{id}/responses` | responses:read | List responses (paged, filters: status, from, to) |
| GET | `/api/v1/responses/{id}` | responses:read | Response detail with answers |
| GET | `/api/v1/questionnaires/{id}/report` | reports:read | Aggregated report data (KPIs, per-question stats) |
| GET | `/api/v1/masters` | masters:read | Master data list (paged) |
| GET | `/api/v1/option-sets/{id}` | option-sets:read | Option set detail incl. options |
| GET | `/api/v1/health` | none (public) | Liveness/version probe |

Deferred to v2 (owner decision): `POST /api/v1/questionnaires/{id}/responses`
(`responses:write`) — machine submission not needed yet; the link-based
distribution model stays primary.

Non-goals v1: no builder mutations over the API (dashboard remains the
authoring surface), no admin/user management over the API, no streaming.

## 5. Data model additions

Decisions applied: **SHA-256 hashing** (owner, §9.5); new `ApiKeyRequest`
model for the self-serve portal + admin approval flow (§9.1).

```prisma
model ApiKey {
  id          String   @id @default(cuid())
  name        String                 // human label: "BPS pipeline", "Mobile app"
  keyHash     String   @unique       // SHA-256 of the secret — never plaintext
  keyPrefix   String                 // first 8 chars for display "fg_live_ab12..."
  scopes      Json                   // string[] of capability names
  status      ApiKeyStatus @default(ACTIVE)   // ACTIVE | REVOKED | EXPIRED
  expiresAt   DateTime?
  lastUsedAt  DateTime?
  createdBy   String?                // dashboard user who issued it
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// Self-serve portal: external party requests a key; admin approves/denies.
model ApiKeyRequest {
  id          String   @id @default(cuid())
  requesterName   String
  requesterEmail  String
  organization    String?
  purpose         String              // why they need access ("data access request")
  requestedScopes Json                // string[]
  status      ApiKeyRequestStatus @default(PENDING)  // PENDING | APPROVED | DENIED
  approvedKeyId String?               // ApiKey created when approved
  reviewedBy  String?
  reviewedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model ApiRequestLog {
  id         String   @id @default(cuid())
  apiKeyId   String?  // null for anonymous/unauthenticated calls
  method     String
  path       String
  statusCode Int
  durationMs Int
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())
  @@index([apiKeyId, createdAt])
  @@index([createdAt])
}
```

Security notes: hash with SHA-256 (owner decision — sufficient for
high-entropy 256-bit keys). Never store the raw key. `keyPrefix` lets ops
identify a key without revealing it. Revocation is a status flip; expiry
checked on every request.

## 6. Security model

1. **Key at rest**: hashed only; plaintext shown once at creation (copy-to-clipboard).
2. **Transport**: HTTPS in production; API keys are bearer credentials — never
   in URLs, never in logs.
3. **Enforcement**: every v1 route runs `requireApiKey()` (valid, active,
   not expired) → `requireScope(scope)` → `assertWithinLimit(key-specific)` →
   handler. Failures use the stable envelope.
4. **PII**: request logs store metadata only; response bodies never logged.
5. **No CSRF concern**: bearer-token API, not cookie-authenticated.
6. **Reuse**: AppError hierarchy, `jsonError`, existing rate-limit service.
7. Admin UI to issue/revoke keys is part of the feature (admin-only, dashboard).

## 7. Response/error envelope (standardize for v1)

Success:
```json
{ "data": { ... } }
```
List (paged):
```json
{ "data": [ ... ], "meta": { "page": 1, "pageSize": 50, "total": 213, "totalPages": 5 } }
```
Error:
```json
{ "error": { "code": "SCOPE_FORBIDDEN", "message": "..." } }
```

Error codes (align with existing AppError codes):
- 401 `UNAUTHORIZED` — missing/invalid key
- 403 `SCOPE_FORBIDDEN` — key valid but lacks scope
- 404 `NOT_FOUND`
- 409 `QUESTIONNAIRE_NOT_ACTIVE` / `RESPONSE_COMPLETED` (write semantics)
- 422 `VALIDATION_ERROR`
- 429 `RATE_LIMITED`
- 500 `INTERNAL`

## 8. Implementation sketch (for the technical spec, later)

- `src/lib/api-key.ts` — hashing, prefix, issue/rotate/revoke service.
- `src/services/api-key.service.ts` — Prisma ops + `requireApiKey` /
  `requireScope` helpers.
- `src/middleware-api.ts` or route-wrapper `withApiKey(handler, scopes)` —
  auth + scope + rate-limit + logging in one decorator; reuse
  `assertWithinLimit`.
- New route dir `src/app/api/v1/...` (keeps respondent routes untouched).
- Admin pages: `/admin/api-keys` (list, issue, revoke, usage stats from
  ApiRequestLog).
- OpenAPI `docs/openapi.yaml` + `docs/api-developer-guide.md`.

## 9. Open questions for the owner — DECIDED (2026-08-17)

All seven questions answered by the owner; decisions recorded below and
applied to §4 surface, §5 data model, and §10 breakdown.

1. **Consumers**: internal integrations only, or also external partners/public
   third parties? (Affects key-issuance policy + whether a self-serve portal is
   needed.)
   - Owner decision: **external too — self-serve portal for key generation and
     data access request, with admin approval of the API key generation.**

2. **Header**: `Authorization: Bearer <key>` vs `X-API-Key`? (Recommend Bearer —
   standard, proxy-friendly.)
   - Owner decision: **Bearer**

3. **Response submission**: should external systems be able to submit
   responses (`responses:write`), or is v1 read-only? (Owner's earlier
   distribution model is link-based; machine submission may or may not fit.)
   - Owner decision: **read-only for now** (responses:write deferred to v2)

4. **Pagination style**: page/pageSize (simple) vs cursor (stable under
   inserts)? Recommend page/pageSize for v1.
   - Owner decision: **page/pageSize for v1**

5. **Key hashing**: SHA-256 (fast, fine for high-entropy keys) vs bcrypt
   (slower, overkill)? Recommend SHA-256.
   - Owner decision: **SHA-256**

6. **Scope granularity**: the 4 scopes above sufficient? Add `masters:read` /
   `option-sets:read`?
   - Owner decision: **add masters + option-sets**

7. **Docs delivery**: static OpenAPI file + markdown guide in repo (recommend
   for v1) vs live rendered `/api/docs` page?
   - Owner decision: **static docs**

## 10. Ticket breakdown (filed after decisions)

1. TKT: schema — ApiKey + ApiKeyRequest(portal/approval) + ApiRequestLog +
   migration + Prisma client.
2. TKT: `api-key.service` — issue/rotate/revoke/list, SHA-256 hashing, scope
   checks, `withApiKey` wrapper (auth + scope + rate-limit + logging).
3. TKT: v1 read-only routes — questionnaires list/detail, responses
   list/detail, report, masters, option-sets (Bearer, page/pageSize,
   stable envelope).
4. TKT: self-serve portal — external key request + data-access request with
   admin approval workflow (public request page + admin approval queue).
5. TKT: admin API-key management UI + usage view (list, issue, approve,
   revoke).
6. TKT: OpenAPI spec + developer guide docs (static).
7. TKT (small): wire `ApiRequestLog` retention/cleanup policy.

Next analysis run: `analysis/v04_<date>.md` (after owner decisions / review).
