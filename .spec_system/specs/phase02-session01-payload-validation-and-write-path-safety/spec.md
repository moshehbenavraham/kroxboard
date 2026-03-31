# Session Specification

**Session ID**: `phase02-session01-payload-validation-and-write-path-safety`
**Phase**: 02 - Runtime Boundary and Read Path Hardening
**Status**: Completed
**Created**: 2026-03-31

---

## 1. Session Overview

This session opens Phase 02 by tightening the remaining write-capable routes
that still accept unbounded JSON bodies before the runtime decides whether the
payload is safe. Phase 01 already established auth, method, origin, and typed
request-boundary helpers, but `app/api/alerts/route.ts`,
`app/api/config/agent-model/route.ts`, and
`app/api/pixel-office/layout/route.ts` still rely on `request.json()` without
a shared byte budget or a reusable oversized-payload denial contract.

The main goal is to add one bounded request-body helper, route-specific payload
size ceilings, and a consistent validation sequence that rejects malformed or
oversize input before config reads, filesystem writes, or gateway mutation
calls begin. This directly targets Pre-S18 and the write-path slice of
Pre-S11 while laying the groundwork for the broader runtime-boundary cleanup
in Session 02.

This work is the dependency floor for the rest of Phase 02. Runtime bridge
consolidation should not spread unbounded or inconsistent write-body handling,
and later read-path caching work is easier to reason about once the mutation
surface already fails early and predictably.

---

## 2. Objectives

1. Centralize bounded JSON request-body parsing for the targeted write routes
   before route-local validation or privileged work begins.
2. Add route-appropriate payload size ceilings for alert writes, model
   mutation, and pixel-office layout saves.
3. Reject malformed or oversize payloads with sanitized 4xx responses before
   any config read, filesystem write, or gateway mutation call executes.
4. Add regression coverage that proves invalid and oversize requests fail
   closed without changing persisted state or touching the gateway.

---

## 3. Prerequisites

### Required Sessions

- [x] `phase00-session03-safe-defaults-and-deployment-baseline` - sensitive
  feature flags and non-GET defaults remain the baseline on all write routes
- [x] `phase01-session01-route-boundary-validation` - shared request-boundary
  validators already exist for agent and mutation payload fields
- [x] `phase01-session02-sensitive-route-enforcement-and-operator-failure-states`
  - same-origin mutation enforcement already guards the targeted routes
- [x] `phase01-session03-abuse-resistance-and-deterministic-diagnostics` -
  rate-limit and failure-state conventions remain the hardened baseline

### Required Tools/Knowledge

- Next.js App Router route handlers and `Request` body semantics
- TypeScript helper design under `lib/security/`
- Node JSON and filesystem behavior for alert and layout persistence
- Vitest route-test patterns with side-effect spies and temp runtime fixtures

### Environment Requirements

- `OPENCLAW_HOME` resolves to a writable local runtime path for route tests
- Root `.env` and `.env.example` remain the only source of sensitive feature
  toggles
- Existing sensitive-mutation guards stay first in the route flow before any
  bounded body parsing or payload validation work runs

---

## 4. Scope

### In Scope (MVP)

- Server can read targeted mutation request bodies through one bounded helper
  before route-specific validation runs
- Server can enforce request-size ceilings sized to the current alert, model
  mutation, and pixel-office layout payload contracts
- Server can reject malformed or oversize write payloads with sanitized 400 or
  413 responses before config reads, filesystem writes, or gateway mutation
  calls
- Maintainer can rely on route and helper tests that prove invalid or oversize
  input does not trigger persistence or gateway side effects

### Out of Scope (Deferred)

- OpenClaw bridge deduplication and CLI parsing cleanup - *Reason: Session 02
  owns the shared runtime bridge rewrite*
- Async I/O conversion, caching, and concurrency bounds for read-heavy routes -
  *Reason: Session 03 owns read-path performance hardening*
- Atomic alert rename-and-swap persistence and mutable cache cleanup -
  *Reason: Phase 03 owns the remaining write-integrity cleanup items*
- Client-side banner or UX cleanup beyond existing denied and invalid states -
  *Reason: Phase 01 already landed the operator-facing failure-state baseline*

---

## 5. Technical Approach

### Architecture

