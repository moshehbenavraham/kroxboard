# Session Specification

**Session ID**: `phase00-session01-auth-and-operator-elevation-foundation`
**Phase**: 00 - Foundation
**Status**: Completed
**Created**: 2026-03-31

---

## 1. Session Overview

This session establishes the first application-side protection layer for every
dashboard action that can mutate runtime state, send messages, or exercise
provider credentials. The current codebase exposes those actions directly from
browser-triggered route handlers such as `app/api/config/agent-model/route.ts`,
`app/api/alerts/route.ts`, `app/api/test-model/route.ts`,
`app/api/test-platforms/route.ts`, and `app/api/pixel-office/layout/route.ts`
with no shared authentication baseline.

The goal is to add a reusable operator elevation flow that fits the deployment
model already documented in the PRD: Cloudflare Access for non-local entry,
plus an app-side operator code challenge that mints an HTTP-only signed cookie
for elevated actions. The implementation must preserve read-only monitoring,
keep secrets server-only, and give operators explicit blocked or challenge
states instead of silent failures when a sensitive action is denied.

This work is the dependency floor for Phase 00 Session 02 and Session 03. Once
the auth baseline exists, later sessions can remove browser token leakage,
disable side effects by default, and tighten per-route validation without
re-inventing the sensitive-route boundary.

---

## 2. Objectives

1. Create a centralized server-side auth baseline that sensitive route handlers
   can call before any mutation, outbound test, or provider probe work begins.
2. Implement an operator code challenge that issues and verifies an HTTP-only
   signed elevated-session cookie with a bounded TTL of 12 hours or less.
3. Expose explicit operator-facing challenge and denial states so current UI
   actions can recover cleanly when elevation is missing or expired.
4. Document and validate the root env contract for operator auth secrets and
   local versus Cloudflare Access usage.

---

## 3. Prerequisites

### Required Sessions

- None - Phase 00 starts with this session

### Required Tools/Knowledge

- Next.js App Router route handlers and cookies API
- TypeScript shared helper design in `lib/`
- Node `crypto` primitives for HMAC signing and constant-time comparison
- Vitest and Testing Library for regression coverage

### Environment Requirements

- Root `.env` and `.env.example` contain operator auth keys
- Localhost remains a supported development access mode
- Cloudflare Access headers remain the standard non-local identity signal

---

## 4. Scope

### In Scope (MVP)

- Operator can challenge for elevated access through a shared server-side flow
  and receive a bounded HTTP-only session cookie
- Sensitive route handlers can require the shared auth baseline before writes,
  provider probes, or outbound diagnostics
- Operator-facing UI can surface challenge-required, denied, and expired-session
  states for current sensitive controls
- Maintainer can rely on centralized env parsing and documentation for operator
  auth settings

### Out of Scope (Deferred)

- Full route-boundary validation, origin checks, and attacker-input hardening
  for every sensitive route - Reason: planned for Phase 01 once the auth
  baseline exists
- Removing `GET` side-effect aliases and default-off feature-flag enforcement -
  Reason: planned for Phase 00 Session 03
- Browser token redaction and token-free flow rewrites - Reason: planned for
  Phase 00 Session 02
- Alternate remote auth recipes outside the Cloudflare Access standard -
  Reason: explicitly outside the current deployment plan

---

## 5. Technical Approach

### Architecture

Implement a two-step sensitive-route boundary:

1. Resolve trusted operator identity from the request context. For non-local
   access, use Cloudflare Access email headers and optional JWT AUD validation
   when configured. For localhost development, allow the app to recognize the
   local trusted access mode without requiring Cloudflare headers.
2. Require a second operator elevation step that compares the submitted
   operator code using constant-time checks, signs a compact session payload,
   and stores it in an HTTP-only cookie with `Secure`, `SameSite`, and expiry
   attributes aligned to the env-configured session length.

Route handlers should call a single shared helper before any side effect. That
helper should return typed denial reasons so client code can distinguish between
"challenge required", "identity denied", and "session expired" without reading
raw server internals. Browser-side code should use a shared wrapper or provider
to retry a blocked action exactly once after a successful challenge.

