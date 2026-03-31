# Session Specification

**Session ID**: `phase01-session02-sensitive-route-enforcement-and-operator-failure-states`
**Phase**: 01 - Sensitive Route Hardening
**Status**: Not Started
**Created**: 2026-03-31

---

## 1. Session Overview

This session closes the remaining Phase 01 route-enforcement gap after Session
01 established shared path and request-boundary helpers. The codebase now has
auth and feature-flag coverage on many sensitive endpoints, but the write and
side-effect routes still do not apply a consistent same-origin mutation guard,
and several payloads are only checked for presence rather than validated before
gateway, filesystem, or cookie-changing work begins.

The main targets are the mutating and diagnostic routes that can change runtime
state, issue or clear elevated sessions, proxy authenticated gateway actions,
or exercise provider and platform credentials. That includes
`app/api/operator/elevate/route.ts`, `app/gateway/[...path]/route.ts`,
`app/api/alerts/route.ts`, `app/api/config/agent-model/route.ts`,
`app/api/pixel-office/layout/route.ts`, `app/api/test-model/route.ts`,
`app/api/alerts/check/route.ts`, `app/api/test-session/route.ts`,
`app/api/test-sessions/route.ts`, `app/api/test-bound-models/route.ts`,
`app/api/test-dm-sessions/route.ts`, and `app/api/test-platforms/route.ts`.

This session directly targets SYN-03, SYN-07, and the remaining route-level
slice of SYN-11 while establishing the enforcement floor required by Session
01-03. Rate limits and deterministic diagnostics only make sense after every
sensitive non-GET request shares the same auth, method, origin, and
invalid-input behavior.

---

## 2. Objectives

1. Add a shared same-origin enforcement layer for sensitive non-GET requests
   and prove cross-origin writes are rejected before privileged work begins.
2. Validate alert-write, model-mutation, provider-probe, layout-save, and
   operator-elevation payloads with typed invalid-request responses before
   gateway, filesystem, or cookie mutation helpers run.
3. Roll the shared mutation guard across the remaining write and diagnostic
   routes in scope for Phase 01, including gateway proxy mutation verbs.
4. Surface consistent operator-facing denied, disabled, and invalid-request
   states on pages and dialogs that trigger sensitive actions.

---

## 3. Prerequisites

### Required Sessions

- [x] `phase00-session01-auth-and-operator-elevation-foundation` - the shared
  operator identity and elevated-session baseline already exists
- [x] `phase00-session02-secret-containment-and-token-free-operator-flows` -
  token-free browser contracts keep the remaining work focused on route
  enforcement instead of browser secret exposure
- [x] `phase00-session03-safe-defaults-and-deployment-baseline` - safe-default
  feature flags and non-GET cleanup remain the deployment baseline
- [x] `phase01-session01-route-boundary-validation` - shared request-boundary
  helpers are available for reuse on session and diagnostic routes

### Required Tools/Knowledge

- Next.js App Router route handlers and method export behavior
- Browser same-origin request semantics for `Origin`, `Referer`, and localhost
- TypeScript validation helpers and discriminated unions
- Vitest plus React Testing Library for route and page-level regression tests

### Environment Requirements

- `DASHBOARD_HOST`, `DASHBOARD_ALLOWED_EMAILS`, and the operator session env
  contract stay aligned with the Phase 00 auth baseline
- Root `.env` and `.env.example` remain the only source of sensitive feature
  toggles
- Localhost and Cloudflare Access deployments both remain supported access
  modes for sensitive actions

---

## 4. Scope

### In Scope (MVP)

- Server can reject cross-origin `POST`, `PUT`, `PATCH`, and `DELETE` requests
  on sensitive routes before gateway, filesystem, or cookie-changing work
- Server can validate attacker-controlled write and probe payloads before
  gateway or mutation helpers execute
- Server can reuse one shared mutation-guard helper across the remaining
  protected write and side-effect endpoints in this phase
- Operator-facing surfaces can distinguish denied, disabled, and invalid
  sensitive-action failures without exposing raw internals

### Out of Scope (Deferred)

