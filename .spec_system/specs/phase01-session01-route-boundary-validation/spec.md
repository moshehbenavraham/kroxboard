# Session Specification

**Session ID**: `phase01-session01-route-boundary-validation`
**Phase**: 01 - Sensitive Route Hardening
**Status**: Not Started
**Created**: 2026-03-31

---

## 1. Session Overview

This session closes the first Phase 01 gap by moving agent and cron path trust
out of route-local string joins and into shared boundary helpers. Today
`app/api/sessions/[agentId]/route.ts`, `app/api/stats/[agentId]/route.ts`,
`app/api/test-session/route.ts`, `app/api/test-dm-sessions/route.ts`,
`app/api/test-platforms/route.ts`, `app/api/alerts/check/route.ts`,
`app/api/config/agent-model/route.ts`, and `app/api/agent-activity/route.ts`
either join user- or config-controlled values directly into `OPENCLAW_HOME` or
resolve cron store paths without an allowlist boundary.

The goal is to add strict `agentId` validation, bounded OpenClaw path
resolvers, and shared request-boundary helpers that fail closed before
filesystem or gateway work begins. This session directly targets SYN-06 and the
path-handling slice of SYN-11 while landing the first reusable fix for SYN-22.

This work is the dependency floor for the rest of Phase 01. Once these
boundaries exist, Session 01-02 can focus on method and origin enforcement
without re-solving path safety per route, and Session 01-03 can add abuse
controls on top of a stable boundary layer.

---

## 2. Objectives

1. Centralize strict `agentId` validation and safe agent session path
   resolution for route params and sensitive request bodies.
2. Constrain cron store path resolution to approved OpenClaw directories and
   fail closed on config values that escape that boundary.
3. Apply the shared boundary helpers to the highest-risk path-consuming routes
   before filesystem access, gateway header construction, or mutation cleanup
   work.
4. Add regression tests that lock traversal rejection, boundary fallback
   behavior, and sanitized invalid-input responses in place.

---

## 3. Prerequisites

### Required Sessions

- [x] `phase00-session01-auth-and-operator-elevation-foundation` - shared
  sensitive-route auth baseline already exists for protected endpoints
- [x] `phase00-session02-secret-containment-and-token-free-operator-flows` -
  token-free browser contracts already removed unrelated secret leakage from
  the routes touched here
- [x] `phase00-session03-safe-defaults-and-deployment-baseline` - safe-default
  feature flags and non-GET cleanup remain the deployment baseline

### Required Tools/Knowledge

- Next.js App Router route handlers and route-test patterns
- TypeScript shared helper design in `lib/`
- Node `path` normalization and filesystem semantics
- Vitest module mocking and temp filesystem fixtures

### Environment Requirements

- `OPENCLAW_HOME` points to a local OpenClaw runtime or defaults to
  `~/.openclaw`
- Root `.env` and `.env.example` remain the only source of sensitive feature
  toggles
- The Phase 00 operator auth baseline continues guarding mutation and
  diagnostic routes

---

## 4. Scope

### In Scope (MVP)

- Server can reject invalid `agentId` route params and request-body agent
  identifiers before filesystem path construction or gateway header assignment
- Server can resolve agent session files and directories only within approved
  OpenClaw boundaries reused across sensitive routes
- Server can resolve cron-store paths from config only when they remain within
  approved OpenClaw directories
- Maintainer can rely on unit and route tests that lock traversal, invalid
  input, and fail-closed behavior

### Out of Scope (Deferred)

- Broad method and `Origin` enforcement rollout across every sensitive route -
  *Reason: Session 01-02 owns CSRF and method hardening*
- Rate limits, security headers, and deterministic diagnostic behavior -
  *Reason: Session 01-03 owns abuse resistance*
- Async I/O conversions, caching, and file-size bounds on read-heavy routes -
  *Reason: Phase 02 owns performance and heavy-read safety*
- Global `OPENCLAW_HOME` override hardening for all filesystem reads -
  *Reason: deferred to later runtime-boundary work after shared helpers land*

---

## 5. Technical Approach

### Architecture

Extend `lib/openclaw-paths.ts` into the canonical OpenClaw boundary layer.
Shared helpers should normalize candidate paths, validate `agentId` values,
resolve session-file and session-directory locations, and constrain cron-store
paths to approved directories under the OpenClaw runtime boundary. Helpers
should return safe absolute paths or typed failure states without leaking raw
filesystem details.

