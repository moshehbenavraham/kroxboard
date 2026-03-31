# Session Specification

**Session ID**: `phase00-session03-safe-defaults-and-deployment-baseline`
**Phase**: 00 - Foundation
**Status**: Not Started
**Created**: 2026-03-31

---

## 1. Session Overview

Sessions 00-01 and 00-02 established the operator auth boundary and removed
browser-visible gateway secrets, but the secure-default layer is still
incomplete. Sensitive routes currently rely mostly on auth alone, the codebase
does not yet enforce the documented `ENABLE_*` env flags, several diagnostic
handlers still expose `GET` aliases for side effects, and `Dockerfile` still
defaults to `0.0.0.0` instead of the documented loopback-only origin.

This session closes the remaining Phase 00 baseline gap by introducing
server-only feature-flag enforcement for mutations, provider probes, and
outbound diagnostics; removing `GET` aliases from side-effect routes; and
making dry-run the default mode for any diagnostic that could send real
messages unless live-send behavior is explicitly enabled. The work should fail
closed without degrading the read-only monitoring value of the dashboard.

The output of this session is the secure-default contract that later phases
build on. Phase 01 can then focus on route-boundary validation, origin
enforcement, rate limits, and abuse resistance without preserving unsafe
defaults or ambiguous deployment guidance.

---

## 2. Objectives

1. Centralize server-only parsing and enforcement of the documented
   `ENABLE_*` flags for every Phase 00 mutation, probe, and outbound diagnostic
   route.
2. Remove `GET` aliases from side-effect and diagnostic handlers so
   `GET` requests return `405 Method Not Allowed`.
3. Default outbound diagnostics to dry-run behavior unless live-send is
   explicitly enabled, and expose clear operator-visible mode and disabled
   states.
4. Align `.env.example`, Docker, README, and deployment docs with the intended
   loopback-only and Cloudflare Access deployment baseline.

---

## 3. Prerequisites

### Required Sessions

- [x] `phase00-session01-auth-and-operator-elevation-foundation` - provides
      the shared operator auth boundary for sensitive routes
- [x] `phase00-session02-secret-containment-and-token-free-operator-flows` -
      keeps gateway credentials server-side before secure defaults are tightened

### Required Tools/Knowledge

- Next.js 16 App Router route-handler behavior for unimplemented methods
- Existing `requireSensitiveRouteAccess` and operator auth response helpers
- TypeScript response-contract changes across API and client surfaces
- Vitest route and unit test patterns already used in `app/api/` and `lib/`

### Environment Requirements

- Root `.env` auth settings from Session 00-01 remain available locally
- Current diagnostic and write routes remain reproducible for baseline checks
- Docker, README, and deployment docs are present for secure-default alignment

---

## 4. Scope

### In Scope (MVP)

- Operator can keep model mutations, alert writes, pixel-office layout writes,
  provider probes, and outbound diagnostics disabled by default via server-only
  env flags
- Operator can run diagnostic checks in dry-run mode when live-send behavior is
  disabled, without sending real platform messages
- Server can reject side-effect `GET` requests by removing unsafe handler
  aliases
- Maintainer can follow deployment and env guidance that keeps the origin bound
  to loopback and documents Cloudflare Access plus Tunnel as the standard
  non-local path

### Out of Scope (Deferred)

- Origin validation, CSRF protection, and route-boundary input validation -
  Reason: planned for Phase 01 Sessions 01 and 02
- Rate limits, security headers, alert self-SSRF cleanup, and deterministic
  alert diagnostics - Reason: planned for Phase 01 Session 03
- Payload schema validation for write routes - Reason: planned for Phase 02
  Session 01
- Read-path caching, async filesystem conversion, and heavy endpoint hardening -
  Reason: planned for Phase 02 Session 03

---

## 5. Technical Approach

### Architecture

