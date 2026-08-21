| id | type | size | sev | group | status | assignee | branch | ready | title |
|---|-----|------|-----|-------|--------|----------|--------|-------|-------|
| TKT-024 | feature | big | P0 | questionnaire-extras | merged | jarvis | feature-TKT-024-response-status-workflow | false | Response status workflow: draft, submitted, edited, approved + audit trail |
| TKT-001 | feature | big | P0 | respondent-auth | merged | jarvis | feature-TKT-001-unique-link-distribution | false | Unique-link distribution & lazy response creation — mailblast sample links, no accounts |
| TKT-020 | feature | medium | P0 | invitation-hardening | merged | jarvis | feature-TKT-020-invitation-token-expiry | false | Invitation token expiry, single-use enforcement, and admin revoke |
| TKT-023 | feature | medium | P0 | respondent-auth | merged | jarvis | feature-TKT-023-rate-limit-public-respon | false | Rate-limit public response submission endpoints |
| TKT-032 | feature | big | P1 | public-api | merged | jarvis | feature-TKT-032-public-rest-api-schema-a | false | Public REST API schema — ApiKey, ApiKeyRequest, ApiRequestLog models + migration |
| TKT-033 | feature | big | P1 | public-api | merged | jarvis | feature-TKT-032-public-rest-api-schema-a | false | api-key.service — issue/rotate/revoke, SHA-256 hashing, scope checks, withApiKey wrapper |
| TKT-034 | feature | big | P1 | public-api | merged | jarvis | feature-TKT-032-public-rest-api-schema-a | false | Public REST API v1 read-only routes — questionnaires, responses, report, masters, option-sets |
| TKT-035 | feature | big | P1 | public-api | merged | jarvis | feature-TKT-032-public-rest-api-schema-a | false | Self-serve API key portal — external request + admin approval workflow |
| TKT-006 | feature | big | P1 | rule-engine | merged | jarvis | feature-TKT-006-multi-rule-visibility-en | false | Multi-rule visibility engine — OR/AND rule sets + validation engine |
| TKT-007 | feature | big | P1 | rule-engine | merged | jarvis | feature-TKT-006-multi-rule-visibility-en | false | Question blocks with multi entry rules |
| TKT-041 | feature | big | P1 | survey-management | merged | jarvis | feature-TKT-041-survey-questionnaire-man | false | Survey↔Questionnaire many-to-many — join table + backfill migration + access-control updates |
| TKT-042 | feature | big | P1 | survey-management | merged | jarvis | feature-TKT-041-survey-questionnaire-man | false | Survey page — connect/disconnect questionnaires, delete survey (survey page + org page) |
| TKT-036 | feature | medium | P1 | public-api | merged | jarvis | feature-TKT-032-public-rest-api-schema-a | false | Admin API-key management UI — list, issue, approve, revoke, usage view |
| TKT-039 | feature | medium | P1 | public-api | backlog | null | null | false | Org-scoped API access — organizationId on ApiKey/ApiKeyRequest + org-aware v1 route filters |
| TKT-047 | feature | medium | P1 | public-api | merged | jarvis | feature-TKT-047-dev-role-operator-permis | false | DEV role — operator permissions + API key issuance (ISSUE_API_KEYS); portal approval stays admin-only |
| TKT-017 | feature | medium | P1 | questionnaire-extras | merged | jarvis | feature-TKT-017-responses-page-view-edit | false | Responses page: view/edit/delete/mailblast actions in a popup menu per respondent |
| TKT-040 | feature | medium | P1 | questionnaire-extras | merged | jarvis | feature-TKT-040-delete-questionnaire-cre | false | Delete questionnaire — creator-only with response cascade |
| TKT-015 | bug | small | P1 | admin-polish | merged | jarvis | bug-TKT-015-questionnaire-editor-add | false | Questionnaire editor: added question and required toggle do not update until page reload |
| TKT-027 | bug | small | P1 | admin-polish | merged | jarvis | bug-TKT-027-user-creation-crashes-on | false | User creation crashes on form reset (currentTarget null after await) |
| TKT-028 | feature | small | P1 | admin-polish | merged | jarvis | feature-TKT-028-users-table-kebab-action | false | Users table: kebab action menu (Edit, Reset password, Enable/Disable) + pure status badge |
| TKT-029 | feature | small | P1 | admin-polish | merged | jarvis | feature-TKT-028-users-table-kebab-action | false | Disable user revokes active session (isActive checked at session verify) + self-lockout guard |
| TKT-030 | bug | small | P1 | admin-polish | merged | jarvis | bug-TKT-030-table-wrappers-clip-popu | false | Table wrappers clip popup menus (overflow-hidden truncates action menus) |
| TKT-019 | feature | small | P1 | invitation-hardening | merged | jarvis | feature-TKT-019-absolute-base-url-for-in | false | Absolute base URL for invitation links |
| TKT-021 | bug | small | P1 | invitation-hardening | merged | jarvis | feature-TKT-019-absolute-base-url-for-in | false | Escape HTML in mail templates |
| TKT-022 | feature | small | P1 | invitation-hardening | merged | jarvis | feature-TKT-019-absolute-base-url-for-in | false | Invitation.responseId as a real FK relation |
| TKT-045 | feature | small | P1 | public-api | merged | jarvis | feature-TKT-045-expose-openapi-spec-via | false | Expose OpenAPI spec via REST API endpoint |
| TKT-003 | bug | small | P1 | respondent-auth | merged | jarvis | bug-TKT-003-rate-limit-respondent-lo | false | Rate-limit respondent login attempts |
| TKT-025 | feature | small | P1 | — | backlog | null | null | false | Drop dead requiresAccount column |
| TKT-008 | feature | big | P2 | ai-sourcing | merged | jarvis | feature-TKT-008-ai-generation-round-2-fla | false | AI generation round 2 — flag novel questions, add-to-master modal, admin validation, visibility filter |
| TKT-048 | feature | big | P2 | landing-page | merged | jarvis | feature-TKT-048-landing-page-marketing-h | false | Landing page — marketing homepage (features, how it works, business flow) |
| TKT-014 | feature | big | P2 | org-scoping | merged | jarvis | feature-TKT-014-organization-scoping-org | false | Organization scoping — org to survey to multiple questionnaires, operator org access, public/private masters |
| TKT-005 | feature | big | P2 | proposal | merged | jarvis | feature-TKT-005-survey-proposal-workflow | false | Survey proposal workflow with optional email verification |
| TKT-044 | feature | medium | P2 | admin-polish | backlog | null | null | false | Component tests for interactive panels (Testing Library) — editor add/toggle, user-create reset, kebab menu in table wrapper |
| TKT-009 | feature | medium | P2 | external-mapping | backlog | null | null | false | External question source with MSSD format remapping |
| TKT-037 | feature | medium | P2 | public-api | merged | jarvis | feature-TKT-032-public-rest-api-schema-a | false | OpenAPI spec + developer guide docs (static) |
| TKT-046 | feature | medium | P2 | public-api | merged | jarvis | feature-TKT-046-swagger-ui-for-the-publi | false | Swagger UI for the public API spec — serve openapi.yaml + interactive docs endpoint |
| TKT-012 | feature | medium | P2 | questionnaire-extras | merged | jarvis | feature-TKT-012-questionnaire-sample-upl | false | Questionnaire sample upload (sampling frame via Excel) |
| TKT-013 | feature | medium | P2 | questionnaire-extras | merged | jarvis | feature-TKT-012-questionnaire-sample-upl | false | Mailblast respondent emails |
| TKT-002 | feature | medium | P2 | respondent-auth | cancelled | null | null | false | Email verification and password reset for respondents |
| TKT-043 | feature | medium | P2 | survey-management | merged | jarvis | feature-TKT-041-survey-questionnaire-man | false | Questionnaire survey tags — show surveys using a questionnaire, multi-select in editor |
| TKT-011 | feature | small | P2 | admin-polish | merged | jarvis | feature-TKT-011-small-wins | false | Conditional field disabling in master and option set forms |
| TKT-018 | feature | small | P2 | admin-polish | merged | jarvis | feature-TKT-018-system-wide-action-icons | false | System-wide action icons (view, add, edit, delete, logout, login, etc.) |
| TKT-031 | feature | small | P2 | admin-polish | merged | jarvis | feature-TKT-031-add-generate-with-ai-but | false | Add 'Generate with AI' button on questionnaires page |
| TKT-010 | feature | small | P2 | external-mapping | merged | jarvis | feature-TKT-011-small-wins | false | Option set nested key extraction from API responses |
| TKT-049 | feature | small | P2 | landing-page | merged | jarvis | feature-TKT-049-landing-page-highlight-a | false | Landing page — highlight AI questionnaire generation (RAG hybrid retrieval) |
| TKT-050 | feature | small | P2 | landing-page | done | jarvis | feature-TKT-050-landing-hero-fold-ai-fea | true | Landing hero — fold AI feature into hero with overlapping cards; hover 'Try AI generation' brings AI card to top |
| TKT-038 | feature | small | P2 | public-api | merged | jarvis | feature-TKT-032-public-rest-api-schema-a | false | ApiRequestLog retention/cleanup policy |
| TKT-004 | feature | small | P2 | — | merged | jarvis | feature-TKT-004-drill-ticket-verify-the | false | Drill ticket — verify the workflow loop |
| TKT-016 | feature | small | P2 | — | merged | jarvis | feature-TKT-016-visible-disabled-state-f | false | Visible disabled state for input fields in master and option set forms |
| TKT-026 | feature | small | P2 | — | backlog | null | null | false | CI pipeline for the gate chain (tsc, vitest, lint, build) |
