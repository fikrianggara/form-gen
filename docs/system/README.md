# FormGen — System Documentation

Complete, code-verified documentation of the FormGen system (Next.js 14 form
engine). Built 2026-08-15 against merged `main` (includes TKT-017).

## Document set

| # | Document | Contents |
|---|----------|----------|
| 01 | [Architecture](01-architecture.md) | Layer diagram, module map, request flow, design principles |
| 02 | [Tech Stack](02-tech-stack.md) | Stack, dependencies, environment, scripts, dev workflow |
| 03 | [Data Model](03-data-model.md) | All models, enums, relations, indexes, versioning scheme |
| 04 | [API Surface](04-api-surface.md) | Public routes, server actions, permissions matrix |
| 05 | [Flows](05-flows.md) | Sequence diagrams: fill, save, mailblast, auth, RAG, export |
| 06 | [Module Dependency](06-module-dependency.md) | Function/module dependency map, layering rules |

## Quick orientation

- **Public side** (no auth): landing `/`, fill `/f/[slug]`, JSON API under
  `/api/questionnaires/*`, invitation validation `/api/invitations/[token]`,
  option proxy `/api/option-sets/[id]/options`.
- **Dashboard** (auth required): `/dashboard*` builder + responses + report;
  `/admin/*` admin-only master data + users.
- **Engine** lives in `src/domain/` — pure functions, no I/O, unit-tested.
  Services in `src/services/` own all Prisma access. Server actions in
  `src/lib/actions/` are the dashboard mutation layer; route handlers under
  `src/app/api/` are the public JSON API.
- **Respondents have no accounts** (TKT-001 re-scope): identity is a browser
  token; distribution is via unique per-email invitation links.

## Source of truth

- Product spec: `docs/01-product-spec.md`
- Technical spec: `docs/02-technical-spec.md`
- Implementation plan: `docs/03-implementation-plan.md`
- Analysis & findings register (versioned, latest first): `analysis/LATEST.md`
