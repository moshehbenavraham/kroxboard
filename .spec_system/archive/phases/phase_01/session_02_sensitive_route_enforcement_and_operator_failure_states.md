# Session 02: Sensitive route enforcement and operator failure states

**Session ID**: `phase01-session02-sensitive-route-enforcement-and-operator-failure-states`
**Status**: Not Started
**Estimated Tasks**: ~12-18
**Estimated Duration**: 2-4 hours

---

## Objective

Apply non-GET enforcement, origin checks, attacker-input validation, and clear
operator-facing denial states across write and side-effect endpoints.

---

## Scope

### In Scope (MVP)

- Extend shared sensitive-route enforcement to the remaining write and
  side-effect endpoints in scope for this phase
- Add origin validation or equivalent cross-site request protection on
  mutating routes
- Validate attacker-controlled inputs before they reach gateway or runtime
  mutation helpers
- Surface consistent operator-facing denial or disabled states in the UI where
  sensitive actions can fail

### Out of Scope

- Per-route rate limiting and abuse throttling for diagnostic endpoints
- Broader performance or caching improvements for read-heavy routes
- Final documentation closeout and residual risk acceptance work

---

## Prerequisites

- [ ] Session 01 path and route-boundary helpers are available for reuse
- [ ] Phase 00 feature-flag and operator-elevation baseline remains the
      required gate for sensitive work
- [ ] Sensitive write and side-effect routes are mapped to their UI denial
      states before rollout begins

---

## Deliverables

1. Consistent method, origin, and auth enforcement across sensitive routes
2. Input validation coverage for gateway-bound and write-path request data
3. Clear operator-facing failure states for denied, disabled, or invalid
   sensitive actions

---

## Success Criteria

- [ ] Sensitive routes reject unexpected methods and cross-origin mutation
      attempts
- [ ] Attacker-controlled inputs are validated before gateway or write helpers
      execute
- [ ] Operator-facing surfaces distinguish denied, disabled, and invalid
      request states clearly
