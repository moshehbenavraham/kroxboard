# Session 02: Runtime bridge consolidation and safe parsing

**Session ID**: `phase02-session02-runtime-bridge-consolidation-and-safe-parsing`
**Status**: Not Started
**Estimated Tasks**: ~12-18
**Estimated Duration**: 2-4 hours

---

## Objective

Deduplicate OpenClaw bridge helpers, harden CLI parsing and execution, validate
config-sourced runtime paths, and fail safely on malformed runtime data.

---

## Scope

### In Scope (MVP)

- Consolidate duplicate OpenClaw bridge logic into shared helpers under `lib/`
- Harden mixed-output parsing, subprocess handling, and runtime-path
  validation used by bridge callers
- Route existing bridge consumers through the shared helper surface with
  sanitized failure behavior
- Add regression tests for malformed runtime output, invalid path overrides,
  and parser edge cases

### Out of Scope

- Read-heavy caching work planned for Session 03
- Client-side monitoring cleanup and localStorage retention work planned for
  Phase 03
- Final project verification and documentation closeout reserved for Phase 03

---

## Prerequisites

- [ ] Session 01 payload validation baseline is in place for routes that also
      depend on shared runtime helpers
- [ ] Existing bridge call sites are mapped before consolidation begins
- [ ] Phase 01 path-boundary helpers remain the single validation boundary for
      config-sourced runtime paths

---

## Deliverables

1. One canonical shared helper surface for OpenClaw bridge execution and
   parsing
2. Hardened runtime parsing and config-path validation with sanitized failure
   handling
3. Regression tests that cover malformed CLI output, invalid runtime paths, and
   safe fallback behavior

---

## Success Criteria

- [ ] Duplicate bridge logic is removed or routed through one shared helper
      surface
- [ ] Malformed runtime output and unsafe path inputs fail closed without
      leaking raw internal details
- [ ] Tests cover parser, path-boundary, and helper reuse regressions
