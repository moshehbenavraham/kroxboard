# Session 03: Abuse resistance and deterministic diagnostics

**Session ID**: `phase01-session03-abuse-resistance-and-deterministic-diagnostics`
**Status**: Complete
**Estimated Tasks**: ~15-20
**Estimated Duration**: 2-4 hours

---

## Objective

Add rate limits and security headers, remove alert self-SSRF and random cron
placeholders, and keep live-send diagnostics explicit opt-in.

---

## Scope

### In Scope (MVP)

- Add bounded rate limiting to abuse-prone diagnostics and probe routes
- Tighten security header coverage where this phase's route changes depend on
  it
- Remove self-SSRF and randomized notification behavior from alert-check and
  related diagnostic flows
- Preserve dry-run-first behavior while keeping live-send diagnostics behind
  explicit operator controls

### Out of Scope

- Full read-path caching and concurrency work planned for Phase 02
- Client-side polling cleanup outside the flows required by this session
- Final project verification and documentation closeout work from Phase 03

---

## Prerequisites

- [x] Session 02 route enforcement baseline is in place on the targeted
      diagnostic endpoints
- [x] Existing dry-run and live-send feature flags are documented and tested
- [x] Security header changes are reviewed for compatibility with current UI
      behavior

---

## Deliverables

1. Rate limits and abuse controls for high-risk diagnostic or probe routes
2. Deterministic alert-check behavior without random live-send placeholders or
   self-SSRF patterns
3. Security-header and dry-run-first behavior updates with supporting tests

---

## Success Criteria

- [x] Abuse-prone diagnostics are bounded by explicit rate or retry controls
- [x] Alert-check and related flows behave deterministically without surprise
      live sends
- [x] Security headers and feature-flag behavior remain compatible with the
      hardened operator workflow
