# Considerations

> Institutional memory for AI assistants. Updated between phases via carryforward.
> **Line budget**: 600 max | **Last updated**: Phase 03 (2026-03-31)

---

## Active Concerns

Items requiring attention in upcoming phases. Review before each session.

### Technical Debt
<!-- Max 5 items -->

- [P03] **Accepted Windows fallback risk**: `lib/openclaw-cli.ts` still has a `cmd.exe` quoting fallback. Keep it isolated unless Windows becomes a supported deployment target.
- [P03] **Future browser persistence must stay bounded**: any new client-side storage should use TTL, pruning, and malformed-state cleanup instead of raw `localStorage`.

### External Dependencies
<!-- Max 5 items -->

- [P03] **Cloudflare Access remains the non-local auth boundary**: the documented Access plus Tunnel model is still the supported operator path outside localhost.
- [P03] **Browser APIs vary by runtime**: client persistence and visibility-aware polling assume standard DOM behavior; keep SSR and test harnesses aligned with that boundary.

### Performance / Security
<!-- Max 5 items -->

- [P03] **Accepted residual risk must stay explicit**: SYN-29 remains intentionally accepted and should be re-opened immediately if the deployment model expands.
- [P03] **Sanitized failure contracts still matter**: future route work should preserve token-free responses, stable error shapes, and fail-closed path validation.

### Architecture
<!-- Max 5 items -->

- [P03] **Shared helpers remain the default composition point**: new route, polling, storage, and path logic should reuse `lib/*` helpers instead of duplicating page-local behavior.
- [P03] **Closeout evidence should reconcile all canonical registers together**: findings, security posture, and spec-system summaries need to move in lockstep during future phases.

---

## Lessons Learned

Proven patterns and anti-patterns. Reference during implementation.

### What Worked
<!-- Max 15 items -->

- [P03] **Atomic alert-config writes**: one serialized helper plus rename-and-swap persistence eliminated partial-file risk and kept route code small.
- [P03] **Defensive cache cloning at the boundary**: cloning on cache set/get prevented shared-reference mutation without forcing callers to remember copies.
- [P03] **Validated runtime-path helpers**: central boundary checks made invalid roots and override drift fail closed with stable sanitized errors.
- [P03] **Bounded browser storage envelopes**: TTL, pruning, and malformed-state cleanup let UI state restore safely without indefinite retention.
- [P03] **Shared visibility-aware polling**: one helper removed duplicate timers, paused hidden tabs, and backed off after failures.
- [P03] **Reusable destructive-action confirmation**: a shared dialog kept toolbar and keyboard paths consistent while preserving focus and cancellation behavior.
- [P03] **Closeout register reconciliation**: updating the canonical findings register, master security plan, and cumulative posture file together prevented stale status drift.

### What To Avoid
<!-- Max 10 items -->

- [P03] **Raw `localStorage` persistence**: unbounded browser state creates stale-data and malformed-payload problems.
- [P03] **Page-local polling intervals**: independent timers duplicate work and make hidden-tab behavior drift across components.
- [P03] **Route-local parsing and shared mutable objects**: duplicating normalization or returning shared references reintroduces fragile state handling.
- [P03] **Leaving accepted risks implicit**: closeout should document the rationale and re-entry trigger instead of burying residual risk in prose.

### Tool/Library Notes
<!-- Max 5 items -->

- [P03] **`lib/alert-config.ts`**: canonical alert-config normalization and atomic persistence helper.
- [P03] **`lib/client-persistence.ts`**: shared bounded browser-storage helper for TTL and pruning.
- [P03] **`lib/client-polling.ts`**: shared visibility-aware polling helper with dedupe and backoff.
- [P03] **`lib/openclaw-paths.ts`**: validated runtime-root and derived path helpers that fail closed.

---

## Resolved

Recently closed items (buffer - rotates out after 2 phases).

| Phase | Item | Resolution |
|-------|------|------------|
| P03 | Atomic alert config writes | Added serialized atomic persistence and cleanup-safe writes in `lib/alert-config.ts`. |
| P03 | Mutable config cache | Defensive cloning on cache set and get removed shared-reference mutation risk. |
| P03 | Environment path overrides need a hard boundary | Validated runtime-root and derived path helpers now reject invalid overrides. |
| P03 | Browser storage retention limits | Bounded browser persistence now applies TTL, pruning, and malformed-state cleanup. |
| P03 | Security headers are still incomplete | Middleware now applies the closeout-safe header tightening and CSP behavior. |
| P03 | Read-heavy routes must keep bounded budgets | Shared async read helpers and shared polling preserved bounded work on hot read paths. |
| P02 | Write payload ceilings on alert, model, and layout routes | Added bounded JSON parsing and no-write/no-gateway denial behavior before privileged work could start. |
| P02 | Duplicate runtime bridge behavior | Consolidated on shared OpenClaw bridge helpers and boundary-checked runtime resolvers. |
| P02 | CLI mixed-output parsing leaks | Hardened the parse contract and mapped malformed output to stable failures. |
| P02 | Heavy read routes without bounds or dedupe | Added bounded async read helpers, cache reuse, and sanitized failure contracts. |
| P02 | Skills route JSON parse crashes | Moved skills discovery and content reads onto safe async helpers with explicit error mapping. |

---

*Auto-generated by carryforward. Manual edits allowed but may be overwritten.*