- Per-route rate limits, retry budgets, and abuse throttling - *Reason:
  Session 01-03 owns abuse resistance and bounded diagnostics*
- Security-header expansion and CSP tightening - *Reason: Session 01-03 owns
  that rollout after route enforcement stabilizes*
- Async I/O conversions, read-path caching, and file-size limits - *Reason:
  Phase 02 owns heavy-read and runtime-boundary hardening*
- Deterministic alert-send behavior changes and self-SSRF cleanup - *Reason:
  Session 01-03 owns the diagnostic behavior rewrite*

---

## 5. Technical Approach

### Architecture

Create `lib/security/sensitive-mutation.ts` as the shared guard for privileged
non-GET requests. The helper should layer method intent, same-origin checks,
and `requireSensitiveRouteAccess` so sensitive routes can fail closed before
they parse JSON, write files, clear cookies, or proxy upstream traffic. The
guard should produce typed, client-safe denial payloads that are reusable by
route tests and the protected-request client parser.

Extend `lib/security/request-boundary.ts` beyond `agentId` and `sessionKey`
validation so it can parse and validate the attacker-controlled payloads that
remain in Phase 01: operator code submission, model mutation inputs, provider
probe inputs, alert config mutations, and pixel-office layout writes. Route
handlers should consume these helpers at the top of the request path and only
touch downstream gateway or filesystem helpers when the typed validation result
is successful.

Update `lib/operator-elevation-client.ts` and the sensitive-action pages to
preserve structured failure classes instead of collapsing everything to a
single string. The UI should keep the current auth-challenge flow, but add a
shared operator-action banner so denied, disabled, and invalid states render
consistently on home, alerts, models, sessions, and pixel office surfaces.

### Design Patterns

- Shared mutation guard: centralize same-origin and method enforcement instead
  of repeating header checks per route
- Typed invalid-request mapping: treat validation failures as structured client
  states, not ad hoc strings
- Fail closed before privileged work: reject bad origin or payload data before
  gateway fetches, cookie writes, or filesystem mutation
- Shared operator status presentation: reuse one banner pattern for sensitive
  actions across pages and dialogs

### Technology Stack

- Next.js 16 route handlers and `NextResponse`
- React 19 client pages and operator-elevation provider
- TypeScript 5 discriminated unions and shared helper modules
- Vitest and React Testing Library for route and page regressions

---

## 6. Deliverables

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `lib/security/sensitive-mutation.ts` | Shared same-origin and method guard for sensitive non-GET requests | ~140 |
| `lib/security/sensitive-mutation.test.ts` | Unit coverage for localhost, trusted remote origin, missing origin, and cross-origin rejection | ~140 |
| `app/components/operator-action-banner.tsx` | Shared operator-facing banner for denied, disabled, and invalid sensitive-action states | ~60 |
| `app/alerts/page.test.tsx` | Alert page regressions for denied, disabled, invalid, and dry-run states | ~140 |
| `app/models/page.test.tsx` | Models page regressions for protected probe failures and messaging | ~120 |
| `app/sessions/page.test.tsx` | Sessions page regressions for invalid and denied session-test states | ~140 |
| `app/pixel-office/page.test.tsx` | Pixel office save-flow regressions for denied, disabled, and invalid layout states | ~120 |

### Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `lib/security/types.ts` | Add typed mutation-denial and invalid-request contracts for route and client parsing | ~60 |
| `lib/security/request-boundary.ts` | Add payload validators for operator code, model refs, alert writes, and layout saves | ~160 |
| `lib/security/request-boundary.test.ts` | Extend validator coverage for the new payload contracts | ~140 |
| `lib/operator-elevation-client.ts` | Parse invalid-request failures and expose structured operator-facing messaging helpers | ~100 |
| `lib/operator-elevation-client.test.ts` | Extend protected-response parsing coverage for invalid-request payloads | ~80 |
| `app/api/operator/elevate/route.ts` | Apply same-origin guard and typed operator-code validation before cookie mutation | ~50 |
| `app/gateway/[...path]/route.ts` | Apply same-origin enforcement to non-GET proxy verbs before upstream credential use | ~50 |
| `app/api/alerts/route.ts` | Validate alert-write payloads and enforce same-origin mutation requests | ~80 |
| `app/api/config/agent-model/route.ts` | Validate model-mutation payloads and enforce same-origin mutation requests | ~80 |
| `app/api/pixel-office/layout/route.ts` | Validate layout-save payloads and enforce same-origin mutation requests | ~70 |
| `app/api/test-model/route.ts` | Validate provider-probe payloads and enforce same-origin mutation requests | ~50 |
| `app/api/alerts/check/route.ts` | Apply same-origin mutation enforcement to manual alert checks | ~20 |
| `app/api/test-session/route.ts` | Apply same-origin mutation enforcement ahead of session diagnostics | ~20 |
| `app/api/test-sessions/route.ts` | Apply same-origin mutation enforcement ahead of batch session diagnostics | ~20 |
| `app/api/test-bound-models/route.ts` | Apply same-origin mutation enforcement ahead of batch provider probes | ~20 |
| `app/api/test-dm-sessions/route.ts` | Apply same-origin mutation enforcement ahead of DM diagnostics | ~20 |
| `app/api/test-platforms/route.ts` | Apply same-origin mutation enforcement ahead of platform diagnostics | ~20 |
| `app/page.tsx` | Adopt shared operator-action banner and structured failure-state messaging for home actions | ~50 |
| `app/alerts/page.tsx` | Adopt shared operator-action banner and structured failure-state messaging for alert actions | ~60 |
| `app/models/page.tsx` | Adopt shared operator-action banner and structured failure-state messaging for model probes | ~40 |
| `app/sessions/page.tsx` | Adopt shared operator-action banner and structured failure-state messaging for session tests | ~40 |
| `app/pixel-office/page.tsx` | Adopt shared operator-action banner for protected layout-save failures | ~40 |

---

## 7. Success Criteria

### Functional Requirements

- [ ] Sensitive non-GET routes reject cross-origin mutation attempts before
      feature-flag checks, gateway fetches, filesystem writes, or cookie
      mutation
- [ ] Alert-write, model-mutation, provider-probe, layout-save, and
      operator-code payloads are validated with typed invalid-request
      responses before privileged work begins
- [ ] The targeted write and diagnostic routes reuse one shared same-origin
      mutation guard rather than route-local origin logic
- [ ] Home, alerts, models, sessions, and pixel-office views surface explicit
      denied, disabled, and invalid-request states for sensitive actions

### Testing Requirements

- [ ] Unit tests cover same-origin guard behavior and the new payload
      validators
- [ ] Route tests prove cross-origin requests are rejected before upstream
      gateway, alert, or cookie work on representative write and diagnostic
      routes
- [ ] Page tests cover operator-facing denied, disabled, invalid, and dry-run
      messaging on the sensitive-action views
- [ ] Manual testing confirms same-origin dashboard flows still work for model
      mutation, alert checks, session diagnostics, and pixel-office saves

### Non-Functional Requirements

- [ ] No touched route leaks raw origin values, filesystem details, or gateway
      internals in client-facing denial responses
- [ ] Same-origin browser flows remain functional for localhost and Cloudflare
      Access deployments
- [ ] UI failure states stay explicit without blocking the existing
      operator-elevation challenge flow

### Quality Gates

- [ ] All files ASCII-encoded
- [ ] Unix LF line endings
- [ ] Code follows project conventions

---

## 8. Implementation Notes

### Key Considerations

- Session 01 already introduced `agentId` and `sessionKey` validation for
  targeted session routes; this session should extend that validator layer
  instead of inventing a parallel payload-validation path
- `app/api/operator/elevate/route.ts` and `app/gateway/[...path]/route.ts`
  sit on the cookie and upstream-credential boundaries, so same-origin checks
  must happen before cookie mutation or proxied gateway traffic
- Most batch diagnostic routes do not accept request bodies; their main
  hardening work is shared same-origin enforcement and consistent denial
  behavior rather than new payload schemas

### Potential Challenges