Add `lib/security/request-body.ts` as the canonical bounded JSON body reader
for sensitive routes. The helper should preflight `Content-Length` when it is
present, enforce an actual byte ceiling on the received text, parse JSON
exactly once, and return typed invalid-request metadata for malformed or
oversize bodies without echoing raw parser failures to clients.

Keep `lib/security/request-boundary.ts` focused on payload-shape validation.
After `requireSensitiveMutationAccess` and the feature-flag gate succeed, the
targeted write routes should call the bounded body reader, map any malformed or
oversize failure to a client-safe response, and only then run the existing
alert, model-mutation, or pixel-office validators. That ordering keeps route
logic explicit: guard -> feature flag -> bounded parse -> schema validation ->
privileged work.

Use per-route budgets instead of one global ceiling. Alert writes and model
mutations should keep a small JSON budget because their accepted payloads are
compact, while pixel-office layout saves need a larger but still bounded budget
that reflects the current max tile and furniture contract. Route tests should
prove the gateway and persistence layers are untouched when those limits are
exceeded.

### Design Patterns

- Centralized bounded body reader: keep request-size enforcement in one helper
  instead of ad hoc route-local checks
- Fail-closed validation chain: reject malformed or oversize bodies before
  route validators, config reads, gateway calls, or writes
- Route-specific budgets: size each ceiling to the actual payload contract
  instead of a one-size-fits-all threshold
- Regression-first hardening: prove no privileged work starts after invalid or
  oversize input

### Technology Stack

- Next.js 16 route handlers and Web `Request`
- TypeScript 5 shared helper modules under `lib/security/`
- Node standard library JSON and filesystem APIs
- Vitest for helper and route regression coverage

---

## 6. Deliverables

### Files to Create

| File | Purpose | Est. Lines |
|------|---------|------------|
| `lib/security/request-body.ts` | Shared bounded JSON request-body reader with malformed and oversize denial mapping | ~110 |
| `lib/security/request-body.test.ts` | Unit tests for byte ceilings, malformed JSON handling, and helper result contracts | ~120 |

### Files to Modify

| File | Changes | Est. Lines |
|------|---------|------------|
| `lib/security/types.ts` | Extend invalid-request typing to cover bounded-body failure states cleanly | ~20 |
| `lib/security/request-boundary.ts` | Refine alert, model, and layout validation edge cases used after bounded parsing | ~60 |
| `lib/security/request-boundary.test.ts` | Extend validator coverage for alert, model, and layout edge cases | ~80 |
| `app/api/alerts/route.ts` | Use bounded JSON parsing and reject malformed or oversize writes before config reads or writes | ~40 |
| `app/api/config/agent-model/route.ts` | Use bounded JSON parsing and reject malformed or oversize writes before gateway snapshot and patch calls | ~50 |
| `app/api/pixel-office/layout/route.ts` | Use bounded JSON parsing and reject malformed or oversize layout saves before filesystem writes | ~40 |
| `app/api/alerts/route.test.ts` | Add malformed and oversize payload coverage with no-write assertions | ~80 |
| `app/api/config/agent-model/route.test.ts` | Add malformed and oversize payload coverage with no-gateway assertions | ~100 |
| `app/api/pixel-office/layout/route.test.ts` | Add malformed and oversize payload coverage with no-write assertions | ~70 |

---

## 7. Success Criteria

### Functional Requirements

- [ ] Targeted write routes reject malformed or oversize payloads with
      sanitized 400 or 413 responses before config reads, filesystem writes,
      or gateway mutation calls
- [ ] Alert, model-mutation, and pixel-office write routes use one shared
      bounded request-body helper instead of raw `request.json()` calls
- [ ] Valid alert updates, model mutations, and layout saves preserve their
      current success-path behavior after the new validation chain lands
- [ ] No touched write route accepts an unbounded JSON body before route
      validation begins

### Testing Requirements

- [ ] Unit tests cover bounded body parsing, malformed JSON, missing or false
      `Content-Length`, and oversize rejection behavior
- [ ] Route tests prove invalid and oversize alert writes do not persist config
- [ ] Route tests prove invalid and oversize model mutations do not call the
      gateway or clear cached config
- [ ] Route tests prove invalid and oversize layout saves do not write files
      or leave partial temp output
- [ ] Manual testing covers one valid write per targeted route plus malformed
      and oversize denial cases

### Non-Functional Requirements

