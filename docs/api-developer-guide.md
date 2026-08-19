# FormGen Public API — Developer Guide (v1)

The public REST API lets external systems read questionnaire data
programmatically. It is distinct from the browser respondent flow (no auth)
and the dashboard (session auth, human UI).

**v1 is read-only.** Response submission over the API is deferred to v2.

## 1. Authentication

Every request (except `/health`) must include a Bearer API key:

```
Authorization: Bearer fg_live_...
```

Keys are issued by an administrator or through the self-serve portal
(approval required). Keys are stored hashed (SHA-256); the plaintext secret
is shown **exactly once** at creation — save it somewhere safe.

Key lifecycle: `ACTIVE` → `REVOKED` (admin) or `EXPIRED` (by date). A
revoked or expired key returns `401`.

## 2. Scopes

A key carries one or more capability scopes. A request that needs a scope
the key does not have returns `403 SCOPE_FORBIDDEN`.

| Scope | Endpoints |
|---|---|
| `questionnaires:read` | `GET /questionnaires`, `GET /questionnaires/{id}` |
| `responses:read` | `GET /questionnaires/{id}/responses`, `GET /responses/{id}` |
| `reports:read` | `GET /questionnaires/{id}/report` |
| `masters:read` | `GET /masters` |
| `option-sets:read` | `GET /option-sets/{id}` |

## 3. Envelope

Success (single object):

```json
{ "data": { ... } }
```

Success (list, paged):

```json
{ "data": [ ... ], "meta": { "page": 1, "pageSize": 50, "total": 213, "totalPages": 5 } }
```

Error:

```json
{ "error": { "code": "SCOPE_FORBIDDEN", "message": "..." } }
```

## 4. Error codes

| Status | Code | Meaning |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing/invalid/revoked/expired key |
| 403 | `SCOPE_FORBIDDEN` | Key valid but lacks the scope |
| 404 | `NOT_FOUND` | Resource not found |
| 422 | `VALIDATION_ERROR` | Bad input (future write endpoints) |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL` | Server error |

## 5. Rate limiting

Per-key default: **60 requests / minute**. A key that exceeds the limit
receives `429 RATE_LIMITED`. Limits are configurable per key/tier by an
administrator. Anonymous traffic (health checks) is logged but not limited.

## 6. Pagination

List endpoints accept `page` (1-based) and `pageSize` (max 200, default 50)
query parameters and return the same numbers in `meta`.

```
GET /api/v1/questionnaires?page=2&pageSize=100
```

Optional filters: `GET /questionnaires?status=ACTIVE`,
`GET /questionnaires/{id}/responses?status=SUBMITTED&from=2026-01-01&to=2026-12-31`.

## 7. Endpoints

### `GET /api/v1/health`
Public liveness probe. No key needed.

### `GET /api/v1/questionnaires`
Paged list, optional `status` filter.

### `GET /api/v1/questionnaires/{id}`
Full questionnaire detail incl. blocks, questions, options.

### `GET /api/v1/questionnaires/{id}/responses`
Paged responses, filters `status`, `from`, `to`.

### `GET /api/v1/responses/{id}`
Response detail with answers.

### `GET /api/v1/questionnaires/{id}/report`
Aggregated report (totals, daily counts, per-question stats).

### `GET /api/v1/masters`
Paged question masters (latest versions) with option sets.

### `GET /api/v1/option-sets/{id}`
Option set detail with options.

## 8. Example

```bash
curl -H "Authorization: Bearer fg_live_..." \
  "http://localhost:3100/api/v1/questionnaires?pageSize=10"
```

```json
{
  "data": [
    { "id": "cms...", "title": "BPS Survey 2026", "slug": "bps-2026", "status": "ACTIVE" }
  ],
  "meta": { "page": 1, "pageSize": 10, "total": 1, "totalPages": 1 }
}
```

## 9. Request logging & privacy

Every request is logged (metadata only: key, method, path, status,
duration, IP, user-agent). **Request/response bodies are never logged** —
responses contain respondent PII. Logs are retained 90 days
(`API_LOG_RETENTION_DAYS` to override) and purged automatically.

## 10. Machine-readable spec

`docs/openapi.yaml` (OpenAPI 3.0.3) describes the full surface; render it
with any OpenAPI viewer or use it to generate clients.

**Live interactive docs:** `GET /api/docs` serves Swagger UI, and the raw
spec is available at `GET /api/docs/openapi.yaml`.