Add `lib/security/request-boundary.ts` for validating route params and
diagnostic request payload fields such as `agentId` and `sessionKey` before
handlers reach filesystem or gateway code. Route handlers should adopt these
helpers at the top of execution so invalid input is rejected before any
filesystem access, gateway header construction, or mutation cleanup work.

`app/api/agent-activity/route.ts` should replace its inline `cron.store`
resolver with the shared bounded helper and degrade to empty cron metadata when
the configured store path is invalid or missing. Targeted sensitive routes
should keep their current auth and feature-flag behavior, but add request and
path validation closer to the resource boundary.

### Design Patterns

- Centralized boundary resolver: keep path validation in one authoritative
  `lib/` layer instead of per-route string joins
- Fail-closed request validation: reject malformed or out-of-bound identifiers
  before any I/O or gateway work begins
- Shared sanitized error mapping: keep invalid-input responses deterministic and
  client-safe
- Regression-first hardening: add route tests where traversal and path-trust
  bugs were previously possible

### Technology Stack

- Next.js 16 route handlers and `NextResponse`
- TypeScript 5 shared utility modules
- Node `path` and `fs` standard library APIs
- Vitest for unit and route regression coverage

---

## 6. Deliverables

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `lib/security/request-boundary.ts` | Shared `agentId` and diagnostic input validation plus client-safe invalid-input responses | ~120 |
| `lib/security/request-boundary.test.ts` | Unit tests for identifier validation and request-boundary mapping | ~100 |
| `app/api/sessions/[agentId]/route.test.ts` | Traversal and valid-agent regression tests for the sessions route | ~100 |
| `app/api/stats/[agentId]/route.test.ts` | Traversal and valid-agent regression tests for the stats route | ~120 |
| `app/api/agent-activity/route.test.ts` | Cron-store boundary and graceful fallback route tests | ~140 |

### Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `lib/openclaw-paths.ts` | Add approved-directory checks, safe agent-session resolvers, and bounded cron-store resolution helpers | ~140 |
| `lib/openclaw-paths.test.ts` | Add traversal, allowlist, and cron-store coverage | ~80 |
| `app/api/sessions/[agentId]/route.ts` | Validate route params before reading session indexes and return sanitized client errors | ~30 |
| `app/api/stats/[agentId]/route.ts` | Use safe session-directory resolution before aggregating stats | ~40 |
| `app/api/agent-activity/route.ts` | Replace inline cron-store path trust with shared bounded resolution | ~60 |
| `app/api/test-session/route.ts` | Validate `agentId` and `sessionKey` inputs before gateway headers or fallback calls | ~30 |
| `app/api/test-dm-sessions/route.ts` | Use shared session-file resolution for DM lookup helpers | ~40 |
| `app/api/test-platforms/route.ts` | Use shared session-file resolution for platform DM lookup helpers | ~60 |
| `app/api/alerts/check/route.ts` | Use safe session-file resolution for alert recipient lookup | ~30 |
| `app/api/config/agent-model/route.ts` | Use safe session-file resolution before clearing model state from session files | ~30 |
| `app/api/test-session/route.test.ts` | Cover invalid-input rejection before gateway work | ~40 |
| `app/api/test-dm-sessions/route.test.ts` | Cover invalid agent-path rejection in DM lookup flow | ~40 |
| `app/api/test-platforms/route.test.ts` | Cover invalid agent-path rejection in platform diagnostic flow | ~40 |
| `app/api/alerts/check/route.test.ts` | Cover safe fallback when alert recipient lookup hits invalid or missing session paths | ~40 |
| `app/api/config/agent-model/route.test.ts` | Cover safe model-state cleanup when session-path validation fails | ~40 |

---

## 7. Success Criteria

### Functional Requirements

- [ ] Shared helpers reject traversal or malformed agent identifiers before any
      filesystem or gateway access on targeted routes
- [ ] Cron-store resolution accepts only approved OpenClaw paths and otherwise
      fails closed without leaking raw paths
- [ ] The routes touched in this session use shared boundary helpers instead of
      route-local path trust where edited
- [ ] Invalid-input responses are sanitized and deterministic across
      representative read and diagnostic routes

### Testing Requirements

- [ ] Unit tests cover valid and invalid `agentId` values, `sessionKey`
      validation, and cron-store boundary decisions
- [ ] Route tests cover traversal attempts on the sessions and stats routes and
      bounded cron fallback in agent activity
- [ ] Existing diagnostic and mutation route tests cover invalid identifiers
      before filesystem or gateway work begins
- [ ] Manual testing covers valid agent reads plus rejected traversal and
      invalid-input cases

