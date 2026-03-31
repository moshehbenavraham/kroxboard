# Considerations

> Institutional memory for AI assistants. Updated between phases via /carryforward.
> **Line budget**: 600 max | **Last updated**: Phase 00 (2026-03-31)

---

## Active Concerns

Items requiring attention in upcoming phases. Review before each session.

### Technical Debt
<!-- Max 5 items -->

- [P01] **Duplicate CLI bridge code**: `model-probe.ts` and `gateway-health/route.ts` still mirror OpenClaw CLI invocation logic. Keep the canonical bridge in `lib/openclaw-cli.ts` as the single source of truth when Phase 02 work resumes.
- [P02] **Synchronous filesystem I/O in request paths**: Several route handlers still use `readFileSync` in hot paths. Convert the remaining request-time reads to `fs/promises` before load increases.
- [P03] **Mutable config cache**: `lib/config-cache.ts` returns shared object references. Future handlers must treat cached config as immutable or clone before mutation.
- [P03] **Non-atomic alert config writes**: `alerts/route.ts` still needs rename-and-swap semantics to avoid partial writes and crash corruption.
- [P03] **Unbounded `localStorage` accumulation**: Client-side state still grows without pruning. Add a bounded retention policy before the client store expands further.

### External Dependencies
<!-- Max 5 items -->

- [P01] **Gateway token remains a single high-value credential**: The browser leak is fixed, but the gateway still depends on one static token. Rotation and scoping are outside dashboard control.
- [P01] **Cloudflare Access/Tunnel is still the non-local auth boundary**: The app relies on a deployment assumption, not cryptographic JWT verification in-app. Revisit if the network path changes.
- [P01] **GitHub release checks can still hit rate limits**: `/api/pixel-office/version/route.ts` needs cache discipline if cache-bypass patterns show up again.

### Performance / Security
<!-- Max 5 items -->

- [P01] **30 audit findings remain open**: Phase 00 closed the token-leak, GET-alias, Docker bind, and browser-metadata exposure classes, but the broader hardening backlog is still active.
- [P02] **Security headers and CSP still need tightening**: Middleware coverage remains partial, and `unsafe-inline`/`unsafe-eval` should be revisited after the route hardening stabilizes.
- [P02] **Read-heavy endpoints still need bounds**: Analytics and other heavy reads still need caching, concurrency caps, and file-size limits.

### Architecture
<!-- Max 5 items -->

- [P01] **Auth guard coverage still depends on route discipline**: The Phase 00 baseline exists, but future sensitive routes still need a default-deny pattern so a missed guard cannot reopen access.
- [P02] **Config-sourced path overrides still need an allowlist boundary**: `OPENCLAW_HOME` and cron-store path resolution remain sensitive until the path-boundary work lands.
- [P02] **Client polling still needs auth-aware backoff**: The alert monitor now has a safer baseline, but the polling model should stay bounded and explicit as later phases refine it.

---

## Lessons Learned

Proven patterns and anti-patterns. Reference during implementation.

### What Worked
<!-- Max 15 items -->

- [P00] **Shared server-side route guards**: Centralizing sensitive-route enforcement prevented expensive or unsafe work from starting on untrusted requests.
- [P00] **HTTP-only signed elevation cookie**: The challenge flow stayed server-verifiable, bounded by TTL, and invisible to client JavaScript.
- [P00] **Same-origin gateway mediation**: Browser-facing launch paths kept gateway credentials server-side while preserving operator UX.
- [P00] **Server-only feature-flag helpers**: Typed disabled-response helpers kept the UI and API contracts aligned when sensitive behavior was turned off.
- [P00] **Dry-run-first diagnostics**: Making dry-run the explicit default reduced ambiguity between "disabled" and "failed" operator states.
- [P00] **Sanitized browser payloads**: Redacted config and skills responses preserved the dashboard experience without leaking token-bearing or filesystem-only fields.
- [P00] **Co-located security tests**: Security-critical tests alongside the helpers caught edge cases early and made the phase easier to verify.
- [P00] **Comprehensive audit documentation**: The PRD appendices, security register, and session summaries gave the phase a clear trace from finding to fix.

### What to Avoid
<!-- Max 10 items -->

- [P00] **Returning full config objects to browser clients**: Always strip secrets before serialization, even when the caller is only rendering read-only UI.
- [P00] **GET handlers for side-effect routes**: Side effects must reject GET and require the intended non-GET method.
- [P00] **Duplicating bridge/CLI code across files**: Divergent copies drift and make later fixes harder to land once.
- [P00] **Trusting config-sourced file paths without validation**: Path values from config or env must pass through a shared boundary check before any filesystem access.
- [P00] **Auto-polling on page load without auth gates**: Unauthenticated mount-time requests amplify volume and widen the abuse surface.

### Tool/Library Notes
<!-- Max 5 items -->

- [P00] **Next.js middleware runs at the edge**: Keep Node-only auth verification in route handlers, not middleware.
- [P00] **Biome handles formatting and linting**: The existing Biome plus `lint-staged` setup remains the baseline; no separate ESLint path is needed.
- [P00] **Standalone Next.js output is still the right deployment shape**: `output: "standalone"` keeps the Docker image predictable and relatively lean.

---

## Resolved

Recently closed items (buffer - rotates out after 2 phases).

| Phase | Item | Resolution |
|-------|------|------------|
| P00 | Gateway auth token leaked to any network client | Removed `gateway.token` from browser-visible payloads and switched client launch flows to same-origin mediation. |
| P00 | Zero-click side-effect triggering via `GET` aliases | Removed GET side-effect aliases and now return 405 for side-effect GET requests. |
| P00 | Docker default binds to all network interfaces | Changed the Dockerfile default bind to `127.0.0.1` and aligned deployment guidance. |
| P00 | Platform identity metadata and user IDs disclosed | Redacted browser-visible config and health payloads so token-bearing and identity-only fields stay server-side. |
| P00 | Absolute filesystem paths in skill listings | Sanitized skills responses so browser-visible data no longer exposes absolute filesystem paths. |

---

*Auto-generated by /carryforward. Manual edits allowed but may be overwritten.*