- [ ] Route-specific payload ceilings reflect current operator payload shapes
      without forcing unsafe large-body parsing
- [ ] Client-visible failures never expose raw JSON parser errors, filesystem
      paths, or gateway internals
- [ ] The bounded-body helper is reusable for later Phase 02 runtime routes
      without adding a new dependency

### Quality Gates

- [ ] All files ASCII-encoded
- [ ] Unix LF line endings
- [ ] Code follows project conventions

---

## 8. Implementation Notes

### Key Considerations

- `lib/security/request-boundary.ts` already validates alert, model, and layout
  shapes, but those validators run only after `request.json()` has fully parsed
  an unbounded body
- `app/api/config/agent-model/route.ts` must never call `getConfigSnapshot`,
  `callOpenclawGateway`, or `clearConfigCache` when the request body is
  malformed or too large
- `app/api/pixel-office/layout/route.ts` carries the largest legitimate payload
  in scope, so its ceiling needs to reflect the current max tile and furniture
  contract rather than a generic small-body limit

### Potential Challenges

- `Content-Length` can be missing or inaccurate, so the helper must verify the
  actual received byte count instead of trusting headers alone
- The route tests need explicit side-effect assertions so oversize failures do
  not silently mask accidental gateway or filesystem calls
- Alert writes still use a non-atomic save path today, so this session must
  avoid conflating payload hardening with the deferred rename-and-swap work

### Relevant Considerations

- [P03] **Non-atomic alert config writes**: keep the current persistence shape
  stable in this session and defer rename-and-swap semantics to Phase 03
- [P01] **30 audit findings remain open**: prioritize fixes that close
  unbounded write-input exposure without expanding scope into later phases
- [P00] **Shared server-side route guards**: keep the mutation guard and the
  new bounded-body helper reusable and centralized instead of route-local
  branching
- [P00] **Co-located security tests**: add helper and route regressions next to
  the touched code so the write-path hardening stays easy to verify

### Behavioral Quality Focus

Checklist active: Yes
Top behavioral risks for this session's deliverables:
- Malformed or oversize mutation requests return generic 500 responses instead
  of clear operator-facing denial states
- Model-mutation failures reach gateway snapshot or patch calls before input
  validation finishes
- Layout-save rejections leave partial write artifacts or inconsistent success
  banners after a failed request

---

## 9. Testing Strategy

### Unit Tests

- Verify bounded JSON parsing succeeds for valid bodies under the byte ceiling
- Verify malformed JSON and oversize bodies map to typed, sanitized failures
- Verify alert, model, and layout validators still accept the current valid
  contracts after bounded parsing

### Integration Tests

- Add alert route tests that prove malformed and oversize writes fail before
  config persistence
- Add model-mutation route tests that prove malformed and oversize writes fail
  before gateway or cache side effects
- Add pixel-office layout route tests that prove malformed and oversize writes
  fail before filesystem writes

### Manual Testing

- Submit one valid alert update, one valid model mutation, and one valid layout
  save from the dashboard or route tests
- Repeat each flow with malformed JSON and with an oversize body to confirm the
  denial states remain sanitized

### Edge Cases

- Missing `Content-Length` on an otherwise valid JSON body
- False or stale `Content-Length` that understates the actual body size
- Empty JSON object or no-op alert update after bounded parsing succeeds
- Layout payload at the top end of the supported tile and furniture contract

---

## 10. Dependencies

### External Libraries

- None planned; use built-in platform APIs and existing project helpers first

### Internal Modules

- `lib/security/sensitive-mutation.ts` - mutation guard that must run before
  bounded body parsing
- `lib/security/request-boundary.ts` - existing payload-shape validators
- `lib/openclaw-cli.ts` - downstream gateway snapshot and patch path for model
  mutation
- `lib/openclaw-paths.ts` - runtime-root resolution used by alert and
  pixel-office persistence paths

### Other Sessions

- **Depends on**: `phase01-session01-route-boundary-validation`,
  `phase01-session02-sensitive-route-enforcement-and-operator-failure-states`,
  `phase01-session03-abuse-resistance-and-deterministic-diagnostics`
- **Depended by**: `phase02-session02-runtime-bridge-consolidation-and-safe-parsing`,
  `phase02-session03-async-cached-sanitized-read-paths`

---

## Next Steps

Run the implement workflow step to begin AI-led implementation.
