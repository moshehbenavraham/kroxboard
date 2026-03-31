# Session 02: Secret containment and token-free operator flows

**Session ID**: `phase00-session02-secret-containment-and-token-free-operator-flows`
**Status**: Complete
**Estimated Tasks**: ~15-20
**Estimated Duration**: 2-4 hours

---

## Objective

Remove `gateway.token` leakage from API responses, DOM links, and client request
payloads, replace browser token usage with server-side flows, and redact
browser-unneeded sensitive metadata.

---

## Scope

### In Scope (MVP)

- Audit browser-visible payloads, links, and request construction for secret
  leakage
- Replace token-dependent browser flows with server-side mediated behavior
- Sanitize responses so the browser only receives required monitoring data
- Preserve read-only operator workflows after token removal

### Out of Scope

- Full route-boundary hardening across all sensitive endpoints
- Rate limiting and deterministic diagnostics work planned for later phases
- Final verification and documentation closeout work reserved for Phase 03

---

## Prerequisites

- [x] Session 01 auth and operator elevation baseline is available
- [x] Browser-visible secret exposure paths are enumerated
- [x] Replacement server-side flows are identified for token-dependent features

---

## Deliverables

1. Token-free browser responses and client request payloads
2. Server-side replacements for any browser flow that previously required
   gateway credentials
3. Redaction rules for sensitive metadata not needed by the browser

---

## Success Criteria

- [x] `gateway.token` is absent from browser-visible API payloads and DOM links
- [x] Client requests no longer carry gateway secrets
- [x] Read-only monitoring flows still function without browser token access
- [x] The session reduces direct secret-exposure risk before later hardening
