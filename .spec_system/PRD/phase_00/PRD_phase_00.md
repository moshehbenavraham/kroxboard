# PRD Phase 00: Foundation

**Status**: In Progress
**Sessions**: 3 (initial estimate)
**Estimated Duration**: 2-4 days
**Progress**: 1/3 sessions (33%)

---

## Overview

Phase 00 establishes the secure-default baseline for the dashboard. It contains
the highest-leverage work needed to stop immediate secret leakage and unsafe
side effects while preserving the read-only operator value of the product.

---

## Progress Tracker

| Session | Name | Status | Est. Tasks | Validated |
|---------|------|--------|------------|-----------|
| 01 | Auth and operator elevation foundation | Complete | ~15-20 | 2026-03-31 |
| 02 | Secret containment and token-free operator flows | Not Started | ~15-20 | - |
| 03 | Safe defaults and deployment baseline | Not Started | ~12-18 | - |

---

## Completed Sessions

- Session 01: Auth and operator elevation foundation completed on 2026-03-31.

---

## Upcoming Sessions

- Session 01: Auth and operator elevation foundation
- Session 02: Secret containment and token-free operator flows
- Session 03: Safe defaults and deployment baseline

---

## Objectives

1. Establish secure defaults and server-only env controls for all mutating,
   provider-probing, and message-sending behavior.
2. Contain the highest-risk secret exposure and unauthorized access paths
   without breaking read-only monitoring.
3. Define the operator-facing deployment and documentation baseline for
   localhost and Cloudflare Access access modes.

---

## Prerequisites

- Master PRD roadmap and canonical audit backlog are approved in
  `.spec_system/PRD/PRD.md`.
- Root environment files remain the source of truth for sensitive feature
  controls.
- Read-only monitoring flows remain preserved while hardening lands.

---

## Technical Considerations

### Architecture

The phase should first create a shared server-side protection baseline for
sensitive routes, then remove browser-visible secrets, then lock deployment and
feature-flag defaults around that new boundary. The work should preserve the
read-only operator experience while moving risky actions behind explicit
server-side controls.

### Technologies

- Next.js 16 App Router route handlers and middleware-adjacent auth utilities
- React 19 client surfaces that currently consume dashboard API responses
- TypeScript 5 shared validation and guard helpers
- Root `.env` and `.env.example` configuration for secure defaults
- Cloudflare Access and Cloudflare Tunnel deployment guidance

### Risks

- Auth and elevation scaffolding may break existing operator maintenance flows
  if denial states are not explicit and testable.
- Secret containment work may expose hidden dependencies on browser-side token
  access that need server-side replacements.
- Secure-default toggles can drift unless every sensitive route is documented
  and enforced consistently.

---

## Success Criteria

Phase complete when:
- [ ] All 3 sessions completed
- [x] Sensitive route auth and operator elevation baseline exists
- [ ] `gateway.token` and equivalent secrets are removed from browser-visible
      flows
- [ ] Side effects default to disabled and deployment guidance matches the
      hardened model

---

## Dependencies

### Depends On

- Canonical audit backlog and roadmap captured in `.spec_system/PRD/PRD.md`

### Enables

- Phase 01: Sensitive Route Hardening
