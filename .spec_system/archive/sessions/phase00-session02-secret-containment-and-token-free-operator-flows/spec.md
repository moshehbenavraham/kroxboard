# Session Specification

**Session ID**: `phase00-session02-secret-containment-and-token-free-operator-flows`
**Phase**: 00 - Foundation
**Status**: Completed
**Created**: 2026-03-31

---

## 1. Session Overview

Session 00-01 established the operator auth and elevation baseline, but the
browser still receives gateway credentials and other internal metadata through
read APIs and tokenized links. `app/api/config/route.ts` currently returns
`gateway.token`, `app/api/gateway-health/route.ts` returns a tokenized `webUrl`,
and client surfaces such as `app/components/agent-card.tsx`,
`app/sessions/page.tsx`, `app/pixel-office/page.tsx`, and
`app/gateway-status.tsx` build or open gateway chat URLs that keep the
credential browser-visible.

This session removes that browser-visible secret exposure by moving gateway
credential attachment to server-only flows. The browser should receive only
token-free launch paths, minimal platform metadata, and sanitized skill data.
Any new gateway launch or proxy surface should reuse the Session 00-01 auth
baseline so the credential stays server-side and the access boundary stays
explicit.

This work is the dependency bridge between the auth baseline and the secure
defaults session. Once token leakage and browser-side secret propagation are
removed, Session 00-03 can focus on default-off behavior, GET removal, and
deployment alignment without preserving unsafe compatibility paths.

---

## 2. Objectives

1. Remove `gateway.token` and tokenized gateway URLs from browser-visible API
   payloads, DOM links, and client request bodies.
2. Introduce a same-origin server-mediated gateway launch path so chat access
   continues working without exposing gateway credentials to the browser.
3. Redact browser-unneeded platform identifiers and absolute skill paths from
   API responses while preserving the read-only operator workflows that depend
   on those surfaces.
4. Add regression coverage and manual verification proving that token-free home,
   sessions, pixel-office, gateway-status, and skills flows still work.

---

## 3. Prerequisites

### Required Sessions

- [x] `phase00-session01-auth-and-operator-elevation-foundation` - provides the
      shared operator auth boundary for any new gateway launch or proxy route

### Required Tools/Knowledge

- Next.js 16 App Router route handlers and streaming responses
- Existing `requireSensitiveRouteAccess` guard in `lib/security/`
- TypeScript response-contract updates across shared client surfaces
- Vitest route and unit test patterns already used in `app/api/` and `lib/`

### Environment Requirements

- Local OpenClaw gateway remains reachable from the dashboard server runtime
- Root `.env` auth settings from Session 00-01 remain available
- Current leak surfaces remain reproducible in `/api/config`,
  `/api/gateway-health`, and the chat-link client flows

---

## 4. Scope

### In Scope (MVP)

- Operator can fetch token-free config and gateway-health responses that expose
  only the browser state needed for monitoring and chat launch
- Operator can open gateway chat through same-origin server-mediated launch
  paths that keep gateway credentials server-only
- Client request bodies and cached in-memory state no longer carry
  `gateway.token`
- Skills and config responses omit absolute skill paths and raw platform
  identifiers when the browser no longer needs them after the launch-path
  refactor

### Out of Scope (Deferred)

- Default-off feature flags, GET side-effect removal, and deployment baseline
  updates - Reason: planned for Phase 00 Session 03
- Broad analytics, stats, cron, or read-path metadata sanitization - Reason:
  planned primarily for Phase 02 Session 03
- Route-boundary validation, CSRF, rate limiting, and abuse resistance work -
  Reason: planned for Phase 01
- Gateway credential rotation or upstream auth redesign - Reason: outside the
  dashboard scope defined by the PRD

---

## 5. Technical Approach

### Architecture

Define a browser-safe contract for gateway and platform data. `/api/config`
should stop returning `gateway.token`, raw direct-message identifiers, and
other browser-unneeded fields once the UI can rely on token-free launch paths
instead. `/api/gateway-health` should return a same-origin launch path rather
than a tokenized upstream `webUrl`.

