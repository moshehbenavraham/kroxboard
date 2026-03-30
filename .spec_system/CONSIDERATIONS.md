# Considerations

> Institutional memory for AI assistants. Updated between phases via /carryforward.
> **Line budget**: 600 max | **Last updated**: Pre-Phase 00 baseline (2026-03-31)

---

## Active Concerns

Items requiring attention in upcoming phases. Review before each session.

### Technical Debt
<!-- Max 5 items -->

- [Pre] **Duplicate CLI bridge code**: `model-probe.ts` and `gateway-health/route.ts` re-implement `execOpenclaw` and JSON parsing instead of importing `lib/openclaw-cli.ts`. Divergent behavior across copies is SYN-19; fix lands in 02-02.
- [Pre] **Synchronous filesystem I/O in request paths**: Multiple route handlers use `readFileSync` in hot paths, blocking the Node.js event loop under load (SYN-17). Convert to `fs/promises` in 02-03.
- [Pre] **Config cache returns mutable singleton**: `lib/config-cache.ts` hands out the same object reference to every caller -- mutations in one handler silently corrupt cache for all others (SYN-28, 03-01).
- [Pre] **Non-atomic alert config writes**: `alerts/route.ts` writes JSON without rename-and-swap, risking partial state on crash or concurrent access (SYN-27, 03-01).
- [Pre] **Unbounded `localStorage` accumulation**: Client-side state grows indefinitely with no pruning strategy (SYN-32, 03-02).

### External Dependencies
<!-- Max 5 items -->

- [Pre] **Gateway token is sole credential**: The OpenClaw gateway uses a single static token. Rotation, scoping, and revocation are outside dashboard control -- leaking it (SYN-01) is equivalent to full gateway compromise.
- [Pre] **GitHub API version endpoint has no persistent cache**: `/api/pixel-office/version/route.ts` checks GitHub releases; rate limits are exhaustible via cache bypass (SYN-25, 01-03).
- [Pre] **Cloudflare Access JWT not cryptographically verified**: `operator-identity.ts` decodes the JWT payload for `aud` comparison but does not verify the signature against Cloudflare's JWKS. Sufficient when Cloudflare Tunnel guarantees provenance, but fragile if the network path changes.

### Performance / Security
<!-- Max 5 items -->

- [Pre] **35 open audit findings (5C/8H/12M/10L)**: The March 29-30, 2026 audit identified 35 deduplicated findings. All are open. See `docs/SECURITY_FINDINGS.md` and PRD Appendix A for the full catalog.
- [Pre] **Gateway token leaked to browser**: `/api/config` returns `gateway.token` in JSON; `/api/gateway-health` embeds `?token=` in `webUrl`. Any network client can harvest the token (SYN-01, Critical, 00-02).
- [Pre] **In-memory rate limiter resets on restart**: `middleware.ts` rate limiter uses a module-level `Map` -- restarts clear all buckets, and multi-process deployments don't share state.
- [Pre] **CSP allows `unsafe-inline` and `unsafe-eval`**: Current Content-Security-Policy in middleware permits inline scripts and eval, weakening XSS protection. Tighten after hardening changes stabilize.
- [Pre] **Dockerfile binds `0.0.0.0` by default**: `ENV HOSTNAME="0.0.0.0"` exposes the origin on all interfaces (SYN-10, High, 00-03). Docker run guidance in README already documents loopback override.

### Architecture
<!-- Max 5 items -->

