# Task Checklist

**Session ID**: `phase00-session02-secret-containment-and-token-free-operator-flows`
**Total Tasks**: 21
**Estimated Duration**: 3.5-4.0 hours
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
| Foundation | 5 | 5 | 0 |
| Implementation | 9 | 9 | 0 |
| Testing | 4 | 4 | 0 |
| **Total** | **21** | **21** | **0** |

---

## Setup (3 tasks)

Leak inventory and contract definition before code changes.

- [x] T001 [S0002] Verify the token-leak and metadata-exposure inventory across config, gateway-health, skills, and chat-link surfaces in implementation notes (`.spec_system/specs/phase00-session02-secret-containment-and-token-free-operator-flows/implementation-notes.md`)
- [x] T002 [S0002] Define the token-free browser contract for gateway launch paths, config payloads, and skills listings in implementation notes (`.spec_system/specs/phase00-session02-secret-containment-and-token-free-operator-flows/implementation-notes.md`)
- [x] T003 [S0002] Create shared same-origin gateway launch helpers and target validation (`lib/gateway-launch.ts`)

---

## Foundation (5 tasks)

Server-only launch path infrastructure and regression scaffolding.

- [x] T004 [S0002] [P] Create unit tests for gateway launch path generation and target validation (`lib/gateway-launch.test.ts`)
- [x] T005 [S0002] Implement the same-origin gateway proxy or launch route with authorization enforced at the boundary closest to the resource, validated upstream paths, timeout, and failure-path handling (`app/gateway/[...path]/route.ts`)
- [x] T006 [S0002] [P] Create route tests for token-free config responses and sanitized platform metadata (`app/api/config/route.test.ts`)
- [x] T007 [S0002] [P] Create route tests for token-free gateway-health responses and same-origin launch paths (`app/api/gateway-health/route.test.ts`)
- [x] T008 [S0002] [P] Create route tests for gateway mediation auth denial, target validation, and upstream credential handling (`app/gateway/[...path]/route.test.ts`)

---

## Implementation (9 tasks)

Remove browser-visible secrets and update client surfaces to the new contract.

- [x] T009 [S0002] Sanitize `/api/config` gateway and platform payloads to remove `gateway.token`, raw direct-message identifiers, and browser-unneeded fields while emitting token-free launch paths (`app/api/config/route.ts`)
- [x] T010 [S0002] Sanitize `/api/gateway-health` to return same-origin launch paths instead of tokenized upstream URLs (`app/api/gateway-health/route.ts`)
- [x] T011 [S0002] Remove absolute skill file paths from the skills list API while keeping skill-content lookup server-side only (`lib/openclaw-skills.ts`, `app/api/skills/route.ts`)
- [x] T012 [S0002] Update skills route tests to prove internal skill locations never reach browser-visible responses (`app/api/skills/route.test.ts`)
- [x] T013 [S0002] Update shared agent-card chat links to use same-origin gateway launch paths with platform-appropriate accessibility labels and no token-bearing DOM URLs (`app/components/agent-card.tsx`)
- [x] T014 [S0002] Update the home-page data contract and cached in-memory state to consume token-free gateway and platform data (`app/page.tsx`)
- [x] T015 [S0002] Update the sessions page to stop sending gateway token in request bodies and open chats through same-origin launch paths with explicit loading and error states (`app/sessions/page.tsx`)
- [x] T016 [S0002] Update pixel-office gateway state, open-chat interactions, and embedded agent cards to use token-free launch data with state revalidation on refresh (`app/pixel-office/page.tsx`)
- [x] T017 [S0002] Update the gateway-status control to follow same-origin launch paths and show a clear unavailable state when launch data is absent (`app/gateway-status.tsx`)

---

## Testing (4 tasks)

Regression coverage and verification evidence.

- [x] T018 [S0002] [P] Extend home-page smoke coverage to assert token-free gateway data reaches client surfaces without regressions (`app/page.test.tsx`)
- [x] T019 [S0002] [P] Run focused route and unit tests for config, gateway-health, gateway mediation, skills, and launch helpers (`app/api/config/route.test.ts`, `app/api/gateway-health/route.test.ts`, `app/gateway/[...path]/route.test.ts`, `app/api/skills/route.test.ts`, `lib/gateway-launch.test.ts`)
- [x] T020 [S0002] Verify home, sessions, pixel-office, gateway-status, and skills flows on the local dev server with no `gateway.token` in API payloads, DOM links, or client request bodies, then record outcomes (`.spec_system/specs/phase00-session02-secret-containment-and-token-free-operator-flows/implementation-notes.md`)
- [x] T021 [S0002] Validate ASCII and LF on all touched files and capture any remaining follow-up items for Session 00-03 or Phase 02 Session 03 (`.spec_system/specs/phase00-session02-secret-containment-and-token-free-operator-flows/implementation-notes.md`)

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