Add a same-origin gateway launch or proxy route that resolves the requested
chat target on the server, enforces the existing operator auth boundary at the
route edge, and attaches gateway credentials only in the server-to-gateway
request. The client should open `/gateway/...` style paths rather than direct
gateway URLs, and any target encoding should be validated or opaque so raw
platform IDs do not need to appear in DOM links.

Update the home, sessions, pixel-office, and gateway-status client surfaces to
consume the new sanitized contracts. Remove token-bearing request-body fields
that the server can resolve internally, and keep error handling explicit when a
launch path is unavailable or the upstream gateway is down.

### Design Patterns

- Same-origin gateway mediation: keep upstream credentials and host details on
  the server side
- Minimal browser contract: send only the fields the client actually renders or
  needs to act on
- Centralized launch-path helper: generate and validate chat launch targets in
  one place instead of rebuilding links ad hoc per page
- Sanitized list API pattern: keep server-only file locations and lookup data
  off the browser boundary

### Technology Stack

- Next.js 16 route handlers for same-origin gateway mediation
- Existing `lib/security/sensitive-route.ts` guard for server-side auth reuse
- TypeScript 5 shared client and API contracts
- Vitest route and unit tests
- Built-in `URL`, `fetch`, and stream primitives; no new dependency expected

---

## 6. Deliverables

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `lib/gateway-launch.ts` | Build validated same-origin gateway launch paths and target helpers | ~120 |
| `lib/gateway-launch.test.ts` | Unit coverage for launch-path generation and validation | ~110 |
| `app/gateway/[...path]/route.ts` | Same-origin gateway proxy or launch route with server-side credential handling | ~180 |
| `app/gateway/[...path]/route.test.ts` | Auth, validation, and failure-path coverage for gateway mediation | ~140 |
| `app/api/config/route.test.ts` | Redaction tests for browser-safe config payloads | ~120 |
| `app/api/gateway-health/route.test.ts` | Redaction tests for gateway health launch metadata | ~120 |

### Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `app/api/config/route.ts` | Remove `gateway.token`, redact raw platform IDs, and emit token-free launch data | ~120 |
| `app/api/gateway-health/route.ts` | Replace tokenized upstream URL output with same-origin launch metadata | ~80 |
| `lib/openclaw-skills.ts` | Keep internal skill locations server-side only | ~40 |
| `app/api/skills/route.ts` | Return a sanitized skill list contract without absolute paths | ~30 |
| `app/api/skills/route.test.ts` | Assert internal skill locations never reach browser-visible responses | ~30 |
| `app/components/agent-card.tsx` | Replace tokenized chat links with same-origin launch paths and safe platform labels | ~80 |
| `app/page.tsx` | Consume sanitized config data on the home page and stop passing token-bearing props | ~70 |
| `app/sessions/page.tsx` | Remove token-bearing request-body fields and use same-origin chat launch paths | ~70 |
| `app/pixel-office/page.tsx` | Consume token-free gateway state and open chats through same-origin launch paths | ~90 |
| `app/gateway-status.tsx` | Open same-origin launch paths and show a clear unavailable state when absent | ~40 |
| `app/page.test.tsx` | Assert home-page wiring still works with token-free gateway data | ~40 |

---

## 7. Success Criteria

### Functional Requirements

- [x] `/api/config` and `/api/gateway-health` no longer return `gateway.token`
      or tokenized gateway URLs
- [x] Browser-visible DOM links and click handlers open same-origin token-free
      gateway launch paths instead of direct token-bearing upstream URLs
- [x] Client request bodies no longer include gateway secrets or redundant
      gateway credential fields
- [x] Skills list responses and config platform payloads omit internal file
      paths and raw platform identifiers that are no longer required by the UI

### Testing Requirements

- [x] Unit tests cover launch-path generation and target validation
- [x] Route tests cover config redaction, gateway-health redaction, and gateway
      mediation auth or failure behavior
- [x] Existing skills and home-page tests are updated for the sanitized browser
      contract
- [x] Manual testing confirms token-free home, sessions, pixel-office,
      gateway-status, and skills flows on the local dev server

### Non-Functional Requirements

- [x] Any new gateway mediation route enforces auth at the boundary closest to
      the credentialed upstream resource
