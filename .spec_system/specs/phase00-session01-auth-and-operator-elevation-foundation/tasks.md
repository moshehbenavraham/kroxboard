# Task Checklist

**Session ID**: `phase00-session01-auth-and-operator-elevation-foundation`
**Total Tasks**: 22
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
| Setup | 3 | 0 | 3 |
| Foundation | 6 | 0 | 6 |
| Implementation | 9 | 0 | 9 |
| Testing | 4 | 0 | 4 |
| **Total** | **22** | **0** | **22** |

---

## Setup (3 tasks)

Initial configuration and rollout preparation.

- [x] T001 [S0001] Verify the sensitive-route inventory and rollout order in implementation notes (`.spec_system/specs/phase00-session01-auth-and-operator-elevation-foundation/implementation-notes.md`)
- [x] T002 [S0001] Document the operator auth env contract and setup expectations (`.env.example`, `README.md`)
- [x] T003 [S0001] Create shared auth result and denial-state contracts (`lib/security/types.ts`)

---

## Foundation (6 tasks)

Core auth primitives and shared server-side boundary.

- [x] T004 [S0001] Create dashboard auth env parsing and validation helpers (`lib/security/dashboard-env.ts`)
- [x] T005 [S0001] [P] Create operator identity resolution for Cloudflare headers and localhost fallback (`lib/security/operator-identity.ts`)
- [x] T006 [S0001] [P] Create signed operator session cookie helpers with bounded TTL, secure attributes, and constant-time code checks (`lib/security/operator-session.ts`)
- [x] T007 [S0001] Implement the shared sensitive-route guard and typed denial responses with authorization enforced at the boundary closest to the resource (`lib/security/sensitive-route.ts`)
- [x] T008 [S0001] Create the operator elevate route for code challenge issue and explicit session clear behavior with duplicate-trigger prevention while in-flight (`app/api/operator/elevate/route.ts`)
- [x] T009 [S0001] Create the operator session status route for client bootstrap and explicit challenge-required states (`app/api/operator/session/route.ts`)

---

## Implementation (9 tasks)

Route adoption and operator-facing challenge flow.

- [x] T010 [S0001] Protect config mutation and pixel-office layout write routes with authorization enforced at the boundary closest to the resource (`app/api/config/agent-model/route.ts`, `app/api/pixel-office/layout/route.ts`)
- [x] T011 [S0001] Protect alert write and alert-check routes with authorization enforced at the boundary closest to the resource (`app/api/alerts/route.ts`, `app/api/alerts/check/route.ts`)
- [x] T012 [S0001] Protect model probe routes with authorization enforced at the boundary closest to the resource (`app/api/test-model/route.ts`, `app/api/test-bound-models/route.ts`)
- [x] T013 [S0001] Protect platform and session diagnostic routes with authorization enforced at the boundary closest to the resource (`app/api/test-platforms/route.ts`, `app/api/test-session/route.ts`, `app/api/test-sessions/route.ts`, `app/api/test-dm-sessions/route.ts`)
- [x] T014 [S0001] Create the client elevation API wrapper and single-retry contract with duplicate-trigger prevention while in-flight (`lib/operator-elevation-client.ts`)
- [x] T015 [S0001] [P] Create the operator elevation provider and challenge dialog with accessibility labels, focus management, and state reset on re-entry (`app/components/operator-elevation-provider.tsx`, `app/components/operator-elevation-dialog.tsx`, `app/providers.tsx`)
- [x] T016 [S0001] Wire home and models sensitive actions through the shared elevation flow with explicit loading, denied, and retry states (`app/page.tsx`, `app/models/page.tsx`)
- [x] T017 [S0001] Wire alerts surfaces through the shared elevation flow with explicit loading, denied, and retry states (`app/alerts/page.tsx`, `app/alert-monitor.tsx`)
- [x] T018 [S0001] Wire sessions and pixel-office sensitive actions through the shared elevation flow with explicit loading, denied, and retry states (`app/sessions/page.tsx`, `app/pixel-office/page.tsx`)

---

## Testing (4 tasks)

Verification and regression coverage.

- [x] T019 [S0001] [P] Write unit tests for env parsing, identity resolution, and session signing (`lib/security/dashboard-env.test.ts`, `lib/security/operator-identity.test.ts`, `lib/security/operator-session.test.ts`)
- [x] T020 [S0001] [P] Write route tests for challenge issuance and representative protected handlers (`app/api/operator/elevate/route.test.ts`, `app/api/config/agent-model/route.test.ts`, `app/api/alerts/route.test.ts`)
- [x] T021 [S0001] [P] Write client tests for provider retry behavior and dialog state reset on re-entry (`app/components/operator-elevation-provider.test.tsx`, `app/page.test.tsx`)
- [x] T022 [S0001] Run `npm test`, verify ASCII and LF on touched files, manually exercise blocked and elevated operator flows, and record outcomes (`.spec_system/specs/phase00-session01-auth-and-operator-elevation-foundation/implementation-notes.md`)

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

Session complete. Run `updateprd` to sync tracking state and prepare the next session.
