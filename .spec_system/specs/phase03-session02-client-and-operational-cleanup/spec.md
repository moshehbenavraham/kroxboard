# Session Specification

**Session ID**: `phase03-session02-client-and-operational-cleanup`
**Phase**: 03 - Residual Risk Cleanup and Closeout
**Status**: Complete
**Created**: 2026-03-31

---

## 1. Session Overview

This session moves the Phase 03 closeout work from low-level runtime
integrity up to the browser and operator workflow layer. The remaining
cleanup is now concentrated in unbounded browser state, duplicated or
always-on client polling, incomplete response-header coverage, and
browser-visible operational detail that is still broader than the dashboard
needs. The highest-value code paths are `app/page.tsx`,
`app/models/page.tsx`, `app/sessions/page.tsx`,
`app/pixel-office/page.tsx`, `app/alert-monitor.tsx`,
`app/alerts/page.tsx`, `app/gateway-status.tsx`, `app/sidebar.tsx`,
`middleware.ts`, `app/api/gateway-health/route.ts`,
`app/api/pixel-office/version/route.ts`, and
`app/api/alerts/check/route.ts`.

The technical goal is to centralize bounded client persistence and shared
polling so the dashboard no longer restores stale diagnostic state forever
or stacks background probes across visible and hidden surfaces. The same
session also needs to make destructive Pixel Office actions explicit,
remove noisy alert-diagnostic logging, and finish the remaining
closeout-safe security-header tightening without breaking normal operator
workflows.

This is the natural next session because `phase03-session01` already
resolved the runtime integrity issues that these browser surfaces depend on,
while `phase03-session03` is explicitly blocked on both Session 01 and
Session 02 completing first. Finishing this session should leave the
project with one final objective: collect verification evidence, reconcile
docs, and disposition any accepted or deferred residual risk during closeout.

---

## 2. Objectives

1. Introduce shared client-side persistence helpers that cap or expire
   stored diagnostic state before pages restore it.
2. Consolidate recurring alert and gateway-health monitors behind bounded,
   visibility-aware polling that fails safely when elevation or network
   state does not allow work.
3. Add explicit confirmation and safer pending or reset behavior for
   destructive Pixel Office edit actions.
4. Tighten remaining browser-visible operational telemetry, logging, and
   security-header behavior with regression coverage across client and route
   surfaces.

---

## 3. Prerequisites

### Required Sessions

- [x] `phase03-session01-state-cache-and-environment-hardening` - runtime
  path, cache, and write-safety fixes are already in place, so this session
  can focus on client and operator behavior
- [x] `phase02-session03-async-cached-sanitized-read-paths` - bounded read
  helpers and sanitized failure patterns should remain the default on any
  touched read surface
- [x] `phase01-session03-abuse-resistance-and-deterministic-diagnostics` -
  existing diagnostic rate limits and the current header baseline must be
  preserved while cleanup lands
- [x] `phase00-session02-secret-containment-and-token-free-operator-flows`
  - browser-visible response trimming and server-only secret boundaries must
  remain intact during closeout cleanup

### Required Tools/Knowledge

- Current `localStorage` usage across overview, models, sessions, and
  Pixel Office pages
- Existing operator-elevation and protected-request banner patterns
- Current alert-monitor, alert scheduling, and gateway-health polling flows
- Middleware CSP and security-header expectations plus current tests
- Pixel Office editor keyboard, toolbar, and destructive-action flows

### Environment Requirements

- Browser or jsdom test environment with `localStorage`, timers, and dialog
  interactions available
- Representative `OPENCLAW_HOME` plus operator auth env values for manual
  alert, gateway, and Pixel Office smoke tests
- No new package dependencies are required; stay on existing platform APIs
  and project utilities

---

## 4. Scope

### In Scope (MVP)

- Operator can restore dashboard diagnostic state from bounded browser
  storage that prunes expired, oversize, or malformed entries before render