### Design Patterns

- Centralized guard helper: keep route handlers thin and move auth checks into a
  reusable `lib/security` boundary
- Signed cookie session: avoid server-side session storage while keeping the
  operator secret and signing key server-only
- Provider-driven client retry flow: keep challenge dialog state and retry
  logic in one place instead of duplicating it across pages
- Explicit denial envelopes: return stable machine-readable auth states instead
  of leaking raw error messages

### Technology Stack

- Next.js 16 route handlers and cookies utilities
- React 19 client provider and dialog patterns
- TypeScript 5 shared auth types and helpers
- Node `crypto` for HMAC signing and constant-time comparison
- Vitest and Testing Library for unit and integration coverage

---

## 6. Deliverables

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `lib/security/types.ts` | Shared auth result and denial-state contracts | ~60 |
| `lib/security/dashboard-env.ts` | Parse and validate operator auth env values | ~120 |
| `lib/security/operator-identity.ts` | Resolve Cloudflare or localhost operator identity | ~120 |
| `lib/security/operator-session.ts` | Sign, verify, and clear elevated-session cookies | ~180 |
| `lib/security/sensitive-route.ts` | Shared route guard and denial helpers | ~140 |
| `lib/operator-elevation-client.ts` | Client helper for challenge flow and single retry | ~120 |
| `app/api/operator/elevate/route.ts` | Operator challenge issuance and session clear endpoint | ~120 |
| `app/api/operator/session/route.ts` | Safe session status endpoint for client bootstrap | ~80 |
| `app/components/operator-elevation-provider.tsx` | Shared challenge state and retry provider | ~160 |
| `app/components/operator-elevation-dialog.tsx` | Accessible operator code dialog | ~140 |
| `lib/security/dashboard-env.test.ts` | Env parsing regression tests | ~80 |
| `lib/security/operator-identity.test.ts` | Identity resolution regression tests | ~80 |
| `lib/security/operator-session.test.ts` | Cookie signing and expiry regression tests | ~120 |
| `app/api/operator/elevate/route.test.ts` | Challenge route tests | ~100 |
| `app/components/operator-elevation-provider.test.tsx` | Client retry and dialog reset tests | ~120 |

### Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `.env.example` | Clarify operator auth contract and safe defaults | ~20 |
| `README.md` | Document operator auth setup and challenge usage | ~30 |
| `app/providers.tsx` | Mount the operator elevation provider | ~20 |
| `app/api/config/agent-model/route.ts` | Require shared auth baseline for config mutation | ~25 |
| `app/api/alerts/route.ts` | Require shared auth baseline for alert writes | ~25 |
| `app/api/alerts/check/route.ts` | Require shared auth baseline for manual or scheduled checks | ~25 |
| `app/api/test-model/route.ts` | Require shared auth baseline for provider probes | ~20 |
| `app/api/test-bound-models/route.ts` | Require shared auth baseline for bulk model tests | ~20 |
| `app/api/test-platforms/route.ts` | Require shared auth baseline for platform diagnostics | ~30 |
| `app/api/test-session/route.ts` | Require shared auth baseline for single session tests | ~20 |
| `app/api/test-sessions/route.ts` | Require shared auth baseline for bulk session tests | ~20 |
| `app/api/test-dm-sessions/route.ts` | Require shared auth baseline for DM diagnostics | ~20 |
| `app/api/pixel-office/layout/route.ts` | Require shared auth baseline for layout writes | ~20 |
| `app/page.tsx` | Route sensitive controls through the shared challenge flow | ~60 |
| `app/models/page.tsx` | Add challenge-aware model probe behavior | ~40 |
| `app/alerts/page.tsx` | Add challenge-aware alert write and check behavior | ~60 |
| `app/alert-monitor.tsx` | Handle auth-required alert-check responses safely | ~30 |
| `app/sessions/page.tsx` | Add challenge-aware session test behavior | ~40 |
| `app/pixel-office/page.tsx` | Add challenge-aware layout save behavior | ~40 |

---

## 7. Success Criteria

### Functional Requirements

