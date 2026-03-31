# PRD Phase 02: Runtime Boundary and Read Path Hardening

**Status**: In Progress
**Sessions**: 3 (initial estimate)
**Estimated Duration**: 2-4 days
**Progress**: 1/3 sessions (33%)

---

## Overview

Phase 02 shifts the hardening effort from route entry controls to the runtime
boundaries and read-heavy paths that still trust payloads, runtime output, and
filesystem work too much. The goal is to make writes validate and fail early,
make shared bridge logic the only place runtime parsing happens, and keep
read-only monitoring responsive even under larger local data sets.

This phase primarily addresses the remaining write-payload, bridge-duplication,
path-validation, and heavy-read findings called out in the master PRD,
including SYN-18 through SYN-22 plus the read-path portions of SYN-13,
SYN-26, SYN-31, SYN-33, and SYN-35.

---

## Progress Tracker

| Session | Name | Status | Est. Tasks | Validated |
|---------|------|--------|------------|-----------|
| 01 | Payload validation and write-path safety | Complete | ~15-20 | 2026-03-31 |
| 02 | Runtime bridge consolidation and safe parsing | Not Started | ~12-18 | - |
| 03 | Async, cached, sanitized read paths | Not Started | ~15-20 | - |

---

## Completed Sessions

- Session 01: Payload validation and write-path safety

---

## Upcoming Sessions

- Session 02: Runtime bridge consolidation and safe parsing

---

## Objectives

1. Validate incoming write payloads and cap request or file sizes before the
   runtime performs work.
2. Consolidate runtime bridge code so security fixes land once and propagate
   everywhere.
3. Keep read-only monitoring responsive by bounding heavy filesystem work,
   caching hot paths, and minimizing leaked metadata.

---

## Prerequisites

- Phase 01 completed and archived with sensitive-route auth, request-boundary,
  and abuse-control fixes in place.
- Shared route guards, rate limits, and server-only feature flags from Phases
  00-01 remain the baseline for every route touched here.
- The master PRD and `docs/SECURITY_FINDINGS.md` remain the source of truth for
  the remaining runtime and read-path findings.

---

## Technical Considerations

### Architecture

Sequence the work so payload validation lands before write routes keep doing
filesystem or gateway work on untrusted input. After the write surface is
bounded, collapse duplicate runtime bridge code into shared helpers so parsing,
path validation, and failure handling are fixed once. Finish by moving the
heaviest read paths onto async, cached, sanitized helpers that preserve the
dashboard's read-only value without exposing raw internals.

### Technologies

- Next.js 16 App Router route handlers
- TypeScript 5 shared validation and bridge helpers
- Node.js `fs/promises` and bounded filesystem utilities
- Existing OpenClaw runtime bridge modules under `lib/`
- Vitest regression coverage for route, helper, and parser behavior

### Risks

- Stricter payload validation can break existing operator workflows if accepted
  shapes are not inventoried and denial states are not explicit.
- Bridge consolidation can change multiple routes at once, so helper behavior
  needs regression coverage before route call sites switch over.
- Caching and concurrency bounds can hide fresh runtime state or starve valid
  reads if limits are not chosen deliberately.

### Relevant Considerations

- [P01] **Duplicate CLI bridge code**: Treat `lib/openclaw-cli.ts` as the
  canonical bridge and remove mirrored runtime invocation logic instead of
  hardening duplicate copies.
- [P02] **Synchronous filesystem I/O in request paths**: Target remaining hot
  paths for `fs/promises` migration before adding more read traffic.
- [P02] **Read-heavy endpoints still need bounds**: Add caching, concurrency,
  and file-size limits where analytics and similar scans can fan out.
- [P02] **Config-sourced path overrides still need an allowlist boundary**:
  Keep config or env-derived runtime paths behind the shared boundary helper.
- [P00] **Duplicating bridge/CLI code across files**: Reuse one helper surface
  so future runtime fixes land once.
- [P00] **Trusting config-sourced file paths without validation**: Treat every
  runtime path as untrusted until it passes shared boundary checks.

---

## Success Criteria

Phase complete when:
- [ ] All 3 sessions completed
- [ ] Targeted write routes reject malformed or oversize payloads before any
      persistence or gateway work begins
- [ ] Runtime bridge parsing and config-sourced path validation are centralized
      behind shared safe helpers
- [ ] Read-heavy routes avoid request-path sync I/O, apply bounded caching or
      concurrency controls, and return sanitized metadata

---

## Dependencies

### Depends On

- Phase 01: Sensitive Route Hardening

### Enables

- Phase 03: Residual Risk Cleanup and Closeout
