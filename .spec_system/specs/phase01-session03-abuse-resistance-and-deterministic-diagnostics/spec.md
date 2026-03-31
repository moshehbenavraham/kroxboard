# Session Specification

**Session ID**: `phase01-session03-abuse-resistance-and-deterministic-diagnostics`
**Phase**: 01 - Sensitive Route Hardening
**Status**: Not Started
**Created**: 2026-03-31

---

## 1. Session Overview

This session closes Phase 01 by hardening the abuse-prone diagnostic and
analytics paths that still sit on top of real provider credentials, platform
credentials, local runtime data, and third-party release APIs. Sessions 01 and
02 established path validation plus sensitive-route auth and origin
enforcement. Session 03 now needs to keep those routes bounded under repeated
operator use and hostile replay while preserving the dashboard's dry-run-first
maintenance workflow.

The main server targets are `app/api/test-model/route.ts`,
`app/api/test-bound-models/route.ts`, `app/api/test-session/route.ts`,
`app/api/test-sessions/route.ts`, `app/api/test-dm-sessions/route.ts`,
`app/api/test-platforms/route.ts`, `app/api/alerts/check/route.ts`,
`app/api/stats-all/route.ts`, `app/api/activity-heatmap/route.ts`, and
`app/api/pixel-office/version/route.ts`. Supporting work also lands in
`lib/model-probe.ts`, `middleware.ts`, and the client surfaces that still
trigger diagnostics automatically or expose force-refresh behavior.

This session directly targets SYN-08, SYN-09, SYN-12, SYN-14, SYN-23, and
SYN-25 while reducing the remaining abuse slice of SYN-13 and preserving the
explicit live-send contract from Phase 00. The goal is not to solve all
read-path performance work. The goal is to ensure that expensive or
side-effect-capable diagnostics become deterministic, rate-bounded, and
operator-intent driven before Phase 02 deepens runtime-boundary work.

---

## 2. Objectives

1. Add shared route-level rate budgets and deterministic 429 behavior to the
   abuse-prone diagnostic, analytics, and release-check endpoints.
2. Remove random cron alert behavior and other surprise diagnostics so alert
   checks behave deterministically and preserve dry-run-first semantics.
3. Bound direct provider and platform diagnostic paths so unsafe probe targets
   and repeated credential exercise cannot fan out without control.
4. Keep operator-facing diagnostics explicit about dry-run, live-send, cached,
   and rate-limited states instead of relying on ambiguous fallback behavior.

---

## 3. Prerequisites

### Required Sessions

- [x] `phase00-session01-auth-and-operator-elevation-foundation` - sensitive
  actions already have the operator identity and elevated-session baseline
- [x] `phase00-session02-secret-containment-and-token-free-operator-flows` -
  browser flows already keep gateway tokens out of client-visible payloads
- [x] `phase00-session03-safe-defaults-and-deployment-baseline` - dry-run and
  feature-flag defaults already exist for outbound diagnostics
- [x] `phase01-session01-route-boundary-validation` - shared path and request
  boundary helpers exist for diagnostic routes
- [x] `phase01-session02-sensitive-route-enforcement-and-operator-failure-states`
  - same-origin and auth enforcement already protect the sensitive routes in
  scope

### Required Tools/Knowledge

- Next.js App Router route handlers, middleware, and `NextResponse`
- TypeScript shared helper design for route-level security controls
- Existing OpenClaw gateway and provider probe behavior
- Vitest and React Testing Library for route, middleware, and client coverage

### Environment Requirements

- Root `.env` and `.env.example` remain the only source of truth for
  `ENABLE_OUTBOUND_TESTS`, `ENABLE_LIVE_SEND_DIAGNOSTICS`,
  `ENABLE_PROVIDER_PROBES`, and dashboard auth settings
- Localhost and Cloudflare Access deployments both remain supported access
  modes
- `OPENCLAW_HOME` and optional `GITHUB_TOKEN` remain server-only settings

---

## 4. Scope

### In Scope (MVP)

- Server can enforce explicit rate budgets on provider probes, session
  diagnostics, platform diagnostics, alert checks, high-cost analytics reads,
  and release-check refreshes
- Alert diagnostics can derive cron outcomes from deterministic runtime data
  instead of placeholder randomness and avoid automatic full-pipeline sends on
  mount
- Direct provider probing can reject unsafe network targets and fail or fall
  back safely before hitting local or private addresses
