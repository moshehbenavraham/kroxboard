# Session 03: Async, cached, sanitized read paths

**Session ID**: `phase02-session03-async-cached-sanitized-read-paths`
**Status**: Not Started
**Estimated Tasks**: ~15-20
**Estimated Duration**: 2-4 hours

---

## Objective

Replace sync I/O in request paths, add caching and concurrency bounds, and
sanitize response metadata and error surfaces on read-heavy routes.

---

## Scope

### In Scope (MVP)

- Move the remaining hot-path sync reads in scoped request handlers to async
  helpers
- Add bounded caching, concurrency limits, and file-size guards on heavy read
  routes such as analytics, stats, skills, and similar scans in scope
- Trim browser-visible metadata and sanitize client-facing read errors so
  internals do not leak
- Add regression tests for cache behavior, bounded heavy reads, and sanitized
  read responses

### Out of Scope

- Atomic write fixes and mutable cache cleanup reserved for Phase 03
- Broad client-side polling redesign outside the read-path requirements of this
  phase
- Documentation closeout and accepted-risk decisions reserved for Phase 03

---

## Prerequisites

- [ ] Session 02 shared bridge and parsing helpers are available for reuse on
      affected read paths
- [ ] Read-heavy routes and current sync I/O hotspots are inventoried before
      edits begin
- [ ] Operator-visible response shapes are reviewed so sanitization changes stay
      deliberate

---

## Deliverables

1. Async and bounded read-path helpers for targeted heavy endpoints
2. Read-heavy routes updated with caching, concurrency limits, and sanitized
   response metadata
3. Regression tests covering cache hits, load bounds, and safe read-path error
   handling

---

## Success Criteria

- [ ] Targeted heavy routes avoid request-path sync I/O and respect bounded
      work limits
- [ ] Browser-visible read responses no longer expose unnecessary operational
      metadata or raw internal paths
- [ ] Tests cover cache behavior, concurrency or size bounds, and sanitized
      error surfaces
