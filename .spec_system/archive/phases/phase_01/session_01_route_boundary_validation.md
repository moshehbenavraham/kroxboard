# Session 01: Route boundary validation

**Session ID**: `phase01-session01-route-boundary-validation`
**Status**: Completed
**Estimated Tasks**: ~12-18
**Estimated Duration**: 2-4 hours

---

## Objective

Centralize agent and cron path validation plus shared request-boundary helpers
for sensitive API routes.

---

## Scope

### In Scope (MVP)

- Define strict validation for route params before any filesystem path
  construction or gateway access
- Add shared helpers for approved agent, cron-store, and similar path
  boundaries used by sensitive routes
- Apply the new boundary checks to the highest-risk path-consuming endpoints
- Cover the shared validation behavior with route-level and helper tests

### Out of Scope

- Broad method and origin enforcement rollout across every sensitive mutation
- Rate limiting, security headers, or deterministic diagnostics work
- Read-path caching and async I/O improvements planned for Phase 02

---

## Prerequisites

- [ ] Phase 00 auth and operator elevation baseline remains intact
- [ ] Sensitive path-consuming routes are inventoried before edits begin
- [ ] Existing OpenClaw root and cron-store assumptions are documented in code

---

## Deliverables

1. Shared path-boundary validation helpers for agent and cron access
2. Sensitive routes updated to reject invalid path or route input early
3. Tests that lock the allowlist and traversal protections in place

---

## Success Criteria

- [ ] Sensitive path consumers reject traversal and invalid identifiers before
      filesystem access
- [ ] Shared validation utilities replace route-local path trust where touched
- [ ] Tests cover valid and invalid boundary cases with stable expectations
