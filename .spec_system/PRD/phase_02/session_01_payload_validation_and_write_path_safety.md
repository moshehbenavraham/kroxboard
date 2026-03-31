# Session 01: Payload validation and write-path safety

**Session ID**: `phase02-session01-payload-validation-and-write-path-safety`
**Status**: Not Started
**Estimated Tasks**: ~15-20
**Estimated Duration**: 2-4 hours

---

## Objective

Add schema validation, payload-size limits, and write safety rules to alert,
pixel-office, and similar mutation flows.

---

## Scope

### In Scope (MVP)

- Inventory the write-capable routes in scope for this phase and document the
  payload shapes they currently trust
- Add centralized payload parsing and validation before any filesystem write,
  config mutation, or gateway call executes
- Add request or file-size bounds where write paths can accept untrusted input
- Return sanitized operator-facing validation failures and cover the behavior
  with regression tests

### Out of Scope

- OpenClaw bridge deduplication or CLI parsing changes planned for Session 02
- Read-heavy caching and async I/O work planned for Session 03
- Client-side storage cleanup and broader UX polish planned for Phase 03

---

## Prerequisites

- [ ] Phase 01 auth, method, and origin enforcement remains intact on the
      write routes touched here
- [ ] Existing write payloads and persistence paths are inventoried before
      implementation begins
- [ ] Shared server-only feature-flag helpers remain the gate for sensitive
      mutation behavior

---

## Deliverables

1. Centralized payload validation and size guards for targeted write routes
2. Write-path handlers updated to reject malformed or oversize input before any
   persistence or gateway work
3. Regression tests for invalid payloads, bounded writes, and sanitized client
   errors

---

## Success Criteria

- [ ] Targeted write routes reject malformed or oversize payloads with
      sanitized 4xx responses
- [ ] No targeted write route performs filesystem or gateway work before
      payload validation succeeds
- [ ] Tests cover valid payloads, invalid payloads, and write-path safety edge
      cases