Introduce a shared server-only feature-flag helper under `lib/security/` that
parses the documented `ENABLE_*` contract and provides deterministic disabled
responses for sensitive capabilities. Sensitive routes should continue to use
the existing auth guard, then enforce the specific feature flag closest to the
write, provider probe, or outbound action they protect.

Split diagnostics by impact. Model and bound-model probes should require the
provider-probe flag. Session and platform diagnostics should require the
outbound-tests flag. Any route that can send a real external message should
also check the live-send diagnostics flag and otherwise execute only dry-run or
reachability logic. The response contract should make the current mode explicit
so the operator UI can explain whether the route was disabled, dry-run, or
live-send.

Remove `GET` exports from side-effect handlers so Next.js returns framework
`405` responses automatically. Update the affected operator pages to surface
disabled and dry-run states clearly, then align Docker, README, and deployment
docs with the same secure-default contract and loopback binding baseline.

### Design Patterns

- Centralized `requireFeatureFlag` guard: one capability map and one disabled
  response contract reused across routes
- Dry-run-first diagnostics: prove readiness without sending real messages
  unless live-send is explicitly enabled
- Thin route handlers: keep flag parsing and response shaping in shared helpers
  instead of duplicating env logic per route
- Docs-as-configuration: keep `.env.example`, Docker defaults, and deployment
  guides synchronized with the runtime behavior they describe

### Technology Stack

- Next.js 16 route handlers and framework method handling
- Existing `lib/security/sensitive-route.ts` operator auth guard
- TypeScript 5 shared response contracts and client parsing helpers
- Vitest route and unit tests
- No new dependency expected; prefer existing platform APIs

---

## 6. Deliverables

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `lib/security/feature-flags.ts` | Parse server-only capability flags and emit shared disabled responses | ~130 |
| `lib/security/feature-flags.test.ts` | Unit coverage for flag parsing and capability enforcement | ~120 |
| `app/api/pixel-office/layout/route.test.ts` | Regression tests for write gating while preserving read-only layout fetches | ~120 |
| `app/api/test-model/route.test.ts` | Route coverage for provider-probe gating | ~120 |
| `app/api/test-bound-models/route.test.ts` | Route coverage for provider-probe gating and GET 405 behavior | ~140 |
| `app/api/test-session/route.test.ts` | Route coverage for outbound-test gating on single-session diagnostics | ~120 |
| `app/api/test-sessions/route.test.ts` | Route coverage for outbound-test gating and GET 405 behavior | ~140 |
| `app/api/test-dm-sessions/route.test.ts` | Route coverage for DM diagnostic gating and GET 405 behavior | ~140 |
| `app/api/test-platforms/route.test.ts` | Route coverage for dry-run vs live-send diagnostics and GET 405 behavior | ~180 |
| `app/api/alerts/check/route.test.ts` | Route coverage for dry-run alert checks and live-send gating | ~160 |

### Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `lib/security/types.ts` | Add feature-disabled and diagnostic-mode response metadata | ~40 |
| `lib/operator-elevation-client.ts` | Parse and surface feature-disabled and dry-run responses cleanly | ~50 |
| `lib/operator-elevation-client.test.ts` | Verify the new protected-response parsing paths | ~60 |
| `app/api/config/agent-model/route.ts` | Enforce `ENABLE_MODEL_MUTATIONS` before gateway writes | ~30 |
| `app/api/alerts/route.ts` | Enforce `ENABLE_ALERT_WRITES` on write methods while keeping read-only GET | ~40 |
| `app/api/config/agent-model/route.test.ts` | Extend coverage for disabled write behavior | ~40 |
| `app/api/alerts/route.test.ts` | Extend coverage for disabled write behavior | ~50 |
| `app/api/pixel-office/layout/route.ts` | Enforce `ENABLE_PIXEL_OFFICE_WRITES` on layout saves | ~35 |
| `app/api/test-model/route.ts` | Enforce `ENABLE_PROVIDER_PROBES` on single-model diagnostics | ~30 |
| `app/api/test-bound-models/route.ts` | Enforce `ENABLE_PROVIDER_PROBES` and remove GET alias | ~35 |
| `app/api/test-session/route.ts` | Enforce `ENABLE_OUTBOUND_TESTS` on single-session diagnostics | ~30 |
| `app/api/test-sessions/route.ts` | Enforce `ENABLE_OUTBOUND_TESTS` and remove GET alias | ~35 |
| `app/api/test-dm-sessions/route.ts` | Enforce `ENABLE_OUTBOUND_TESTS` and remove GET alias | ~35 |
| `app/api/test-platforms/route.ts` | Split dry-run vs live-send behavior and remove GET alias | ~120 |
| `app/api/alerts/check/route.ts` | Split dry-run vs live-send alert behavior behind flags | ~120 |
| `app/page.tsx` | Surface disabled and dry-run diagnostic states on the home dashboard | ~90 |
| `app/models/page.tsx` | Surface provider-probe disabled state and dry-run messaging | ~50 |
| `app/alerts/page.tsx` | Surface alert-check disabled or dry-run states clearly | ~70 |
| `app/sessions/page.tsx` | Surface disabled outbound-session diagnostics clearly | ~50 |
| `app/page.test.tsx` | Extend smoke coverage for disabled and dry-run diagnostic messaging | ~50 |
| `.env.example` | Keep the secure-default flag contract authoritative and explicit | ~20 |
| `README.md` | Align quick-start, feature-flag, and Docker guidance with secure defaults | ~40 |
| `docs/deployment.md` | Align loopback binding and Cloudflare Access deployment guidance | ~40 |
| `docs/environments.md` | Clarify flag meanings and environment-specific secure defaults | ~30 |
| `docs/onboarding.md` | Align onboarding guidance with required secure-default env values | ~20 |
| `Dockerfile` | Change the default bind address from `0.0.0.0` to `127.0.0.1` | ~5 |

---

## 7. Success Criteria

### Functional Requirements

- [ ] Every Phase 00 mutation, provider-probe, and outbound diagnostic route
      enforces the appropriate server-only `ENABLE_*` flag before side effects
- [ ] `GET` requests to side-effect routes return `405 Method Not Allowed`
- [ ] Outbound diagnostics default to dry-run behavior unless
      `ENABLE_LIVE_SEND_DIAGNOSTICS=true`
- [ ] Operator-facing pages show clear disabled or dry-run states instead of
      ambiguous failures when secure defaults block a diagnostic
- [ ] Docker, README, and deployment docs all describe a loopback-bound origin
      and Cloudflare Access plus Tunnel as the standard non-local deployment

### Testing Requirements

- [ ] Unit tests cover feature-flag parsing and disabled-response helpers
- [ ] Route tests cover disabled flags, dry-run vs live-send behavior, and
      `GET` 405 behavior across affected routes
- [ ] Smoke coverage verifies operator-facing disabled or dry-run messaging
- [ ] Manual testing confirms read-only monitoring still works when all
      sensitive feature flags are off

### Non-Functional Requirements

- [ ] Sensitive feature flags are read only on the server and never exposed via
      `NEXT_PUBLIC_` or browser-visible config surfaces
- [ ] Disabled-route responses remain sanitized and deterministic
- [ ] Diagnostic routes continue using bounded timeouts and fail closed
- [ ] No new dependency is added for env parsing or route gating

### Quality Gates

- [ ] All files ASCII-encoded
- [ ] Unix LF line endings
- [ ] Code follows project conventions

---

## 8. Implementation Notes

### Key Considerations

- `.env.example`, README, and docs already advertise `ENABLE_*` flags, so the
  runtime needs to enforce the contract that documentation already promises.
- `requireSensitiveRouteAccess` covers operator auth but does not currently
  encode capability-specific feature gating, so route coverage has to be added
  explicitly and consistently.
- `app/api/test-platforms/route.ts` and `app/api/alerts/check/route.ts`
  currently contain real-send behavior that must become dry-run-first unless
  live-send is explicitly enabled.