- [ ] Sensitive route handlers can call one shared auth helper before any side
      effect, provider probe, or write path runs
- [ ] `POST /api/operator/elevate` can issue an elevated-session cookie and
      clear it explicitly when the operator signs out or retries
- [ ] Protected routes return stable challenge-required or denied states without
      leaking secrets or internal path details
- [ ] Current sensitive UI actions can surface a challenge dialog, complete the
      action after successful elevation, and fail clearly when access is denied

### Testing Requirements

- [ ] Unit tests cover env parsing, identity resolution, and session cookie
      signing or expiry behavior
- [ ] Route tests cover challenge issuance and at least one representative
      protected mutation route
- [ ] Client tests cover retry-after-elevation and dialog state reset behavior
- [ ] Manual testing covers home, models, alerts, sessions, and pixel-office
      blocked versus elevated flows

### Non-Functional Requirements

- [ ] Elevated session TTL stays at 12 hours or less
- [ ] Operator code and cookie secret never cross the server-client boundary
- [ ] Read-only pages remain usable without an elevated session
- [ ] Denial responses remain sanitized and deterministic

### Quality Gates

- [ ] All files ASCII-encoded
- [ ] Unix LF line endings
- [ ] Code follows project conventions

---

## 8. Implementation Notes

### Key Considerations

- `.env.example` already declares the required operator auth keys, so the
  implementation should centralize validation and documentation rather than
  invent a second config path.
- The codebase currently has no auth helper or provider pattern, so the first
  implementation should favor small explicit helpers over implicit middleware.
- Several current sensitive flows are triggered directly from client pages, so
  the operator-facing challenge UX must be reusable and not page-specific.

### Potential Challenges

- Localhost versus Cloudflare Access identity behavior: define a clear trusted
  local path without weakening the non-local boundary
- Wide route surface area: group route adoption by behavior type so the rollout
  stays consistent and reviewable
- Existing background alert checks: ensure auth failures degrade safely instead
  of producing noisy console errors or hidden retry loops

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session's deliverables:

- Expired or missing operator sessions could fail silently and make sensitive UI
  look broken if denial states are not explicit
- Challenge dialogs could retain stale code or pending state across retries if
  reopen behavior is not reset cleanly
- Protected actions could re-fire multiple times after elevation unless the
  retry contract limits duplicate submissions while requests are in flight

---

## 9. Testing Strategy

### Unit Tests

- Parse valid and invalid operator auth env combinations
- Resolve operator identity for allowed Cloudflare headers, disallowed headers,
  and localhost fallback cases
- Sign, verify, expire, and clear elevated-session cookies

### Integration Tests

- Verify the operator challenge route returns the correct denial and success
  payloads and sets the cookie attributes correctly
- Verify representative protected routes reject missing elevation and allow a
  request with a valid signed cookie
- Verify the client provider retries a blocked action once after elevation

### Manual Testing

- Attempt model probe, config mutation, alert write or check, session test, and
  pixel-office save without elevation and confirm the challenge state is shown
- Complete the operator code challenge and confirm the original action succeeds
- Expire or clear the operator session and confirm the next action re-prompts

### Edge Cases

- Missing or malformed operator auth env values
- Operator session cookie signed with the wrong secret or expired timestamp
- Cloudflare headers missing on non-local requests while localhost still works
- Dialog cancellation, repeated submit clicks, and retry after a failed code

---

## 10. Dependencies

### External Libraries

- No new dependencies planned; use existing Next.js, React, Vitest, and Node
  standard library capabilities

### Internal Dependencies

- `app/providers.tsx` for mounting shared client state
- Sensitive API routes under `app/api/`
- Root env contract in `.env.example`
- Security planning docs in `.spec_system/PRD/PRD.md`, `docs/SECURITY_MASTER.md`,
  and `docs/SECURITY_FINDINGS.md`

### Other Sessions

- **Depends on**: none
- **Depended by**:
  - `phase00-session02-secret-containment-and-token-free-operator-flows`
  - `phase00-session03-safe-defaults-and-deployment-baseline`

---

## Next Steps

Run the implement workflow step to begin AI-led implementation.
