# Task Checklist

**Session ID**: `phase00-session03-safe-defaults-and-deployment-baseline`
**Total Tasks**: 24
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
| Setup | 3 | 3 | 0 |
| Foundation | 5 | 5 | 0 |
| Implementation | 12 | 12 | 0 |
| Testing | 4 | 4 | 0 |
| **Total** | **24** | **24** | **0** |

---

## Setup (3 tasks)

Secure-default scope confirmation before code changes.

- [x] T001 [S0003] Verify the Phase 00 mutation, provider-probe, and outbound-diagnostic route inventory and map each route to its controlling `ENABLE_*` flag in implementation notes (`.spec_system/specs/phase00-session03-safe-defaults-and-deployment-baseline/implementation-notes.md`)
- [x] T002 [S0003] Define the disabled-response and dry-run diagnostic contract for route handlers and client surfaces in implementation notes (`.spec_system/specs/phase00-session03-safe-defaults-and-deployment-baseline/implementation-notes.md`)
- [x] T003 [S0003] Capture the current Docker, README, and deployment-doc mismatches against the loopback and Cloudflare Access baseline in implementation notes (`.spec_system/specs/phase00-session03-safe-defaults-and-deployment-baseline/implementation-notes.md`)

---

## Foundation (5 tasks)

Shared feature-flag and client-contract infrastructure.

- [x] T004 [S0003] [P] Create shared server-only feature-flag parsing and `requireFeatureFlag` helpers (`lib/security/feature-flags.ts`)
- [x] T005 [S0003] [P] Add unit tests for feature-flag parsing, invalid env handling, and disabled-response helpers (`lib/security/feature-flags.test.ts`)
- [x] T006 [S0003] Update shared protected-response types to model feature-disabled and dry-run diagnostic metadata (`lib/security/types.ts`)
- [x] T007 [S0003] Update the protected-request client helper to surface feature-disabled responses and diagnostic modes without losing operator-auth handling (`lib/operator-elevation-client.ts`)
- [x] T008 [S0003] [P] Extend protected-request client tests for feature-disabled and dry-run payload handling (`lib/operator-elevation-client.test.ts`)

---

## Implementation (12 tasks)

Route gating, dry-run behavior, operator messaging, and deployment alignment.

- [x] T009 [S0003] [P] Enforce `ENABLE_MODEL_MUTATIONS` on config model writes with authorization enforced at the boundary closest to the resource and explicit disabled-state errors (`app/api/config/agent-model/route.ts`)
- [x] T010 [S0003] [P] Enforce `ENABLE_ALERT_WRITES` on alert config writes with duplicate-trigger prevention while in-flight and read-only GET preserved (`app/api/alerts/route.ts`)
- [x] T011 [S0003] [P] Enforce `ENABLE_PIXEL_OFFICE_WRITES` on layout saves with duplicate-trigger prevention while in-flight and write-path failures closed (`app/api/pixel-office/layout/route.ts`)
- [x] T012 [S0003] [P] Enforce `ENABLE_PROVIDER_PROBES` on single-model diagnostics with timeout, explicit disabled-state errors, and deterministic result metadata (`app/api/test-model/route.ts`)
- [x] T013 [S0003] [P] Enforce `ENABLE_PROVIDER_PROBES` on bound-model diagnostics with timeout, explicit disabled-state errors, and no `GET` side-effect alias (`app/api/test-bound-models/route.ts`)
- [x] T014 [S0003] [P] Enforce `ENABLE_OUTBOUND_TESTS` on single-session diagnostics with timeout, explicit disabled-state errors, and sanitized failure handling (`app/api/test-session/route.ts`)
- [x] T015 [S0003] [P] Enforce `ENABLE_OUTBOUND_TESTS` on batch session diagnostics with timeout, explicit disabled-state errors, and no `GET` side-effect alias (`app/api/test-sessions/route.ts`)
- [x] T016 [S0003] [P] Enforce `ENABLE_OUTBOUND_TESTS` on DM diagnostics with timeout, explicit disabled-state errors, and no `GET` side-effect alias (`app/api/test-dm-sessions/route.ts`)
- [x] T017 [S0003] [P] Refactor platform diagnostics to default to dry-run when live-send is disabled, return explicit mode metadata, and remove the `GET` alias (`app/api/test-platforms/route.ts`)
- [x] T018 [S0003] [P] Refactor alert checks to honor outbound-test and live-send flags, return explicit dry-run notification results, and fail closed on send paths (`app/api/alerts/check/route.ts`)
- [x] T019 [S0003] Update operator-facing diagnostic pages to show explicit loading, disabled, dry-run, and error states on protected actions (`app/page.tsx`, `app/models/page.tsx`, `app/alerts/page.tsx`, `app/sessions/page.tsx`)
- [x] T020 [S0003] Align root env and deployment artifacts with loopback-only origin defaults and the secure-default capability contract (`.env.example`, `README.md`, `docs/deployment.md`, `docs/environments.md`, `docs/onboarding.md`, `Dockerfile`)

---

## Testing (4 tasks)

Regression coverage and verification evidence.

- [x] T021 [S0003] [P] Extend write-route tests for disabled flag behavior while preserving read-only GET coverage (`app/api/config/agent-model/route.test.ts`, `app/api/alerts/route.test.ts`, `app/api/pixel-office/layout/route.test.ts`)
- [x] T022 [S0003] [P] Create diagnostic-route tests for provider-probe, session, DM, platform, and alert-check flags, dry-run or live-send metadata, and `GET` 405 behavior (`app/api/test-model/route.test.ts`, `app/api/test-bound-models/route.test.ts`, `app/api/test-session/route.test.ts`, `app/api/test-sessions/route.test.ts`, `app/api/test-dm-sessions/route.test.ts`, `app/api/test-platforms/route.test.ts`, `app/api/alerts/check/route.test.ts`)
- [x] T023 [S0003] [P] Extend operator UI smoke coverage for disabled and dry-run diagnostic messaging (`app/page.test.tsx`)
- [x] T024 [S0003] Run focused tests, manually verify home/models/sessions/alerts/pixel-office flows with flags off and on, and validate ASCII plus LF while recording deferred follow-ups (`.spec_system/specs/phase00-session03-safe-defaults-and-deployment-baseline/implementation-notes.md`)

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

Run the `implement` workflow step to begin AI-led implementation.
