# Session 01: Auth and operator elevation foundation

**Session ID**: `phase00-session01-auth-and-operator-elevation-foundation`
**Status**: Not Started
**Estimated Tasks**: ~15-20
**Estimated Duration**: 2-4 hours

---

## Objective

Introduce the app-side sensitive-route auth baseline, operator code challenge,
signed elevated-session cookie scaffolding, and shared route guards.

---

## Scope

### In Scope (MVP)

- Define the server-side operator elevation flow for sensitive routes
- Add shared auth or guard utilities that route handlers can adopt
- Establish cookie signing, expiry, and denial-state behavior
- Document the required root env values for operator code and cookie signing

### Out of Scope

- Applying the finalized guard logic to every remaining sensitive route
- Broader rate limiting, diagnostics hardening, or read-path performance work
- Final documentation closeout beyond the auth baseline needed for adoption

---

## Prerequisites

- [ ] Master PRD and Phase 00 PRD remain the source of truth for this session
- [ ] Root `.env` and `.env.example` are available for new server-only secrets
- [ ] Existing sensitive routes are identified before guard rollout begins

---

## Deliverables

1. Shared auth and operator-elevation primitives for sensitive server flows
2. HTTP-only signed elevated-session cookie scaffolding with bounded TTL
3. Baseline env documentation and operator-facing denial or challenge states

---

## Success Criteria

- [ ] Sensitive routes can depend on a common server-side auth baseline
- [ ] Operator elevation requires the documented secret challenge flow
- [ ] Cookie issuance and verification are bounded, explicit, and testable
- [ ] The session leaves a clean foundation for Phase 00 Session 02 and 03
