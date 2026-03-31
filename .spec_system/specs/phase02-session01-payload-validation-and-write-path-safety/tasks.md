# Task Checklist

**Session ID**: `phase02-session01-payload-validation-and-write-path-safety`
**Total Tasks**: 15
**Estimated Duration**: 3.0-4.0 hours
**Created**: 2026-03-31

---

## Legend

- `[x]` = Completed
- `[ ]` = Pending
- `[P]` = Parallelizable (can run with other [P] tasks)
- `[SNNMM]` = Session reference (NN=phase number, MM=session number)
- `TNNN` = Task ID

---

## Progress Summary

| Category | Total | Done | Remaining |
|----------|-------|------|-----------|
| Setup | 3 | 3 | 0 |
| Foundation | 4 | 4 | 0 |
| Implementation | 4 | 4 | 0 |
| Testing | 4 | 4 | 0 |
| **Total** | **15** | **15** | **0** |

---

## Setup (3 tasks)

Inventory, budget selection, and failure-policy definition before code changes.

- [x] T001 [S0201] Verify the targeted alert, model-mutation, and pixel-office write-route inventory plus accepted payload shapes in implementation notes (`.spec_system/specs/phase02-session01-payload-validation-and-write-path-safety/implementation-notes.md`)
- [x] T002 [S0201] Document per-route request-size budgets, current validator coverage, and deferred write-integrity exclusions in implementation notes (`.spec_system/specs/phase02-session01-payload-validation-and-write-path-safety/implementation-notes.md`)
- [x] T003 [S0201] Define the malformed-body, oversize-body, and sanitized-denial contract for targeted write routes in implementation notes (`.spec_system/specs/phase02-session01-payload-validation-and-write-path-safety/implementation-notes.md`)

---

## Foundation (4 tasks)

Shared bounded-body and validation primitives.

- [x] T004 [S0201] Implement the shared bounded JSON body reader with `Content-Length` preflight, actual byte enforcement, and sanitized parse failures (`lib/security/request-body.ts`)
- [x] T005 [S0201] Extend invalid-request typing and payload validators for oversize-body handling and alert, model, and layout edge cases with types matching the declared contract and exhaustive enum handling (`lib/security/types.ts`, `lib/security/request-boundary.ts`)
- [x] T006 [S0201] [P] Add unit tests for bounded JSON parsing, malformed JSON, missing length hints, and oversize-body denials (`lib/security/request-body.test.ts`)
- [x] T007 [S0201] [P] Extend request-boundary tests for alert, model-mutation, and pixel-office validation edge cases (`lib/security/request-boundary.test.ts`)

---

## Implementation (4 tasks)

Apply payload limits and validation sequencing to write paths.

- [x] T008 [S0201] Wire route-specific payload budgets and the shared bounded-body helper into the targeted write routes (`app/api/alerts/route.ts`, `app/api/config/agent-model/route.ts`, `app/api/pixel-office/layout/route.ts`)
- [x] T009 [S0201] Harden alert writes with schema-validated input and explicit error mapping before config reads or writes (`app/api/alerts/route.ts`)
- [x] T010 [S0201] Harden model mutations with schema-validated input and explicit error mapping before gateway snapshot, patch, or cache-clear work (`app/api/config/agent-model/route.ts`)
- [x] T011 [S0201] Harden pixel-office layout saves with layout-size enforcement, explicit error mapping, and failure-path handling before filesystem writes (`app/api/pixel-office/layout/route.ts`)

---

## Testing (4 tasks)

Regression coverage and verification evidence.

- [x] T012 [S0201] [P] Extend alert route tests to prove malformed and oversize payloads are rejected before config persistence (`app/api/alerts/route.test.ts`)
- [x] T013 [S0201] [P] Extend model-mutation route tests to prove malformed and oversize payloads are rejected before gateway or cache side effects (`app/api/config/agent-model/route.test.ts`)
- [x] T014 [S0201] [P] Extend pixel-office layout route tests to prove malformed and oversize payloads are rejected before filesystem writes (`app/api/pixel-office/layout/route.test.ts`)
- [x] T015 [S0201] Run focused Vitest coverage, verify ASCII and LF on touched files, manually exercise valid, invalid, and oversize write flows, and record outcomes (`.spec_system/specs/phase02-session01-payload-validation-and-write-path-safety/implementation-notes.md`)

---

## Completion Checklist

Before marking session complete:

- [x] All tasks marked `[x]`
- [x] All tests passing
- [x] All files ASCII-encoded
- [x] implementation-notes.md updated
- [x] Ready for the validate workflow step

---

## Next Steps

Run the `validate` workflow step to verify session completeness.