- [x] Gateway mediation failures return sanitized, deterministic errors
- [x] Gateway launch behavior uses bounded timeouts and does not hang the
      operator UI indefinitely
- [x] Read-only operator monitoring remains usable after token removal

### Quality Gates

- [x] All files ASCII-encoded
- [x] Unix LF line endings
- [x] Code follows project conventions

---

## 8. Implementation Notes

### Key Considerations

- The gateway token is the sole upstream credential, so any remaining
  browser-visible copy of it keeps SYN-01 effectively open.
- `app/components/agent-card.tsx`, `app/sessions/page.tsx`, and
  `app/pixel-office/page.tsx` currently derive chat URLs client-side from
  token-bearing config data; the contract change has to land consistently
  across all three.
- The skills list UI does not need internal filesystem locations, so the API
  can redact them without changing operator-visible behavior.

### Potential Challenges

- Gateway chat may require more than a single HTML response, so the same-origin
  mediation route needs to handle follow-up upstream asset requests cleanly.
- Cached client state and refs may retain the old token-bearing contract during
  rollout unless the pages fully rehydrate from sanitized responses.
- Redacting platform identifiers must preserve enough information for the UI to
  route the operator to the right chat target without exposing raw IDs.

### Relevant Considerations

- [Pre] **Gateway token is sole credential**: Treat any browser-visible copy as
  equivalent to full gateway compromise, and keep attachment server-side only.
- [Pre] **Gateway token leaked to browser**: `/api/config` and
  `/api/gateway-health` are confirmed leak points that this session must close.
- [Pre] **Auth enforcement is opt-in per handler**: Any new gateway mediation
  route should reuse the centralized guard so a credentialed launch path does
  not become a new bypass.
- [Pre] **Returning full config objects to unauthenticated callers**: Sanitize
  response contracts instead of serializing raw config-shaped data.
- [Pre] **`requireSensitiveRouteAccess` helper**: Reuse the existing guard
  rather than creating a new auth path for proxy or launch behavior.

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session's deliverables:

- A gateway mediation route could leak upstream errors or fail open if target
  validation and auth checks do not run before the upstream request starts.
- Client surfaces could keep stale token-bearing links in memory if the new
  contract does not fully replace the old `gateway` shape everywhere.
- Operators could lose chat access entirely if unavailable and degraded states
  are not explicit while the launch-path refactor lands.

---

## 9. Testing Strategy

### Unit Tests

- Validate same-origin launch-path generation and any opaque or validated target
  encoding in `lib/gateway-launch.test.ts`

### Integration Tests

- Verify `/api/config` omits `gateway.token`, omits raw platform IDs no longer
  needed by the browser, and emits safe launch data
- Verify `/api/gateway-health` omits tokenized upstream URLs and returns
  same-origin launch metadata
- Verify the gateway mediation route enforces auth, rejects invalid targets, and
  sanitizes upstream failures
- Verify the skills list API never returns internal skill file locations

### Manual Testing

- Open home-page agent chat links and confirm the browser URL is same-origin and
  token-free
- Open gateway status and pixel-office chat launches and confirm the UI handles
  healthy and unavailable gateway states clearly
- Open sessions page chat launches, run the protected session test flow, and
  confirm request bodies do not include gateway secrets
- Inspect skills list network responses and confirm internal skill paths do not
  appear in the browser response payload

### Edge Cases

- Missing or invalid launch target values
- Gateway upstream unavailable or timing out
- Agent or platform entries without a direct chat target
- Stale cached page state after the sanitized contract replaces the old token
  shape

---

## 10. Dependencies

### External Libraries

- None expected; prefer existing Next.js and platform primitives

### Internal Dependencies

- `lib/security/sensitive-route.ts`
- `lib/gateway-url.ts`
- `app/api/config/route.ts`
- `app/api/gateway-health/route.ts`
- `lib/openclaw-skills.ts`

### Other Sessions

- **Depends on**: `phase00-session01-auth-and-operator-elevation-foundation`
- **Depended by**: `phase00-session03-safe-defaults-and-deployment-baseline`

---

## Next Steps

Session complete. Run `updateprd` to sync tracking state and prepare the next
session.
