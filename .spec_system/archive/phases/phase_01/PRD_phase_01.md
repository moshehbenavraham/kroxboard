# PRD Phase 01: Sensitive Route Hardening

**Status**: Complete
**Sessions**: 3 (initial estimate)
**Estimated Duration**: 2-4 days
**Progress**: 3/3 sessions (100%)

---

## Overview

Phase 01 hardens the remaining sensitive routes now that the Phase 00 auth and
secure-default baseline exists. The goal is to make every filesystem-touching,
gateway-touching, or side-effect-capable endpoint fail closed unless route
boundaries, request intent, and operator authorization are all valid.

This phase focuses on shared path and request validation first, then consistent
enforcement across the sensitive route surface, then abuse resistance and
deterministic diagnostics so the operator workflow stays controlled under load.

---

## Progress Tracker

| Session | Name | Status | Est. Tasks | Validated |
|---------|------|--------|------------|-----------|
| 01 | Route boundary validation | Complete | ~12-18 | 2026-03-31 |
| 02 | Sensitive route enforcement and operator failure states | Complete | ~12-18 | 2026-03-31 |
| 03 | Abuse resistance and deterministic diagnostics | Complete | ~15-20 | 2026-03-31 |

---

## Completed Sessions

- Session 01: Route boundary validation
- Session 02: Sensitive route enforcement and operator failure states
- Session 03: Abuse resistance and deterministic diagnostics

---

## Upcoming Sessions

- None

---

## Objectives

1. Apply consistent server-side enforcement to every sensitive route after the
   Phase 00 auth baseline exists.
2. Add route-boundary, method, and origin protections before any filesystem
   access, gateway access, provider probing, or writes occur.
3. Reduce abuse potential from operator diagnostics and maintenance endpoints
   while preserving controlled workflows.

---

## Prerequisites

- Phase 00 completed and archived with the auth or operator elevation baseline
  in place.
- Root `.env` and `.env.example` remain the source of truth for sensitive
  feature toggles and operator secrets.
- The master PRD and `docs/SECURITY_FINDINGS.md` remain the canonical security
  backlog for the remaining hardening work.

---

## Technical Considerations

### Architecture

Start with shared route-boundary validation so every later route fix reuses the
same allowlists and guard helpers. After those boundaries exist, apply
consistent method, origin, auth, and denial-state enforcement across the
sensitive endpoints before adding rate limits and deterministic diagnostics on
the abuse-prone paths.

### Technologies

- Next.js 16 App Router route handlers
- TypeScript 5 shared security and validation helpers
- Root server-only environment flags for sensitive diagnostics
- Local OpenClaw filesystem and gateway bridge integration
- Middleware and route-level response hardening where appropriate

### Risks

- Missed sensitive routes can reopen access if guard adoption is inconsistent.
- Stricter request validation can break existing maintenance flows unless
  denial states stay explicit and operator-facing.
- Diagnostic rate limits or deterministic cron behavior can hide expected
  feedback if dry-run and live-send paths are not kept clearly separate.

### Relevant Considerations

- [P01] **Auth guard coverage still depends on route discipline**: Treat shared
  route validation and default-deny patterns as the baseline for every
  sensitive endpoint touched in this phase.
- [P01] **30 audit findings remain open**: Prioritize fixes that close the
  highest-severity auth, validation, and abuse findings before lower-severity
  cleanup.
- [P00] **Shared server-side route guards**: Reuse the centralized enforcement
  pattern from Phase 00 instead of creating route-specific security logic.
- [P00] **GET handlers for side-effect routes**: Preserve the explicit
  non-GET-only pattern when extending enforcement to the remaining sensitive
  routes.

---

## Success Criteria

Phase complete when:
- [x] All 3 sessions completed
- [x] Sensitive routes validate path and request boundaries before filesystem
      or gateway work begins
- [x] Side-effect routes consistently enforce auth, intended methods, origin
      checks, and clear denial states
- [x] Abuse-prone diagnostics are rate-limited, deterministic, and aligned with
      explicit live-send controls

---

## Dependencies

### Depends On

- Phase 00: Foundation

### Enables

- Phase 02: Runtime Boundary and Read Path Hardening
