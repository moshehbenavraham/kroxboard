# Task Checklist

**Session ID**: `phase03-session02-client-and-operational-cleanup`
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
| Setup | 3 | 3 | 0 |
| Foundation | 5 | 5 | 0 |
| Implementation | 9 | 9 | 0 |
| Testing | 5 | 5 | 0 |
| **Total** | **22** | **22** | **0** |

---

## Setup (3 tasks)

Map findings, budgets, and compatibility constraints before code changes
begin.

- [x] T001 [S0302] Verify SYN-12, SYN-14, SYN-32, SYN-33, and SYN-35
      against the current client storage, polling, and telemetry surfaces in
      implementation notes
      (`.spec_system/specs/phase03-session02-client-and-operational-cleanup/implementation-notes.md`)
- [x] T002 [S0302] Define browser-storage retention budgets, polling
      ceilings, confirmation UX acceptance criteria, and operator-safe
      banner behavior in implementation notes
      (`.spec_system/specs/phase03-session02-client-and-operational-cleanup/implementation-notes.md`)
- [x] T003 [S0302] Record route response-shape compatibility rules, deferred
      cleanup boundaries, and the manual validation matrix for overview,
      alerts, and Pixel Office flows
      (`.spec_system/specs/phase03-session02-client-and-operational-cleanup/implementation-notes.md`)

---

## Foundation (5 tasks)

Create the shared client helpers and confirmation primitives that the
touched surfaces will reuse.

- [x] T004 [S0302] Create bounded browser-storage helpers for expiring JSON
      envelopes, capped entry maps, and malformed-state cleanup with state
      reset or revalidation on re-entry (`lib/client-persistence.ts`)
- [x] T005 [S0302] [P] Add browser-storage tests for TTL expiry, capped
      pruning, and malformed payload discard
      (`lib/client-persistence.test.ts`)
- [x] T006 [S0302] Create shared client polling helpers for visibility-aware
      timers, in-flight dedupe, and bounded retry or backoff with cleanup on
      scope exit for all acquired resources (`lib/client-polling.ts`)
- [x] T007 [S0302] [P] Add polling tests for hidden-tab pause, backoff
      reset, and duplicate-subscription behavior
      (`lib/client-polling.test.ts`)
- [x] T008 [S0302] [P] Create a reusable confirmation dialog for destructive
      operator actions with platform-appropriate accessibility labels, focus
      management, and state reset on close
      (`app/components/confirm-action-dialog.tsx`)

---

## Implementation (9 tasks)

Move the remaining client and operational surfaces onto the shared bounded
primitives.

- [x] T009 [S0302] Refactor overview diagnostic caches to use bounded client
      persistence and discard stale or malformed entries on restore
      (`app/page.tsx`)
- [x] T010 [S0302] [P] Refactor model diagnostics persistence to use bounded
      client storage and stale-entry pruning on re-entry
      (`app/models/page.tsx`)
- [x] T011 [S0302] [P] Refactor session diagnostics persistence to use
      bounded client storage and stale-entry pruning on re-entry
      (`app/sessions/page.tsx`)
- [x] T012 [S0302] Refactor Pixel Office cached diagnostics and sound
      settings to use bounded storage with explicit revalidation on agent
      re-entry (`app/pixel-office/page.tsx`)
- [x] T013 [S0302] Refactor the background alert monitor to use shared
      bounded polling with cleanup on scope exit, hidden-tab pause, and
      duplicate-trigger prevention while in-flight
      (`app/alert-monitor.tsx`)
- [x] T014 [S0302] Refactor alert-page scheduling to use shared bounded
      polling with denied, expired, and recovered operator-session handling
      (`app/alerts/page.tsx`)
- [x] T015 [S0302] Refactor gateway-health client surfaces to reuse shared
      bounded polling and reduce repeated standalone probes
      (`app/gateway-status.tsx`, `app/sidebar.tsx`)
- [x] T016 [S0302] Add explicit confirmation flows for Pixel Office reset
      and delete actions with keyboard support, focus management, and state
      reset on close (`app/pixel-office/page.tsx`,
      `app/pixel-office/components/EditActionBar.tsx`,
      `app/pixel-office/components/EditorToolbar.tsx`)
- [x] T017 [S0302] Tighten closeout-safe operational telemetry by updating
      middleware headers, sanitizing health and release payloads, and
      removing noisy alert diagnostic logs (`middleware.ts`,
      `app/api/gateway-health/route.ts`,
      `app/api/pixel-office/version/route.ts`,
      `app/api/alerts/check/route.ts`)

---

## Testing (5 tasks)

Regression coverage and verification evidence for the cleaned-up closeout
surfaces.

- [x] T018 [S0302] [P] Extend overview, model, and session page tests for
      bounded local-storage restore and stale-state pruning
      (`app/page.test.tsx`, `app/models/page.test.tsx`,
      `app/sessions/page.test.tsx`)
- [x] T019 [S0302] [P] Extend alert and gateway client tests for shared
      polling, hidden-tab behavior, and operator-safe failure handling
      (`app/alert-monitor.test.tsx`, `app/alerts/page.test.tsx`)
- [x] T020 [S0302] [P] Extend Pixel Office tests for confirmation flows,
      bounded cached-state restore, and safe operator banners
      (`app/pixel-office/page.test.tsx`)
- [x] T021 [S0302] [P] Extend middleware and route tests for tightened
      headers, sanitized health or release payloads, and reduced alert
      logging (`middleware.test.ts`, `app/api/gateway-health/route.test.ts`,
      `app/api/pixel-office/version/route.test.ts`,
      `app/api/alerts/check/route.test.ts`)
- [x] T022 [S0302] Run focused Vitest coverage, verify ASCII and LF on
      touched files, and manually smoke-test dashboard polling, alerts, and
      Pixel Office edit flows
      (`.spec_system/specs/phase03-session02-client-and-operational-cleanup/implementation-notes.md`)

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

Run the `validate` workflow step to verify session completeness.