- Browser can run alert and gateway-health monitors through shared bounded
  polling that pauses when hidden, avoids duplicate in-flight work, and
  respects operator-elevation requirements
- Operator can confirm Pixel Office reset and delete actions before layout
  state changes and receive explicit cancelled or pending states
- Browser-visible operational routes can return only the fields the current
  UI needs, while keeping failures stable and operator-safe
- Middleware can emit the remaining closeout-safe security headers and CSP
  directives required by the hardened deployment model

### Out of Scope (Deferred)

- Runtime file persistence, cache cloning, or OpenClaw root validation -
  *Reason: Session 03-01 already owns the remaining low-level runtime
  integrity fixes*
- Final validation matrix execution, documentation reconciliation, and
  residual-risk disposition notes - *Reason: Session 03-03 owns project
  closeout evidence and docs alignment*
- New dashboard feature work or UI redesign unrelated to the audit backlog -
  *Reason: keep the session focused on residual client and operational risk*
- Full cross-tab leader election or service-worker polling coordination -
  *Reason: useful later, but too large for this 2-4 hour closeout session*

---

## 5. Technical Approach

### Architecture

Create a shared `lib/client-persistence.ts` module that wraps JSON browser
storage in bounded envelopes with timestamps, expiry, and entry pruning.
`app/page.tsx`, `app/models/page.tsx`, `app/sessions/page.tsx`, and the
diagnostic cache reads inside `app/pixel-office/page.tsx` should depend on
that helper instead of open-coding `localStorage` reads, raw `JSON.parse`,
and indefinite retention. Small stable preferences such as locale and theme
can stay on their existing simple storage paths unless the cleanup work
shows they need the bounded helper too.

Create a shared `lib/client-polling.ts` module for visibility-aware timers,
in-flight dedupe, bounded retry or backoff, and cleanup on unmount. Use it
to replace page-local interval code in `app/alert-monitor.tsx`,
`app/alerts/page.tsx`, `app/gateway-status.tsx`, and the sidebar or Pixel
Office gateway-health consumers that currently create repeated standalone
pollers. The helper should fail safely when operator elevation is missing or
the document is hidden, instead of continuing background work blindly.

Add a reusable confirmation dialog component for destructive Pixel Office
actions and wire it into both toolbar and keyboard entry points. On the
server side, tighten `middleware.ts`, trim `gateway-health` and release
payloads to operator-needed fields only, and replace verbose alert
diagnostic `console.log` traces with minimal server-safe logging that keeps
browser-visible failures stable.

### Design Patterns

- Shared bounded persistence wrapper: centralize TTL, pruning, and
  corrupt-state recovery once
- Visibility-aware poll scheduler: keep background work off hidden or
  unauthorized surfaces
- Explicit confirmation boundary: require a second intentional action before
  destructive layout changes
- Thin UI consumers: page components compose shared helpers instead of
  open-coding timers and storage parsing
- Stable sanitized telemetry contracts: route payloads expose only
  operator-needed detail and predictable failures

### Technology Stack

- Next.js 16 client components and route handlers
- React 19 state and effect patterns already used in the repo
- Browser `localStorage`, `AbortController`, and `document.visibilityState`
- Existing operator-elevation, banner, and diagnostic rate-limit utilities
- Vitest and Testing Library for client and route regression coverage

---

## 6. Deliverables

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `lib/client-persistence.ts` | Shared bounded browser-storage helpers for diagnostic and operational state | ~140 |
| `lib/client-persistence.test.ts` | Regression coverage for expiry, pruning, and malformed payload cleanup | ~110 |
| `lib/client-polling.ts` | Shared visibility-aware polling helpers with dedupe, cleanup, and bounded backoff | ~140 |
| `lib/client-polling.test.ts` | Tests for hidden-tab pause, dedupe, and retry reset semantics | ~110 |
| `app/components/confirm-action-dialog.tsx` | Reusable confirmation modal for destructive operator actions | ~100 |

### Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `app/page.tsx` | Move overview diagnostic cache restore and save paths onto the bounded client-persistence helper | ~90 |
| `app/models/page.tsx` | Bound model diagnostic cache retention and stale-state restore behavior | ~50 |
| `app/sessions/page.tsx` | Bound session diagnostic cache retention and stale-state restore behavior | ~50 |
| `app/pixel-office/page.tsx` | Bound cached diagnostics and sound settings, add confirmation-dialog state, and reuse shared polling | ~180 |
| `app/pixel-office/components/EditActionBar.tsx` | Route reset requests through explicit confirmation affordances | ~30 |
| `app/pixel-office/components/EditorToolbar.tsx` | Route delete requests through explicit confirmation affordances | ~30 |
| `app/alert-monitor.tsx` | Replace standalone interval logic with shared bounded polling and quiet failure handling | ~60 |
| `app/alerts/page.tsx` | Rework scheduled checks to use shared bounded polling and explicit disabled-state handling | ~70 |
| `app/gateway-status.tsx` | Reuse shared bounded gateway-health polling instead of a page-local timer | ~50 |
| `app/sidebar.tsx` | Reduce repeated standalone gateway-health polling on mobile and sidebar surfaces | ~50 |
| `middleware.ts` | Tighten remaining closeout-safe security headers and CSP behavior | ~50 |
| `app/api/gateway-health/route.ts` | Trim browser-visible telemetry to required fields and keep failures stable | ~70 |
| `app/api/pixel-office/version/route.ts` | Keep cached release fallback explicit while trimming unnecessary operational detail | ~40 |
| `app/api/alerts/check/route.ts` | Remove noisy alert-diagnostic console logging and preserve server-safe failures | ~60 |
| `app/page.test.tsx`, `app/models/page.test.tsx`, `app/sessions/page.test.tsx`, `app/alert-monitor.test.tsx`, `app/alerts/page.test.tsx`, `app/pixel-office/page.test.tsx`, `middleware.test.ts`, `app/api/gateway-health/route.test.ts`, `app/api/pixel-office/version/route.test.ts`, `app/api/alerts/check/route.test.ts` | Add regression coverage for storage bounds, polling, confirmations, headers, and sanitized telemetry | ~280 |

---

## 7. Success Criteria

### Functional Requirements

- [ ] Diagnostic result caches prune expired or oversize browser state
      before any page restores it
- [ ] Alert and gateway monitors stop duplicate or hidden-tab polling and
      keep operator-safe failure states
- [ ] Pixel Office reset and delete actions require explicit confirmation
      before mutating layout state
- [ ] `gateway-health` and release-check routes return only the fields
      required by current UI consumers
- [ ] Alert diagnostics no longer emit noisy per-request console traces or
      browser-visible operational detail beyond current UI needs

### Testing Requirements

- [ ] Unit tests cover client persistence expiry or pruning and polling
      dedupe or backoff behavior
- [ ] Client tests cover cached restore, hidden-tab behavior, and Pixel
      Office confirmation flows
- [ ] Route and middleware tests cover tightened headers and sanitized
      health, version, and logging behavior
- [ ] Manual testing covers overview, alerts, and Pixel Office flows with
      and without operator elevation

### Non-Functional Requirements

- [ ] No new package dependencies are added
- [ ] Browser-visible state remains bounded and deterministic across reloads
- [ ] Background polling tears down cleanly on unmount or loss of
      eligibility
- [ ] Security-header changes remain compatible with the current Next.js
      operator UI

### Quality Gates

- [ ] All files ASCII-encoded
- [ ] Unix LF line endings
- [ ] Code follows project conventions

---

## 8. Implementation Notes

### Key Considerations

- Direct `localStorage` access is duplicated across overview, models,
  sessions, and Pixel Office; the fix should land in one shared helper
  instead of page-local copy or paste
- Gateway health is polled by multiple surfaces with separate timers; the
  cleanup should reduce duplicate work without breaking the live status UI