### Non-Functional Requirements

- [ ] No touched route leaks absolute paths or raw filesystem errors in client
      responses
- [ ] No touched route performs filesystem work for rejected identifiers
- [ ] Boundary helpers remain reusable for Session 01-02 and later runtime
      hardening work

### Quality Gates

- [ ] All files ASCII-encoded
- [ ] Unix LF line endings
- [ ] Code follows project conventions

---

## 8. Implementation Notes

### Key Considerations

- `app/api/sessions/[agentId]/route.ts` and `app/api/stats/[agentId]/route.ts`
  currently build paths directly from route params and return raw errors; they
  are the primary SYN-06 closure targets
- `app/api/agent-activity/route.ts` owns the only current `cron.store`
  resolver, so its helper extraction should become the canonical path for later
  cron work
- Several protected diagnostic routes already use
  `requireSensitiveRouteAccess`; boundary validation must run before any
  filesystem or gateway-specific work inside those handlers

### Potential Challenges

- Some helpers need to distinguish invalid identifiers from valid-but-missing
  files without leaking absolute paths
- Config-derived agent lists can include unexpected IDs, so route behavior must
  choose between skipping invalid entries and failing the whole request
- `sessionKey` validation must stay strict enough to reject traversal-shaped
  input without breaking the current `agent:main:main` and direct-message
  formats

### Relevant Considerations

- [P01] **Auth guard coverage still depends on route discipline**: boundary
  helpers should be easy to call at the top of every route so missed checks do
  not reopen filesystem trust
- [P02] **Config-sourced path overrides still need an allowlist boundary**:
  this session should land the cron-store boundary in reusable helpers rather
  than keep it inline
- [P00] **Trusting config-sourced file paths without validation**: all new path
  resolution should funnel through shared allowlist checks
- [P00] **Shared server-side route guards**: follow the existing centralized
  helper pattern instead of route-specific boundary logic

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session's deliverables:

- Invalid identifiers could still trigger filesystem reads if routes validate
  too late in the control flow
- Shared helpers could over-reject legitimate legacy session keys or cron paths
  if matching rules drift from current operator workflows
- Sanitized errors could diverge across routes and make troubleshooting
  inconsistent if invalid-input mapping is not centralized

---

## 9. Testing Strategy

### Unit Tests

- Validate accepted and rejected `agentId` values, `sessionKey` formats, and
  invalid-input response mapping
- Validate approved-directory checks and bounded cron-store resolution in
  `lib/openclaw-paths.ts`

### Integration Tests

- Verify traversal attempts on the sessions and stats routes return sanitized
  client errors before filesystem reads
- Verify agent activity ignores or rejects out-of-bound cron-store paths
  without crashing or leaking paths
- Verify diagnostic routes reject invalid `agentId` or `sessionKey` values
  before calling the gateway or reading session files

### Manual Testing

- Request `/api/sessions/main` and `/api/stats/main` with valid runtime data
  and confirm normal responses
- Request traversal variants such as `../`, `%2e%2e`, and malformed
  `sessionKey` values against targeted routes and confirm sanitized rejections
- Run agent activity with valid and invalid `cron.store` config values and
  confirm graceful behavior

### Edge Cases

- Empty, whitespace-only, or dot-segment `agentId` values
- Encoded traversal attempts and mixed path-separator variants
- Valid agent IDs whose session files are missing
- `sessionKey` values with mismatched agent prefixes or unsupported shapes
- Cron-store config values using `~`, relative paths, or absolute paths outside
  the approved boundary

---

## 10. Dependencies

### External Libraries

- No new dependencies planned; use existing Next.js, Vitest, and Node standard
  library capabilities

### Internal Dependencies

- `lib/security/sensitive-route.ts` for protected routes that already use the
  shared auth baseline
- `lib/session-test-fallback.ts` and `lib/openclaw-cli.ts` for diagnostics that
  must validate input before upstream work
- `.spec_system/PRD/PRD.md` and `docs/SECURITY_FINDINGS.md` for canonical
  finding mapping

### Other Sessions

- **Depends on**:
  - `phase00-session01-auth-and-operator-elevation-foundation`
  - `phase00-session02-secret-containment-and-token-free-operator-flows`
  - `phase00-session03-safe-defaults-and-deployment-baseline`
- **Depended by**:
  - `phase01-session02-sensitive-route-enforcement-and-operator-failure-states`
  - `phase01-session03-abuse-resistance-and-deterministic-diagnostics`

---

## Next Steps

Run the implement workflow step to begin AI-led implementation.
