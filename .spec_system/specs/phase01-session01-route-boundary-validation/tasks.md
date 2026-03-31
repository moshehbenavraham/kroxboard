# Task Checklist

**Session ID**: `phase01-session01-route-boundary-validation`
**Total Tasks**: 16
**Estimated Duration**: 3.0-3.5 hours
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
| Implementation | 5 | 5 | 0 |
| Testing | 4 | 4 | 0 |
| **Total** | **16** | **16** | **0** |

---

## Setup (3 tasks)

Boundary inventory and failure-policy definition before code changes.

- [x] T001 [S0101] Verify the high-risk path-consuming route inventory and SYN-06, SYN-11, and SYN-22 coverage in implementation notes (`.spec_system/specs/phase01-session01-route-boundary-validation/implementation-notes.md`)
- [x] T002 [S0101] Document the approved OpenClaw root, agent-session, and cron-store assumptions plus fail-closed behavior in implementation notes (`.spec_system/specs/phase01-session01-route-boundary-validation/implementation-notes.md`)
- [x] T003 [S0101] Define the shared request-boundary contract for `agentId`, `sessionKey`, and invalid-input responses with types matching the declared contract and exhaustive enum handling (`lib/security/request-boundary.ts`)

---

## Foundation (4 tasks)

Shared path and request-boundary primitives.

- [x] T004 [S0101] Extend OpenClaw path helpers with strict agent-identifier validation and safe agent-session path resolution (`lib/openclaw-paths.ts`)
- [x] T005 [S0101] Extend OpenClaw path helpers with bounded cron-store resolution and approved-directory checks (`lib/openclaw-paths.ts`)
- [x] T006 [S0101] [P] Write unit tests for request-boundary helpers and invalid-input mapping (`lib/security/request-boundary.test.ts`)
- [x] T007 [S0101] [P] Extend OpenClaw path tests for traversal rejection, allowlist checks, and cron-store boundary behavior (`lib/openclaw-paths.test.ts`)

---

## Implementation (5 tasks)

Apply the shared boundary layer to the highest-risk routes.

- [x] T008 [S0101] Protect the direct `[agentId]` read routes with schema-validated input and explicit error mapping before filesystem access (`app/api/sessions/[agentId]/route.ts`, `app/api/stats/[agentId]/route.ts`)
- [x] T009 [S0101] Replace inline cron-store path trust in agent activity with schema-validated input, explicit error mapping, and graceful fallback behavior (`app/api/agent-activity/route.ts`)
- [x] T010 [S0101] Harden manual session diagnostics with schema-validated `agentId` and `sessionKey` input, explicit error mapping, and authorization enforced at the boundary closest to the resource (`app/api/test-session/route.ts`)
- [x] T011 [S0101] Apply shared agent-session file resolution to DM and platform diagnostic helpers with authorization enforced at the boundary closest to the resource and failure-path handling (`app/api/test-dm-sessions/route.ts`, `app/api/test-platforms/route.ts`)
- [x] T012 [S0101] Apply shared agent-session file resolution to alert-check and model-mutation cleanup helpers with authorization enforced at the boundary closest to the resource and failure-path handling (`app/api/alerts/check/route.ts`, `app/api/config/agent-model/route.ts`)

---

## Testing (4 tasks)

Regression coverage and verification evidence.

- [x] T013 [S0101] [P] Create route tests for traversal rejection and valid-agent access on the sessions and stats routes (`app/api/sessions/[agentId]/route.test.ts`, `app/api/stats/[agentId]/route.test.ts`)
- [x] T014 [S0101] [P] Create route tests for cron-store boundary enforcement and graceful fallback behavior in agent activity (`app/api/agent-activity/route.test.ts`)
- [x] T015 [S0101] [P] Extend diagnostic and mutation route tests to prove invalid identifiers are rejected before filesystem or gateway work begins (`app/api/test-session/route.test.ts`, `app/api/test-dm-sessions/route.test.ts`, `app/api/test-platforms/route.test.ts`, `app/api/alerts/check/route.test.ts`, `app/api/config/agent-model/route.test.ts`)
- [x] T016 [S0101] Run focused Vitest coverage, verify ASCII and LF on touched files, manually exercise traversal and invalid-input denials, and record outcomes (`.spec_system/specs/phase01-session01-route-boundary-validation/implementation-notes.md`)

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

Run the implement workflow step to begin AI-led implementation.