- Release-version checks can stay cached and bounded instead of allowing
  untrusted force-refresh amplification
- Operator-facing diagnostic flows can keep dry-run and live-send behavior
  explicit after the server-side hardening lands

### Out of Scope (Deferred)

- Full async read-path caching, concurrency controls, and file-size limits -
  *Reason: Phase 02 owns the deeper read-path and runtime-boundary work*
- Client-side local storage cleanup and residual browser polling cleanup
  outside alert diagnostics - *Reason: Phase 03 owns broader client cleanup*
- Final verification docs, findings closeout, and accepted-risk bookkeeping -
  *Reason: Phase 03 owns project closeout*
- Full in-app Cloudflare JWT validation - *Reason: deployment still relies on
  the existing Cloudflare Access boundary and operator session layer*

---

## 5. Technical Approach

### Architecture

Create `lib/security/diagnostic-rate-limit.ts` as the shared route-level
rate-budget helper for abuse-prone endpoints. The helper should derive a stable
key from the endpoint capability plus request identity, emit deterministic
limit metadata, and return a typed 429 payload before expensive provider,
platform, filesystem, or GitHub work begins. Route handlers should consume it
near the top of the request path after auth or origin enforcement where
applicable.

Extend `lib/model-probe.ts` so direct provider probes fail closed on unsafe
targets such as loopback, link-local, private-network, or malformed base URLs.
When a direct probe target is unsafe or missing required config, the helper
should return the existing safe fallback path instead of issuing an arbitrary
outbound fetch. This keeps alert checks and provider diagnostics from
amplifying self-SSRF-style traffic through attacker-controlled or
misconfigured provider settings.

Rework `app/api/alerts/check/route.ts`, `app/alert-monitor.tsx`, and the
release-check path so diagnostics become deterministic and explicit. Alert
checks should use real cron-store or runtime state rather than `Math.random`,
should preserve dry-run-first notification behavior, and should stop the
background monitor from auto-running a full alert pipeline on mount. The
pixel-office version endpoint should protect or remove the `force=1` bypass so
cached release reads stay bounded.

### Design Patterns

- Shared diagnostic budget helper: centralize rate-budget logic instead of
  repeating counters per route
- Fail closed on outbound targets: validate direct probe destinations before
  network calls
- Deterministic diagnostics: derive alert outcomes from runtime state, not
  placeholder randomness
- Explicit operator state separation: keep dry-run, live-send, cached, and
  rate-limited outcomes distinct in route payloads and UI messaging

### Technology Stack

- Next.js 16 route handlers and middleware
- React 19 client components for alert monitoring and pixel-office release UI
- TypeScript 5 helper modules and typed response contracts
- Vitest and React Testing Library for regression coverage
- Node standard library only; no new dependencies planned

---

## 6. Deliverables

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `lib/security/diagnostic-rate-limit.ts` | Shared per-capability rate-budget helper for diagnostic, analytics, and release-check routes | ~150 |
| `lib/security/diagnostic-rate-limit.test.ts` | Unit coverage for key derivation, budget windows, and typed 429 metadata | ~160 |
| `app/api/pixel-office/version/route.test.ts` | Regression coverage for cached version reads and bounded refresh behavior | ~120 |
| `app/api/stats-all/route.test.ts` | Regression coverage for stats-all rate limiting and cached success paths | ~120 |
| `app/api/activity-heatmap/route.test.ts` | Regression coverage for heatmap rate limiting and cached success paths | ~120 |
| `app/alert-monitor.test.tsx` | Component coverage for non-immediate alert checks and cleanup behavior | ~120 |

### Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `lib/security/types.ts` | Add typed rate-limit denial payload and metadata contracts | ~40 |
| `middleware.ts` | Tighten the security-header floor and keep baseline rate-limit headers explicit | ~40 |
| `middleware.test.ts` | Lock the updated response-header set and limit metadata | ~70 |
| `lib/model-probe.ts` | Reject unsafe direct probe targets and preserve safe fallback behavior | ~120 |
| `lib/model-probe.test.ts` | Cover unsafe target rejection, fallback, and timeout paths | ~120 |
| `app/api/test-model/route.ts` | Apply shared budgets before direct provider probes | ~30 |
| `app/api/test-bound-models/route.ts` | Apply shared budgets before batch provider probes | ~30 |
| `app/api/test-session/route.ts` | Apply shared budgets before single-session diagnostics | ~30 |
| `app/api/test-sessions/route.ts` | Apply shared budgets before batch session diagnostics | ~30 |
| `app/api/test-dm-sessions/route.ts` | Apply shared budgets before DM diagnostics | ~30 |
| `app/api/test-platforms/route.ts` | Apply shared budgets before platform credential checks and live sends | ~50 |
| `app/api/alerts/check/route.ts` | Add deterministic cron handling, bounded alert checks, and explicit dry-run behavior | ~140 |
| `app/api/alerts/check/route.test.ts` | Cover deterministic cron behavior, rate limiting, and dry-run or live-send results | ~140 |
| `app/api/test-model/route.test.ts` | Add probe-route rate-limit and unsafe-target regressions | ~80 |
| `app/api/test-bound-models/route.test.ts` | Add batch probe route rate-limit regressions | ~80 |
| `app/api/test-session/route.test.ts` | Add session diagnostic rate-limit regressions | ~80 |
| `app/api/test-sessions/route.test.ts` | Add batch session diagnostic rate-limit regressions | ~80 |
| `app/api/test-dm-sessions/route.test.ts` | Add DM diagnostic rate-limit regressions | ~80 |
| `app/api/test-platforms/route.test.ts` | Add platform diagnostic rate-limit and dry-run regressions | ~100 |
| `app/api/stats-all/route.ts` | Add route-level rate limits ahead of heavy analytics aggregation | ~40 |
| `app/api/activity-heatmap/route.ts` | Add route-level rate limits ahead of heavy heatmap scans | ~40 |
| `app/api/pixel-office/version/route.ts` | Protect or remove force-refresh behavior and keep GitHub release checks cached | ~50 |
| `app/pixel-office/page.tsx` | Align release refresh UI with the bounded version endpoint behavior | ~40 |
| `app/pixel-office/page.test.tsx` | Update release-refresh expectations after the bounded endpoint change | ~60 |
| `app/alert-monitor.tsx` | Stop auto-running full alert checks on mount and keep timer cleanup explicit | ~40 |
| `app/alerts/page.tsx` | Keep manual alert checks explicit about dry-run, live-send, and rate-limited states | ~40 |
| `app/alerts/page.test.tsx` | Cover explicit rate-limited and dry-run alert-check messaging | ~80 |

---

## 7. Success Criteria

### Functional Requirements

- [ ] Provider probe, session diagnostic, platform diagnostic, alert-check,
      stats-all, activity-heatmap, and release-check endpoints enforce
      explicit route budgets and return deterministic 429 responses when
      exceeded
- [ ] Alert checks no longer use random cron placeholders and do not send
      surprise notifications outside the existing live-send opt-in path
- [ ] Direct provider probes reject unsafe loopback, private-network, or
      malformed targets before outbound fetches begin
- [ ] Pixel-office release checks no longer allow unbounded force-refresh
      behavior against GitHub
- [ ] Background alert monitoring no longer launches a full alert check
      automatically on mount

### Testing Requirements

- [ ] Unit tests cover route-budget keying, window resets, and unsafe direct
      probe target handling
- [ ] Route tests prove representative diagnostics and analytics endpoints
      return 429 with stable metadata after repeated requests
- [ ] Route tests prove alert cron behavior is deterministic and dry-run or
      live-send modes remain explicit
- [ ] Component or page tests prove AlertMonitor does not auto-run on mount and
      alert or version UI stays explicit about bounded behavior
- [ ] Manual testing confirms same-origin dashboard diagnostics still work
      under dry-run mode and surface clear feedback when rate limits apply

### Non-Functional Requirements

- [ ] No touched route leaks raw provider base URLs, local network details, or
      internal filesystem paths in client-facing errors
- [ ] The added route budgets are centralized and configurable enough to avoid
      ad hoc per-route counters
- [ ] Tightened security headers remain compatible with the current dashboard
      shell and operator flows

### Quality Gates

- [ ] All files ASCII-encoded
- [ ] Unix LF line endings
- [ ] Code follows project conventions

---

## 8. Implementation Notes

### Key Considerations

- Route-level budgets should complement the existing middleware baseline, not
  replace it; expensive diagnostics still need their own early-exit guard
- Sensitive POST diagnostics should stay behind the Session 02 auth and
  same-origin layer before the rate budget is consumed
- Removing the version-route force refresh must preserve a useful pixel-office
  release panel instead of leaving the UI in a permanent failure state