- [Pre] **Auth enforcement is opt-in per handler**: Only routes that call `requireSensitiveRouteAccess` are protected. Edge middleware enforces rate limits and headers but not auth. Forgetting the guard on a new sensitive route silently leaves it open (SYN-02).
- [Pre] **No schema validation on any write payload**: Alert config, pixel-office layout, and model mutation endpoints accept arbitrary JSON bodies without validation (SYN-18, 02-01).
- [Pre] **`OPENCLAW_HOME` env override redirects all reads**: An operator or attacker who controls this variable can point all filesystem operations at arbitrary directories with no allowlist or boundary check (SYN-30, 03-01).
- [Pre] **AlertMonitor fires on every page load**: The client component auto-triggers alert-check and gateway-health requests on mount. When unauthenticated, this amplifies the attack pipeline on every navigation (SYN-12, 01-03/03-02).
- [Pre] **`resolveCronStorePath` trusts config values**: Cron store path resolution follows arbitrary paths sourced from config JSON without path-boundary validation (SYN-22, 01-01/02-02).

---

## Lessons Learned

Proven patterns and anti-patterns. Reference during implementation.

### What Worked
<!-- Max 15 items -->

- [Pre] **Feature flag pattern with `.env.example`**: Six `ENABLE_*` flags with `false` defaults, documented in `.env.example`, provide a clear operator control surface for sensitive behavior. Extend this pattern to every new sensitive route.
- [Pre] **HMAC-SHA256 signed cookie for operator sessions**: `lib/security/operator-session.ts` uses timing-safe comparison, httpOnly, SameSite strict, and configurable TTL. Solid foundation for the elevation layer.
- [Pre] **`requireSensitiveRouteAccess` helper**: Chains env parse, identity resolution, and session verification into one guard. Good pattern -- needs wider adoption across all sensitive routes.
- [Pre] **Co-located Vitest tests in `lib/security/`**: Tests for env parsing, session signing, and identity resolution caught edge cases early. Continue co-locating security-critical tests.
- [Pre] **Standalone Next.js output**: `output: "standalone"` in `next.config.mjs` keeps the Docker image lean and deployment predictable.
- [Pre] **Structured logging with Pino**: Server-side structured logs via `lib/logger.ts` enable operational observability. Needs PII/secret filtering enforcement.
- [Pre] **Comprehensive audit documentation**: The PRD appendices, SECURITY_MASTER, and SECURITY_FINDINGS create a traceable chain from finding to session to fix. Maintain this lineage.

### What to Avoid
<!-- Max 10 items -->

- [Pre] **Returning full config objects to unauthenticated callers**: `/api/config` sends the entire parsed config including `gateway.token`. Always strip secrets before serialization.
- [Pre] **Duplicating bridge/CLI code across files**: `model-probe.ts` and `gateway-health/route.ts` each re-implement OpenClaw CLI invocation instead of importing the canonical `lib/openclaw-cli.ts`. Divergent copies drift and multiply bugs.
- [Pre] **`GET` handlers for side-effect routes**: Several endpoints accepted GET for operations that write state or trigger external calls. Side effects must reject GET and require POST/PATCH/DELETE (SYN-05).
- [Pre] **Trusting config-sourced file paths without validation**: Paths from `openclaw.json` or env variables should pass through a shared path-boundary validator before any `fs` call.
- [Pre] **Auto-polling on page load without auth gates**: Client components that fire network requests on mount without checking auth status amplify unauthenticated request volume and expand the abuse surface.

### Tool/Library Notes
<!-- Max 5 items -->

- [Pre] **Next.js middleware runs at the edge**: Cannot use Node.js `crypto` module in middleware. Auth verification must stay in route handlers (server runtime), not middleware.
- [Pre] **Biome handles both formatting and linting**: Configured in `biome.json` with husky pre-commit hooks via `lint-staged`. No separate ESLint needed.
- [Pre] **Pino + pino-pretty**: `pino-pretty` is a production dependency -- consider moving to devDependencies or removing for production builds to reduce image size.

---

## Resolved

Recently closed items (buffer - rotates out after 2 phases).

| Phase | Item | Resolution |
|-------|------|------------|
| - | *No resolved items yet -- baseline established pre-Phase 00* | - |

---

*Auto-generated by /carryforward. Manual edits allowed but may be overwritten.*