- Browsers and local tooling do not present the same origin headers in every
  scenario, so the shared guard must fail closed without breaking legitimate
  localhost operator flows
- Some routes currently collapse invalid input and upstream failures into one
  string, so client parsing must become more structured without regressing the
  existing auth-challenge retry behavior
- Gateway proxy mutation verbs and operator session clearing must keep working
  under the new guard even though they are used by shared infrastructure code

### Relevant Considerations

- [P01] **Auth guard coverage still depends on route discipline**: a shared
  mutation helper should become the default entry point for sensitive non-GET
  routes
- [P01] **Cloudflare Access/Tunnel is still the non-local auth boundary**:
  same-origin enforcement must preserve the documented Cloudflare deployment
  model instead of assuming localhost-only access
- [P00] **Shared server-side route guards**: follow the existing centralized
  helper pattern instead of route-local auth or origin checks
- [P00] **GET handlers for side-effect routes**: keep method intent explicit
  and covered by tests so new aliases do not reappear
- [P00] **Dry-run-first diagnostics**: UI messaging must keep dry-run behavior
  distinct from denied or disabled states

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session's deliverables:

- Cross-origin rejection could surface as confusing generic failures if the UI
  does not preserve denied, disabled, and invalid states separately
- Invalid payloads could still reach gateway or write helpers if validators run
  after expensive or privileged work starts
- The shared mutation guard could accidentally block legitimate same-origin
  localhost actions if origin normalization is inconsistent

---

## 9. Testing Strategy

### Unit Tests

- Validate same-origin decisions for localhost, trusted remote origins, missing
  origin headers, and explicit cross-origin attempts
- Validate operator-code, model-ref, alert-write, and layout payload parsing in
  `lib/security/request-boundary.ts`
- Validate protected-response parsing for typed invalid-request payloads in
  `lib/operator-elevation-client.ts`

### Integration Tests

- Verify representative write routes reject cross-origin requests before file
  or gateway work: operator elevate, alerts, config agent-model, and
  pixel-office layout
- Verify representative diagnostic routes reject cross-origin requests before
  provider, session, platform, or alert-check execution
- Verify the gateway proxy rejects non-GET cross-origin mutation attempts
  before forwarding authenticated upstream requests

### Manual Testing

- Change an agent model from the home page with a valid same-origin operator
  session and confirm the action still succeeds
- Run manual alert checks, provider probes, session diagnostics, and
  pixel-office saves from the dashboard UI and confirm denied, disabled, or
  invalid states produce explicit operator-facing banners
- Replay representative sensitive requests with forged `Origin` headers in a
  local test harness and confirm they fail before privileged work begins

### Edge Cases

- Localhost variants such as `localhost`, `127.0.0.1`, and IPv6 loopback
- Requests with missing or empty `Origin` headers
- Invalid or whitespace-only operator codes, model refs, and alert payload
  fields
- Layout payloads with unsupported version, malformed tiles, or unexpected
  structure
- Repeated button presses while a protected request is already pending

---

## 10. Dependencies

### External Libraries

- No new dependencies planned; use existing Next.js, React, Vitest, and Node
  standard library capabilities

### Internal Dependencies

- `lib/security/sensitive-route.ts` and `lib/security/operator-identity.ts`
  for the existing auth baseline and local-vs-remote request semantics
- `lib/security/request-boundary.ts` for the Session 01 validation baseline
- `lib/operator-elevation-client.ts` and
  `app/components/operator-elevation-provider.tsx` for protected action retry
  and operator challenge flows
- `lib/gateway-launch-server.ts` and `app/gateway/[...path]/route.ts` for the
  authenticated gateway launch and proxy surface

### Other Sessions

- **Depends on**:
  - `phase00-session01-auth-and-operator-elevation-foundation`
  - `phase00-session02-secret-containment-and-token-free-operator-flows`
  - `phase00-session03-safe-defaults-and-deployment-baseline`
  - `phase01-session01-route-boundary-validation`
- **Depended by**:
  - `phase01-session03-abuse-resistance-and-deterministic-diagnostics`

---

## Next Steps

Run the implement workflow step to begin AI-led implementation.
