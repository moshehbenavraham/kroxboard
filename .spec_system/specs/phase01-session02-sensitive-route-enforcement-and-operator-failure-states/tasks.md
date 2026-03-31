# Task Checklist

**Session ID**: `phase01-session02-sensitive-route-enforcement-and-operator-failure-states`
**Total Tasks**: 21
**Estimated Duration**: 3.5-4.0 hours
**Created**: 2026-03-31

---

## Legend

- `[x]` = Completed
- `[ ]` = Pending
- `[P]` = Parallelizable (can run with other [P] tasks)
- `[SNNMM]` = Session reference (NN=phase number, MM=session number)
- `TNNN` = Task ID

---

## Progress Summary

| Category | Total | Done | Remaining |
|----------|-------|------|-----------|
| Setup | 2 | 2 | 0 |
| Foundation | 6 | 6 | 0 |
| Implementation | 9 | 9 | 0 |
| Testing | 4 | 4 | 0 |
| **Total** | **21** | **21** | **0** |

---

## Setup (2 tasks)

Route inventory and trusted-origin policy definition before code changes.

- [x] T001 [S0102] Verify the targeted sensitive non-GET route inventory, intended methods, and UI owners in implementation notes (`.spec_system/specs/phase01-session02-sensitive-route-enforcement-and-operator-failure-states/implementation-notes.md`)
- [x] T002 [S0102] Document the trusted-origin policy for localhost and Cloudflare Access plus fail-closed exceptions in implementation notes (`.spec_system/specs/phase01-session02-sensitive-route-enforcement-and-operator-failure-states/implementation-notes.md`)

---

## Foundation (6 tasks)

Shared types, guards, and request-validation primitives.

- [x] T003 [S0102] Define typed sensitive request-denial states and invalid-request payload contracts for server-client parsing (`lib/security/types.ts`)
- [x] T004 [S0102] Create the shared sensitive mutation guard with origin normalization, method enforcement, and auth-origin denial mapping (`lib/security/sensitive-mutation.ts`)
- [x] T005 [S0102] [P] Write unit tests for the sensitive mutation guard across localhost, trusted remote origin, missing origin, and cross-origin rejection paths (`lib/security/sensitive-mutation.test.ts`)
- [x] T006 [S0102] Extend request-boundary validators with schema-validated operator code, model mutation, provider probe, alert write, and layout-save payload parsing plus explicit error mapping (`lib/security/request-boundary.ts`)
- [x] T007 [S0102] [P] Extend request-boundary tests for model refs, operator code, alert rules, and layout payload validation (`lib/security/request-boundary.test.ts`)
- [x] T008 [S0102] Extend protected-response parsing with invalid-request classification and shared failure messaging (`lib/operator-elevation-client.ts`, `lib/operator-elevation-client.test.ts`)

---

## Implementation (9 tasks)

Apply the shared enforcement layer to sensitive routes and operator-facing UI.

- [x] T009 [S0102] Protect operator elevation issue-clear flows with same-origin mutation enforcement, schema-validated operator code input, and state reset on re-entry (`app/api/operator/elevate/route.ts`)
- [x] T010 [S0102] Protect gateway proxy non-GET verbs with same-origin mutation enforcement, authorization enforced at the boundary closest to the resource, and failure-path handling before upstream credential use (`app/gateway/[...path]/route.ts`)
- [x] T011 [S0102] [P] Harden alert writes with same-origin mutation enforcement, schema-validated input, and duplicate-trigger prevention while in-flight (`app/api/alerts/route.ts`)
- [x] T012 [S0102] [P] Harden model mutation with same-origin mutation enforcement, validated model allowlist checks, and failure-path handling before gateway patch execution (`app/api/config/agent-model/route.ts`)
- [x] T013 [S0102] [P] Harden pixel-office layout writes with same-origin mutation enforcement, schema-validated layout input, and state reset or revalidation on re-entry (`app/api/pixel-office/layout/route.ts`)
- [x] T014 [S0102] [P] Harden provider-model probe requests with same-origin mutation enforcement, schema-validated input, and timeout-failure handling before provider calls (`app/api/test-model/route.ts`)
- [x] T015 [S0102] Apply same-origin mutation enforcement to alert-check and session diagnostic routes with authorization enforced at the boundary closest to the resource and failure-path handling (`app/api/alerts/check/route.ts`, `app/api/test-session/route.ts`, `app/api/test-sessions/route.ts`)
- [x] T016 [S0102] Apply same-origin mutation enforcement to bound-model, DM-session, and platform diagnostic routes with authorization enforced at the boundary closest to the resource and failure-path handling (`app/api/test-bound-models/route.ts`, `app/api/test-dm-sessions/route.ts`, `app/api/test-platforms/route.ts`)
- [x] T017 [S0102] Surface shared operator action banners on home, alerts, models, sessions, and pixel office with explicit denied, disabled, invalid, and retry-pending states plus accessibility labels and focus management (`app/components/operator-action-banner.tsx`, `app/page.tsx`, `app/alerts/page.tsx`, `app/models/page.tsx`, `app/sessions/page.tsx`, `app/pixel-office/page.tsx`)

---

## Testing (4 tasks)

Regression coverage and verification evidence.

- [x] T018 [S0102] [P] Add route tests for same-origin enforcement and invalid payload rejection on operator elevation, gateway proxy, alert writes, model mutation, pixel-office layout, and provider probe routes (`app/api/operator/elevate/route.test.ts`, `app/gateway/[...path]/route.test.ts`, `app/api/alerts/route.test.ts`, `app/api/config/agent-model/route.test.ts`, `app/api/pixel-office/layout/route.test.ts`, `app/api/test-model/route.test.ts`)
- [x] T019 [S0102] [P] Extend diagnostic route tests to prove cross-origin requests are rejected before gateway or alert work on alert-check and session-platform diagnostic routes (`app/api/alerts/check/route.test.ts`, `app/api/test-bound-models/route.test.ts`, `app/api/test-session/route.test.ts`, `app/api/test-sessions/route.test.ts`, `app/api/test-dm-sessions/route.test.ts`, `app/api/test-platforms/route.test.ts`)
- [x] T020 [S0102] [P] Add page-level tests for explicit denied, disabled, invalid, and dry-run operator banners on the sensitive-action views (`app/page.test.tsx`, `app/alerts/page.test.tsx`, `app/models/page.test.tsx`, `app/sessions/page.test.tsx`, `app/pixel-office/page.test.tsx`)
- [x] T021 [S0102] Run focused Vitest coverage, verify ASCII encoding and LF line endings on touched files, manually exercise same-origin writes plus denied-disabled-invalid UI states, and record outcomes (`.spec_system/specs/phase01-session02-sensitive-route-enforcement-and-operator-failure-states/implementation-notes.md`)

---

## Completion Checklist

Before marking session complete:

- [x] All tasks marked `[x]`
- [x] All tests passing
- [x] All files ASCII-encoded
- [x] implementation-notes.md updated
- [x] Ready for the validate workflow step

---

## Next Steps

Run the implement workflow step to begin AI-led implementation.
