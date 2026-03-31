# Task Checklist

**Session ID**: `phase01-session03-abuse-resistance-and-deterministic-diagnostics`
**Total Tasks**: 20
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
| Foundation | 5 | 5 | 0 |
| Implementation | 9 | 9 | 0 |
| Testing | 4 | 4 | 0 |
| **Total** | **20** | **20** | **0** |

---

## Setup (2 tasks)

Diagnostic inventory and policy decisions before code changes.

- [x] T001 [S0103] Verify the abusive diagnostic, analytics, and release-check route inventory plus owning UI surfaces in implementation notes (`.spec_system/specs/phase01-session03-abuse-resistance-and-deterministic-diagnostics/implementation-notes.md`)
- [x] T002 [S0103] Document the target rate-budget tiers, dry-run or live-send policy, and deterministic cron data sources in implementation notes (`.spec_system/specs/phase01-session03-abuse-resistance-and-deterministic-diagnostics/implementation-notes.md`)

---

## Foundation (5 tasks)

Shared response contracts, rate budgets, and outbound safety primitives.

- [x] T003 [S0103] Define typed rate-limit denial payload and metadata contracts for route and client parsing (`lib/security/types.ts`)
- [x] T004 [S0103] Create the shared diagnostic rate-budget helper with per-capability keys, deterministic limit headers, and explicit error mapping (`lib/security/diagnostic-rate-limit.ts`)
- [x] T005 [S0103] [P] Write unit tests for the diagnostic rate-budget helper across repeated requests, reset windows, and isolated keys (`lib/security/diagnostic-rate-limit.test.ts`)
- [x] T006 [S0103] Harden direct provider probing to reject unsafe loopback, private-network, and malformed targets with timeout, retry-backoff, and failure-path handling (`lib/model-probe.ts`)
- [x] T007 [S0103] [P] Extend model probe tests for unsafe target rejection, CLI fallback, and timeout handling (`lib/model-probe.test.ts`)

---

## Implementation (9 tasks)

Apply route budgets, deterministic diagnostics, and bounded release behavior.

- [x] T008 [S0103] Tighten the middleware security-header floor with explicit policy coverage and deterministic rate-limit headers (`middleware.ts`, `middleware.test.ts`)
- [x] T009 [S0103] [P] Apply shared budgets to provider-probe routes with authorization enforced at the boundary closest to the resource and explicit 429 error mapping (`app/api/test-model/route.ts`, `app/api/test-bound-models/route.ts`)
- [x] T010 [S0103] [P] Apply shared budgets to session and DM diagnostics with authorization enforced at the boundary closest to the resource and failure-path handling before gateway work (`app/api/test-session/route.ts`, `app/api/test-sessions/route.ts`, `app/api/test-dm-sessions/route.ts`)
- [x] T011 [S0103] [P] Apply shared budgets to platform diagnostics with duplicate-trigger prevention while in-flight, timeout handling, and explicit dry-run or live-send result reporting (`app/api/test-platforms/route.ts`)
- [x] T012 [S0103] Rework alert diagnostics to replace random cron placeholders with deterministic runtime checks, preserve dry-run-first behavior, and keep live-send notifications explicit opt-in (`app/api/alerts/check/route.ts`)
- [x] T013 [S0103] [P] Apply shared budgets to alert-check and heavy analytics reads with bounded work entry and deterministic 429 responses (`app/api/alerts/check/route.ts`, `app/api/stats-all/route.ts`, `app/api/activity-heatmap/route.ts`)
- [x] T014 [S0103] Protect or remove force-refresh release checks so GitHub-backed version reads stay cached and bounded (`app/api/pixel-office/version/route.ts`, `app/pixel-office/page.tsx`)
- [x] T015 [S0103] Stop the background alert monitor from auto-running a full alert pipeline on mount, with cleanup on scope exit for all acquired resources (`app/alert-monitor.tsx`)
- [x] T016 [S0103] Keep alert and pixel-office operator surfaces explicit about dry-run, live-send, cached, and rate-limited states with platform-appropriate accessibility labels, focus management, and input support (`app/alerts/page.tsx`, `app/pixel-office/page.tsx`)

---

## Testing (4 tasks)

Regression coverage and verification evidence.

- [x] T017 [S0103] [P] Extend diagnostic route tests for rate-limit enforcement and unsafe target rejection on provider, session, DM, platform, and alert-check routes (`app/api/test-model/route.test.ts`, `app/api/test-bound-models/route.test.ts`, `app/api/test-session/route.test.ts`, `app/api/test-sessions/route.test.ts`, `app/api/test-dm-sessions/route.test.ts`, `app/api/test-platforms/route.test.ts`, `app/api/alerts/check/route.test.ts`)
- [x] T018 [S0103] [P] Create route tests for bounded analytics and release checks plus updated middleware headers (`app/api/stats-all/route.test.ts`, `app/api/activity-heatmap/route.test.ts`, `app/api/pixel-office/version/route.test.ts`, `middleware.test.ts`)
- [x] T019 [S0103] [P] Add component and page tests for non-immediate AlertMonitor behavior and explicit dry-run or rate-limited messaging on alert and pixel-office surfaces (`app/alert-monitor.test.tsx`, `app/alerts/page.test.tsx`, `app/pixel-office/page.test.tsx`)
- [x] T020 [S0103] Run focused Vitest coverage, verify ASCII encoding and LF line endings on touched files, manually exercise repeated diagnostics plus bounded release checks, and record outcomes (`.spec_system/specs/phase01-session03-abuse-resistance-and-deterministic-diagnostics/implementation-notes.md`)

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