- Pixel Office destructive actions currently mutate layout immediately from
  both toolbar and keyboard entry points; confirmation needs to cover both
  paths
- Route payload trimming must preserve actively used fields such as
  `status`, `checkedAt`, `responseMs`, `openclawVersion`, `launchPath`,
  `tag`, `name`, `publishedAt`, `htmlUrl`, and explicit cache metadata

### Potential Challenges

- A generic storage helper must bound large diagnostic maps without silently
  dropping fresh entries operators still expect
- Shared polling must not create stale closures or double fire when
  components mount, unmount, or regain visibility quickly
- Header tightening can break embedded assets or local dev workflows if CSP
  changes are too aggressive

### Relevant Considerations

- [P03] **Browser storage needs retention limits**: bound diagnostic and
  operator-state retention instead of storing unbounded JSON forever
- [P03] **Security headers are still incomplete**: finish the remaining
  closeout-safe middleware tightening while preserving current UI behavior
- [P03] **Read-heavy routes must keep bounded budgets**: client polling
  changes must avoid reintroducing bursty duplicate traffic
- [P02] **Stable sanitized failure contracts**: browser-visible route errors
  should stay fixed and operator-safe
- [P00] **Auto-polling on page load without auth gates**: do not continue
  background diagnostics when the user lacks elevation or the surface is not
  eligible

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session's deliverables:

- Restoring stale or corrupted browser state can show operators outdated
  diagnostics or break page initialization
- Independent timers across surfaces can multiply gateway and alert traffic,
  especially when tabs are hidden or reopened
- Pixel Office destructive actions can remove or reset layout state too
  quickly for operators to recover from accidental input

---

## 9. Testing Strategy

### Unit Tests

- Cover browser-state expiry, capped pruning, and malformed payload cleanup
  in `lib/client-persistence.test.ts`
- Cover hidden-tab pause, in-flight dedupe, and retry reset behavior in
  `lib/client-polling.test.ts`

### Integration Tests

- Cover bounded browser-state restore on overview, model, and session pages
  in `app/page.test.tsx`, `app/models/page.test.tsx`, and
  `app/sessions/page.test.tsx`
- Cover bounded alert scheduling and quiet background failure handling in
  `app/alert-monitor.test.tsx` and `app/alerts/page.test.tsx`
- Cover Pixel Office confirmation flows and bounded cached restore behavior
  in `app/pixel-office/page.test.tsx`
- Cover tightened headers and sanitized health or release payloads in
  `middleware.test.ts`, `app/api/gateway-health/route.test.ts`,
  `app/api/pixel-office/version/route.test.ts`, and
  `app/api/alerts/check/route.test.ts`

### Manual Testing

- Reload overview, models, sessions, and Pixel Office after stale or cleared
  client state and confirm the pages recover cleanly
- Open alerts and gateway-health surfaces in multiple tabs, hide and restore
  tabs, and confirm polling stays bounded
- Trigger Pixel Office delete and reset flows from both keyboard and toolbar
  interactions and confirm the dialog states are explicit

### Edge Cases

- Malformed or over-budget browser-storage payloads
- Document visibility flips during an in-flight poll
- Operator elevation expires while alert polling or manual alert scheduling
  is active
- Confirmation dialog reopened after cancel should reset pending state and
  focus
- Gateway or GitHub failures while cached fallback data still exists

---

## 10. Dependencies

### External Libraries

- None new; stay on existing platform APIs and project utilities

### Other Sessions

- **Depends on**:
  `phase00-session02-secret-containment-and-token-free-operator-flows`,
  `phase01-session03-abuse-resistance-and-deterministic-diagnostics`,
  `phase02-session03-async-cached-sanitized-read-paths`,
  `phase03-session01-state-cache-and-environment-hardening`
- **Depended by**:
  `phase03-session03-verification-and-closeout`

---

## Next Steps

Run the `implement` workflow step to begin AI-led implementation.