- Removing a route's `GET` export should let Next.js return framework `405`
  responses, but regression tests must prove no alias remains.

### Potential Challenges

- Distinguishing dry-run from live-send behavior without breaking the operator
  UI may require response-contract changes shared across several pages.
- Some diagnostics mix provider checks and outbound sends, so the route-to-flag
  mapping has to stay explicit and defensible.
- Documentation drift is already visible in the Docker default bind address, so
  runtime and docs changes need to land together.

### Relevant Considerations

- [Pre] **Feature flag pattern with `.env.example`**: Extend the existing
  default-off pattern to every remaining sensitive route rather than inventing
  one-off env checks.
- [Pre] **`GET` handlers for side-effect routes**: Remove convenience aliases
  instead of preserving unsafe compatibility behavior.
- [Pre] **Dockerfile binds `0.0.0.0` by default**: Change the runtime default
  to loopback so the shipped container matches the documented deployment model.
- [Pre] **Auth enforcement is opt-in per handler**: Route coverage must stay
  centralized and explicit so new sensitive handlers do not bypass the guard.
- [Pre] **AlertMonitor fires on every page load**: This session should keep
  alert checks dry-run by default, but broader abuse resistance remains planned
  for Phase 01 Session 03.

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session's deliverables:

- A route could authenticate correctly but still execute a side effect before
  the feature flag check if the guard ordering is inconsistent.
- Dry-run diagnostics could look identical to live-send results unless the API
  and UI contracts label the active mode clearly.
- Removing `GET` aliases could break operator workflows silently if the UI and
  tests do not switch fully to explicit non-GET methods and disabled-state
  messaging.

---

## 9. Testing Strategy

### Unit Tests

- Validate feature-flag parsing, missing or invalid env handling, and disabled
  response helpers in `lib/security/feature-flags.test.ts`
- Validate protected-response parsing for feature-disabled and dry-run payloads
  in `lib/operator-elevation-client.test.ts`

### Integration Tests

- Verify model mutation, alert writes, and pixel-office layout saves return a
  deterministic disabled response when their flags are off
- Verify provider-probe and outbound-diagnostic routes reject disabled flags
  and return `405` when called with `GET`
- Verify platform and alert diagnostics return explicit dry-run metadata when
  live-send is disabled and only attempt real sends when the live-send flag is
  on

### Manual Testing

- Load the home dashboard, models page, sessions page, alerts page, and
  pixel-office page with all `ENABLE_*` flags set to `false`, then confirm
  read-only views still render and protected actions fail with clear operator
  messaging
- Enable one flag at a time in local `.env` and confirm the corresponding route
  or page becomes available without enabling unrelated sensitive actions
- Run Docker locally and confirm the container binds to `127.0.0.1:3000` by
  default while the docs match the observed behavior

### Edge Cases

- Missing or invalid `ENABLE_*` values in the environment
- Operator uses a diagnostic route with auth but the capability flag disabled
- Outbound diagnostics run in dry-run mode with no eligible target or account
- `GET` requests hit a route that previously proxied to `POST`

---

## 10. Dependencies

### External Libraries

- None expected; prefer existing Next.js, TypeScript, and platform primitives

### Internal Dependencies

- `lib/security/sensitive-route.ts`
- `lib/security/dashboard-env.ts`
- `lib/operator-elevation-client.ts`
- `app/page.tsx`
- `app/models/page.tsx`
- `app/alerts/page.tsx`
- `app/sessions/page.tsx`

### Other Sessions

- **Depends on**:
  `phase00-session01-auth-and-operator-elevation-foundation`,
  `phase00-session02-secret-containment-and-token-free-operator-flows`
- **Depended by**:
  `phase01-session01-route-boundary-validation`,
  `phase01-session02-sensitive-route-enforcement-and-operator-failure-states`

---

## Next Steps

Run the `implement` workflow step to begin AI-led implementation for this
session.