- Deterministic cron checks should read runtime data that already exists today;
  do not invent a new persistence system in this session

### Potential Challenges

- In-memory rate limits are approximate across processes, so the helper should
  be explicit about its scope while still reducing local abuse immediately
- Some custom provider configs may depend on direct probe URLs; the unsafe
  target guard must fail safely without breaking the CLI fallback path
- Alert-monitor changes can accidentally silence expected operator feedback if
  manual and scheduled checks do not stay clearly separated

### Relevant Considerations

- [P01] **30 audit findings remain open**: prioritize the high-severity abuse
  and diagnostics findings that this session is explicitly mapped to close
- [P02] **Security headers and CSP still need tightening**: expand the header
  floor carefully without breaking the current UI shell
- [P02] **Client polling still needs auth-aware backoff**: keep AlertMonitor
  bounded and explicit even if broader polling cleanup lands later
- [P00] **Dry-run-first diagnostics**: preserve operator-visible dry-run
  messaging so rate limits and disabled states do not look like send failures
- [P00] **Shared server-side route guards**: reuse centralized helpers instead
  of route-local rate-limit logic
- [P01] **GitHub release checks can still hit rate limits**: the pixel-office
  version path must stay cached and bounded

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session's deliverables:

- Rate-limited diagnostics could surface as generic failures if 429 payloads
  are not typed and explicit
- Dry-run and live-send modes could become ambiguous if alert and platform
  diagnostics lose their existing metadata contract
- Removing automatic alert checks or force refreshes could confuse operators if
  cached or manual-refresh states are not communicated clearly

---

## 9. Testing Strategy

### Unit Tests

- Validate diagnostic route-budget keying, window resets, and limit headers in
  `lib/security/diagnostic-rate-limit.ts`
- Validate unsafe direct probe target rejection and CLI fallback behavior in
  `lib/model-probe.ts`
- Validate updated middleware header behavior in `middleware.ts`

### Integration Tests

- Verify representative POST diagnostics return 429 before provider, platform,
  or gateway work on test-model, test-bound-models, test-session,
  test-sessions, test-dm-sessions, test-platforms, and alerts/check routes
- Verify representative heavy GET routes return cached success responses and
  deterministic 429s on repeated load for stats-all, activity-heatmap, and
  pixel-office version reads
- Verify alert-check cron behavior is deterministic and does not rely on
  random placeholder sends

### Manual Testing

- Run provider probes, session diagnostics, platform diagnostics, and manual
  alert checks from the dashboard with valid same-origin operator access and
  confirm dry-run behavior remains explicit
- Repeat those diagnostics rapidly and confirm operator-visible rate-limit
  messaging appears without raw internal details
- Open pixel office, load version info, and confirm repeated refresh attempts
  stay bounded and still show cached release data

### Edge Cases

- Repeated requests from the same operator session versus different IPs
- Direct provider configs that point at loopback, private-network, or malformed
  hosts
- Alert rules with missing cron data, no DM session, or disabled live-send
  flags
- Empty analytics directories and cached-release fallback after upstream GitHub
  failures

---

## 10. Dependencies

### External Libraries

- No new dependencies planned; use existing Next.js, React, Vitest, and Node
  standard library capabilities

### Internal Dependencies

- `lib/security/sensitive-mutation.ts` for the existing auth and origin floor
- `lib/security/feature-flags.ts` for dry-run and live-send gating
- `lib/model-probe.ts` and `lib/session-test-fallback.ts` for existing
  diagnostic execution paths
- `app/alert-monitor.tsx` and `app/alerts/page.tsx` for operator-visible alert
  behavior
- `app/api/pixel-office/version/route.ts` and `app/pixel-office/page.tsx` for
  release-check behavior

### Other Sessions

- **Depends on**:
  - `phase00-session01-auth-and-operator-elevation-foundation`
  - `phase00-session02-secret-containment-and-token-free-operator-flows`
  - `phase00-session03-safe-defaults-and-deployment-baseline`
  - `phase01-session01-route-boundary-validation`
  - `phase01-session02-sensitive-route-enforcement-and-operator-failure-states`
- **Depended by**:
  - `phase02-session01-payload-validation-and-write-path-safety`
  - `phase02-session03-async-cached-sanitized-read-paths`

---

## Next Steps

Run the implement workflow step to begin AI-led implementation.
