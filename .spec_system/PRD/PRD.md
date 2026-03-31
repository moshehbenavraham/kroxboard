# OpenClaw Dashboard - Product Requirements Document

## Overview

OpenClaw Dashboard is an operator dashboard for inspecting OpenClaw agents, models, sessions, alerts, skills, statistics, and pixel-office state from the local runtime and gateway environment. It is intended for operators who need one place to observe health, review activity, and perform controlled maintenance actions across an OpenClaw deployment.

The current product already delivers that operator value, but the March 29-30, 2026 security audit found that convenience features also expose gateway secrets, unauthenticated writes, outbound messaging abuse, filesystem trust issues, and denial-of-service risk. This PRD defines the requirements for preserving the dashboard's operator value while moving all sensitive or side-effect behavior behind explicit, safe-by-default controls. The current deployment direction is `board.aiwithapex.com` behind Cloudflare Access plus Cloudflare Tunnel for non-local access.

This PRD is the canonical source of truth for the in-scope audit backlog and remediation plan. `docs/ongoing-projects/` is reserved for one file that tracks work intentionally outside this PRD scope.

## Audit Baseline

- Audit window: March 29-30, 2026
- Reviewed surface: 25 API route files, 5 bridge or library modules, and 6 client-side page components
- Deduplicated finding count: 35 total findings
- Severity mix: 5 Critical, 8 High, 12 Medium, 10 Low
- Dynamic verification: 11 findings confirmed directly against a live dev server with production data
- Validated exploit chains: 3 end-to-end chains
- Canonical risk themes: authentication void, gateway token leakage, unprotected side effects, filesystem trust, and resource exhaustion

## Delivery Plan

This project completes in four phases and twelve implementation sessions. Each session is one clear 2-4 hour objective sized for roughly 12-25 tasks. This roadmap is the planning source of truth for the full PRD scope; later session specs can refine task lists without changing the intended sequencing unless implementation reality forces a regroup.

### Phase Summary

| Phase | Name | Sessions | Objective | Status |
|-------|------|----------|-----------|--------|
| 00 | Foundation | 3 | Contain immediate exposure, establish secure defaults, and lock in the secure deployment model. | Complete |
| 01 | Sensitive Route Hardening | 3 | Close the remaining auth, route-boundary, and abuse-prone gaps on sensitive flows. | Complete |
| 02 | Runtime Boundary and Read Path Hardening | 3 | Validate inputs, bound filesystem and runtime access, and keep heavy read paths safe under load. | In Progress |
| 03 | Residual Risk Cleanup and Closeout | 3 | Resolve remaining hardening items, verify fixes, and close the project with aligned docs and findings. | Not Started |

### Phase 00: Foundation

**Objectives**

1. Establish secure defaults and server-only env controls for all mutating, provider-probing, and message-sending behavior.
2. Contain the highest-risk secret exposure and unauthorized access paths without breaking read-only monitoring.
3. Define the operator-facing deployment and documentation baseline for localhost and Cloudflare Access access modes.

| Session | Name | Clear Objective | Est. Tasks | Status |
|---------|------|-----------------|------------|--------|
| 00-01 | Auth and operator elevation foundation | Introduce the app-side sensitive-route auth baseline, operator code challenge, signed elevated-session cookie scaffolding, and shared route guards. | ~15-20 | Complete |
| 00-02 | Secret containment and token-free operator flows | Remove `gateway.token` leakage from API responses, DOM links, and client request payloads, replace browser token usage with server-side flows, and redact browser-unneeded sensitive metadata. | ~15-20 | Complete |
| 00-03 | Safe defaults and deployment baseline | Disable side effects by default, remove `GET` side-effect aliases, and align root env plus deployment docs around loopback and Cloudflare Access defaults. | ~12-18 | Complete |

### Phase 01: Sensitive Route Hardening

**Objectives**

1. Apply consistent server-side enforcement to every sensitive route after the Phase 00 auth baseline exists.
2. Add route-boundary, method, and origin protections before any filesystem access, gateway access, provider probing, or writes occur.
3. Reduce abuse potential from operator diagnostics and maintenance endpoints while preserving controlled workflows.

| Session | Name | Clear Objective | Est. Tasks | Status |
|---------|------|-----------------|------------|--------|
| 01-01 | Route boundary validation | Centralize agent and cron path validation plus shared request-guard utilities for sensitive API routes. | ~12-18 | Complete |
| 01-02 | Sensitive route enforcement and operator failure states | Apply non-GET enforcement, origin checks, attacker-input validation, and clear operator-facing denial states across write and side-effect endpoints. | ~12-18 | Complete |
| 01-03 | Abuse resistance and deterministic diagnostics | Add rate limits and security headers, remove alert self-SSRF and random cron placeholders, and keep live-send diagnostics explicit opt-in. | ~15-20 | Complete |

### Phase 02: Runtime Boundary and Read Path Hardening

**Objectives**

1. Validate incoming write payloads and cap request or file sizes before the runtime performs work.
2. Consolidate runtime bridge code so security fixes land once and propagate everywhere.
3. Keep read-only monitoring responsive by bounding heavy filesystem work, caching hot paths, and minimizing leaked metadata.

| Session | Name | Clear Objective | Est. Tasks | Status |
|---------|------|-----------------|------------|--------|
| 02-01 | Payload validation and write-path safety | Add schema validation, payload-size limits, and write safety rules to alert, pixel-office, and similar mutation flows. | ~15-20 | Complete |
| 02-02 | Runtime bridge consolidation and safe parsing | Deduplicate OpenClaw bridge helpers, harden CLI parsing and execution, validate config-sourced runtime paths, and fail safely on malformed runtime data. | ~12-18 | Not Started |
| 02-03 | Async, cached, sanitized read paths | Replace sync I/O in request paths, add caching and concurrency bounds, and sanitize response metadata and error surfaces on read-heavy routes. | ~15-20 | Not Started |

### Phase 03: Residual Risk Cleanup and Closeout

**Objectives**

1. Eliminate remaining low-severity security debt and convenience fallbacks that can undermine the hardened model.
2. Tighten browser-side and operational behavior so local usage stays predictable and bounded.
3. Finish with verification evidence and synchronized security documentation.

| Session | Name | Clear Objective | Est. Tasks | Status |
|---------|------|-----------------|------------|--------|
| 03-01 | State, cache, and environment hardening | Make sensitive writes atomic, return safe cache copies, validate startup environment assumptions, and close remaining low-level runtime hazards. | ~12-18 | Not Started |
| 03-02 | Client and operational cleanup | Bound local storage, remove risky logging and fallback behaviors, add destructive-action confirmations, deduplicate recurring client-side monitors, and trim residual reconnaissance leaks. | ~12-18 | Not Started |
| 03-03 | Verification and closeout | Run the final validation matrix, reconcile findings and docs, and record any accepted or deferred residual risks with rationale. | ~15-20 | Not Started |

## Goals

1. Preserve the dashboard's read-only monitoring value for OpenClaw operators.
2. Remove browser-visible secret leakage and unauthorized access to runtime configuration, filesystem data, and operational metadata.
3. Ensure every feature that can send messages, trigger provider calls, or change persisted state is disabled by default and only enabled through documented root `.env` and `.env.example` toggles.
4. Implement audit findings that can be fixed without removing core operator functionality, and document any accepted or deferred exceptions.
5. Maintain a living security program in `docs/SECURITY_MASTER.md` and `docs/SECURITY_FINDINGS.md` that stays aligned with code and deployment guidance.
6. Keep this PRD as the canonical in-scope remediation source so `docs/ongoing-projects/` only contains work that is explicitly outside the current project scope.

## Non-Goals

- Replacing the OpenClaw gateway or redesigning its underlying authentication model.
- Turning the dashboard into a multi-tenant or public SaaS product.
- Adding a database or moving runtime state out of the local OpenClaw filesystem.
- Building a full app-native user account and session product surface for Phase 00 when authenticated reverse-proxy deployment and minimal server-side guards meet the operator use case.
- Expanding operator features that are unrelated to the audited security posture.
- Preserving unsafe convenience behavior when it conflicts with secret protection or safe defaults.
- Keeping detailed per-chunk audit notebooks in `docs/ongoing-projects/` once the in-scope backlog has been normalized into this PRD.

## Users and Use Cases

### Primary Users

- **OpenClaw operator**: Maintains a local or self-hosted OpenClaw deployment and needs visibility into agents, sessions, models, alerts, and health.
- **Security maintainer**: Reviews findings, tracks remediation status, and verifies that safe defaults remain enforced over time.

### Key Use Cases

1. Operator can inspect agents, sessions, stats, skills, alerts, and gateway health without exposing gateway tokens or platform credentials to the browser.
2. Operator can reach the dashboard remotely at `board.aiwithapex.com` through Cloudflare Access while the origin stays private behind Cloudflare Tunnel.
3. Operator can explicitly enable, use, and disable mutating or message-sending features through root environment toggles when maintenance tasks require them.
4. Security maintainer can review a deduplicated findings register and remediation plan in `docs/` and keep those records aligned with the codebase.
5. Security maintainer can use this PRD as the canonical in-scope audit backlog while a single ongoing-project tracker captures explicitly excluded work.
6. Operator can continue using the dashboard when all state-changing and outbound-test features are disabled.

## Requirements

### MVP Requirements

- Operator can view dashboard read-only data without receiving `gateway.token`, tokenized gateway URLs, absolute filesystem paths, or raw platform identifiers in browser-visible responses.
- Operator can enable mutating or side-effect features only through explicit root `.env` and `.env.example` flags that default to disabled.
- Operator can rely on server-only env flags for sensitive behavior; these controls must never use `NEXT_PUBLIC_` variables or any other browser-visible env path.
- Operator can access non-local deployments through the dedicated Cloudflare Access-protected subdomain `board.aiwithapex.com`, which reaches a loopback-only origin over Cloudflare Tunnel.
- Operator can use the same Cloudflare Access pattern as the existing OpenClaw UI for this dashboard.
- Operator can use approved-email One-Time PIN as the primary Cloudflare Access login method for the dashboard.
- Operator can rely on a Cloudflare Access application or policy session duration capped at 24 hours for the dashboard.
- Operator access through Cloudflare Access can be restricted to `moshehwebservices@live.com`.
- Server can enforce a second protection layer for sensitive routes after Cloudflare Access by requiring an operator code challenge that issues an HTTP-only signed cookie for elevated actions.
- Server can keep the operator code secret and cookie-signing secret in root `.env`, with documented placeholders in root `.env.example`.
- Server can scope the elevated operator session for sensitive routes to 12 hours or less.
- Operator can use dry-run diagnostics as the default maintenance path for outbound test actions, while live-send diagnostics remain explicit opt-in behavior behind env flags.
- Operator can keep model changes, alert writes, pixel-office layout writes, provider probes, outbound messaging tests, and any future state-changing or message-sending route disabled by default in every environment.
- Operator can keep all state-changing and outbound-test features disabled by default in local development as well as production-like deployments.
- Server can reject any state-changing or side-effect route request when its corresponding env flag is disabled.
- Server can reject side-effect requests sent via `GET` and only accept the intended non-GET methods.
- Server can validate route params and request bodies before filesystem access, gateway access, or persistent writes.
- Server can constrain agent and cron-store path resolution to approved OpenClaw directories.
- Server can sanitize client-facing error responses and avoid exposing internal paths, secrets, or raw provider errors.
- Server can add security response headers and remove browser-visible token propagation from DOM links, request bodies, and cached client state.
- Server can cache or rate-limit heavy and abuse-prone endpoints so that read-only monitoring remains usable under normal operator load.
- Maintainer can keep a living master security plan in `docs/SECURITY_MASTER.md`.
- Maintainer can keep a living deduplicated findings register in `docs/SECURITY_FINDINGS.md`.
- Maintainer can mark each audit finding as open, in progress, fixed, or verified without losing the normalized PRD-level delivery mapping.
- Maintainer can implement fixable audit findings when the fix does not remove documented operator functionality.
- Maintainer can document any finding that is deferred, accepted, or partially mitigated with rationale and validation notes.
- Maintainer can keep `docs/ongoing-projects/` limited to one file that only tracks work outside this PRD scope.

### Deferred Requirements

- Operator can rotate or scope gateway credentials independently of the dashboard.
- Operator can rely on session archival and data-retention controls for very large local stores.
- Operator can adopt stronger host-level isolation such as read-only mounts or connection-limiting reverse proxies once the dashboard hardening work is complete.

## Non-Functional Requirements

- **Performance**: Read-only operator pages remain functional with mutating features disabled, cached analytics endpoints serve repeat requests within 500 ms, and no production route performs unbounded filesystem scans without cache or rate limiting.
- **Security**: All routes that change state, send messages, or exercise external or provider credentials are disabled by default in all environments, require explicit server-only env enablement in root `.env` and `.env.example`, reject `GET`, and return 401, 403, or 405 when not allowed. No browser-visible response, DOM node, or client request payload may contain `gateway.token`.
- **Reliability**: With all sensitive feature flags disabled, the current read-only dashboard routes continue returning successful operator responses and do not require outbound messaging or config mutation to function.
- **Accessibility**: Primary operator actions keep visible text labels and keyboard-triggerable controls after hardening, and any newly added security controls expose clear operator-facing failure states.
- **Documentation Integrity**: The canonical in-scope backlog exists in this PRD, the current status exists in `docs/SECURITY_FINDINGS.md`, and `docs/ongoing-projects/` contains only the single out-of-scope tracker file.

## Constraints and Dependencies

- The dashboard is a Next.js App Router application with React, TypeScript, and Tailwind CSS already in place.
- Runtime state is sourced from the local OpenClaw filesystem and gateway bridge rather than a database.
- Sensitive behavior must be controlled from root `.env` and `.env.example`, not hidden inside code-only defaults.
- Sensitive behavior must be driven by server-only env variables rather than `NEXT_PUBLIC_` variables or any other browser-visible configuration path.
- This PRD's Appendix A through Appendix D are the authoritative in-scope normalization of the March 29-30, 2026 audit backlog.
- `docs/ongoing-projects/security-items-outside-prd-scope.md` is the only allowed ongoing-project tracker for security work and must contain only items outside this PRD scope.
- Fixes must preserve the documented read-only monitoring value of the existing product.
- Docker remains an in-scope deployment path and must receive secure default guidance.
- Security documentation must explicitly cover localhost-only development and the primary non-local deployment mode of `board.aiwithapex.com` behind Cloudflare Access and Cloudflare Tunnel to a loopback-bound origin.
- Cloudflare Access is the preferred operator auth boundary for non-local access.
- Cloudflare Access session duration for the dashboard should be capped at 24 hours.
- Approved-email One-Time PIN access is the primary Cloudflare Access login method for the dashboard.
- Cloudflare Access for the dashboard should allow `moshehwebservices@live.com`.
- A second protection layer after Cloudflare Access is required for sensitive routes, and the chosen mechanism is an app-side operator code with an HTTP-only signed cookie for elevated actions.
- The operator code secret and cookie-signing secret must live in root `.env`, with corresponding keys documented in root `.env.example`.
- The elevated operator session for sensitive routes should last no more than 12 hours.
- Direct internet exposure without authenticated reverse-proxy protection is unsupported.
- Secondary authenticated reverse-proxy recipes may be documented later, but Cloudflare Access plus Tunnel is the current standard deployment plan.
- A full app-native session product is out of scope unless future product requirements add true multi-user access.

## Technical Stack

- Next.js 16 App Router - current UI shell and API routing model
- React 19 - client-side operator interactions
- TypeScript 5 - typed route, utility, and component changes
- Tailwind CSS 4 - current styling system
- Local OpenClaw filesystem and gateway APIs - runtime source of truth
- Docker - packaged deployment path and exposure surface

## Success Criteria

- [ ] `gateway.token` is absent from browser-visible API payloads, DOM links, and client request bodies.
- [ ] All state-changing and message-sending routes are disabled by default and documented in root `.env.example`.
- [ ] Sensitive feature flags are server-only and do not rely on `NEXT_PUBLIC_` variables.
- [ ] GET requests to side-effect routes return `405 Method Not Allowed`.
- [ ] Non-local access is documented and supported through `board.aiwithapex.com` behind Cloudflare Access and Cloudflare Tunnel to a loopback-only origin.
- [ ] Cloudflare Access session duration for the dashboard is set to 24 hours or less.
- [ ] Cloudflare Access allows `moshehwebservices@live.com` for the dashboard.
- [ ] Approved-email One-Time PIN is the primary Cloudflare Access login method for the dashboard.
- [ ] Sensitive routes require the app-side operator code layer in addition to Cloudflare Access.
- [ ] The operator code secret and cookie-signing secret live in root `.env` and are documented in root `.env.example`.
- [ ] The elevated operator session for sensitive routes lasts 12 hours or less.
- [ ] Dry-run diagnostics exist for outbound test workflows before any live-send path is enabled by default.
- [ ] Read-only dashboard pages continue working when all sensitive feature flags are off.
- [ ] Security documentation covers localhost-only and Cloudflare Access plus Tunnel deployment, and marks direct unauthenticated internet exposure unsupported.
- [ ] `docs/SECURITY_MASTER.md` and `docs/SECURITY_FINDINGS.md` exist and are linked to the canonical PRD backlog.
- [ ] `docs/ongoing-projects/` contains only `security-items-outside-prd-scope.md`.
- [ ] Fixable audit findings are either implemented or explicitly tracked as deferred or accepted with rationale.

## Risks

- Security fixes may remove convenience behavior that operators currently use informally.
- Root env toggle design may become inconsistent if not centralized and documented rigorously.
- Some mitigations depend on choosing an authentication boundary that matches real deployment patterns.
- Read-only and side-effect behavior may stay coupled unless server and client responsibilities are separated carefully.
- Heavy local data sets may still require follow-up work after the first hardening pass.

## Assumptions

- The dashboard remains an operator-facing tool for trusted environments rather than a public multi-user product.
- Read-only monitoring flows are core functionality and must remain available even when all sensitive toggles are disabled.
- The normalized audit backlog in this PRD accurately captures the work needed from the March 29-30, 2026 review.
- Root `.env` and `.env.example` toggles are an acceptable control point for sensitive features in this codebase.
- Non-local deployments can rely on Cloudflare Access plus Cloudflare Tunnel as the primary operator-access boundary.
- `board.aiwithapex.com` will reuse the same owner-only Access pattern already used by the OpenClaw UI.

## Remaining Open Questions

- None at the PRD level. Remaining choices are implementation details such as exact cookie naming, the precise elevated-session TTL, and whether Cloudflare Access JWT validation is enforced in the same pass as the operator code layer.

## Appendix A: Canonical In-Scope Finding Catalog

This appendix replaces the historical multi-file audit notebooks as the normalized source of truth for in-scope work. `docs/SECURITY_FINDINGS.md` tracks live status against these canonical finding IDs.

### Critical Findings

| ID | Canonical Finding | Primary Delivery Coverage |
|----|-------------------|---------------------------|
| SYN-01 | Gateway auth token leaked to any network client | 00-02 |
| SYN-02 | No application-level authentication | 00-01 |
| SYN-03 | Unauthenticated permanent runtime configuration mutation | 00-01, 00-03, 01-02 |
| SYN-04 | Unauthenticated outbound messaging to real users | 00-03, 01-03 |
| SYN-05 | Zero-click side-effect triggering via `GET` aliases | 00-03 |

### High Findings

| ID | Canonical Finding | Primary Delivery Coverage |
|----|-------------------|---------------------------|
| SYN-06 | Path traversal via unvalidated `[agentId]` URL segments | 01-01 |
| SYN-07 | CSRF on all mutating endpoints | 01-02 |
| SYN-08 | LLM API credit exhaustion and self-SSRF amplification | 01-03 |
| SYN-09 | External platform rate limit lockout | 01-03 |
| SYN-10 | Docker default binds to all network interfaces | 00-03 |
| SYN-11 | Attacker-controlled inputs forwarded to gateway | 01-01, 01-02 |
| SYN-12 | AlertMonitor auto-triggers full attack pipeline on every page load | 01-03, 03-02 |
| SYN-13 | Uncached heavy endpoints with cascading unbounded reads | 01-03, 02-03 |

### Medium Findings

| ID | Canonical Finding | Primary Delivery Coverage |
|----|-------------------|---------------------------|
| SYN-14 | Missing security response headers | 01-03 |
| SYN-15 | Platform identity metadata and user IDs disclosed | 00-02, 02-03 |
| SYN-16 | Absolute filesystem paths in skill listings | 00-02, 02-03 |
| SYN-17 | Synchronous I/O blocks Node.js event loop | 02-03 |
| SYN-18 | No input validation on write payloads | 02-01 |
| SYN-19 | Duplicate CLI bridge with divergent behavior | 02-02 |
| SYN-20 | CLI output injection via `parseJsonFromMixedOutput` | 02-02 |
| SYN-21 | Unbounded file reads without size limits | 02-03 |
| SYN-22 | `resolveCronStorePath` follows arbitrary config-sourced paths | 01-01, 02-02 |
| SYN-23 | Random-based cron alert logic sends real notifications | 01-03 |
| SYN-24 | Platform credentials exercised without auth | 00-03, 01-03 |
| SYN-25 | GitHub API rate limit exhaustible via cache bypass | 01-03 |

### Low Findings

| ID | Canonical Finding | Primary Delivery Coverage |
|----|-------------------|---------------------------|
| SYN-26 | Error responses leak internal filesystem paths | 02-01, 02-03 |
| SYN-27 | Non-atomic alert config write | 03-01 |
| SYN-28 | Config cache returns mutable reference | 03-01 |
| SYN-29 | Dormant Windows shell injection in `quoteShellArg` | 02-02 |
| SYN-30 | Environment variable overrides redirect all filesystem reads | 03-01 |
| SYN-31 | Uncaught `JSON.parse` crashes skills route | 02-02 |
| SYN-32 | `localStorage` accumulates indefinitely | 03-02 |
| SYN-33 | Operational and reconnaissance intelligence leakage | 02-03, 03-02 |
| SYN-34 | Code quality issues with security implications | 02-02, 03-02 |
| SYN-35 | Cron and operational metadata exposed | 02-03, 03-02 |

## Appendix B: Session-Level Backlog Mapping

The phase tables above define sequencing. This appendix defines the specific backlog each session owns so the implementation path remains recoverable without the deleted audit chunk files.

### Phase 00 Backlog

| Session | Delivery Items | Finding Coverage |
|---------|----------------|------------------|
| 00-01 | Add shared sensitive-route auth middleware or equivalent route guard, introduce operator code challenge and signed elevated-session cookie scaffolding, and make denial states explicit for protected actions. | SYN-02, SYN-03, SYN-07, SYN-11, SYN-12, SYN-24 |
| 00-02 | Strip `gateway.token` and tokenized gateway URLs from API responses, DOM links, and client request bodies; move token attachment to server-side redirect or server-only flows; redact browser-unneeded platform identifiers and absolute skill paths. | SYN-01, SYN-15, SYN-16 |
| 00-03 | Introduce the root env flag inventory with secure defaults, disable mutating and live-send routes by default, remove `GET` aliases from side-effect handlers, and align Docker, README, and Cloudflare Access deployment guidance with loopback-only origins. | SYN-03, SYN-04, SYN-05, SYN-10, SYN-24 |

### Phase 01 Backlog

| Session | Delivery Items | Finding Coverage |
|---------|----------------|------------------|
| 01-01 | Centralize `agentId` validation and path-boundary enforcement, validate cron-store path resolution, and prevent attacker-controlled path or gateway identifiers from reaching runtime helpers unchecked. | SYN-06, SYN-11, SYN-22 |
| 01-02 | Enforce intended non-GET methods on sensitive routes, add `Origin` validation or equivalent CSRF protection, reject malformed attacker-controlled gateway inputs, and expose consistent operator-facing failure states when sensitive actions are blocked. | SYN-03, SYN-07, SYN-11 |
| 01-03 | Add security headers, add rate limits to diagnostics and analytics endpoints, remove alert self-SSRF, replace random cron-alert placeholders with deterministic logic, and protect or remove force-refresh version checks. | SYN-04, SYN-08, SYN-09, SYN-12, SYN-13, SYN-14, SYN-23, SYN-25 |

### Phase 02 Backlog

| Session | Delivery Items | Finding Coverage |
|---------|----------------|------------------|
| 02-01 | Add schema validation and range checks for alert and similar writes, impose layout and payload size limits, and ensure write-path errors return generic client-safe messages. | SYN-18, SYN-26 |
| 02-02 | Deduplicate bridge helpers so `model-probe.ts` and related code import the canonical runtime bridge, harden mixed-output parsing, replace shell-heavy process invocation where needed, validate config-sourced runtime paths, and fail safely on malformed config reads. | SYN-19, SYN-20, SYN-22, SYN-29, SYN-31, SYN-34 |
| 02-03 | Add file-size checks and concurrency limits before heavy reads, convert sync filesystem calls in request paths to async equivalents, add caching with stampede protection to heavy analytics routes, and sanitize metadata or error surfaces that leak operator internals. | SYN-13, SYN-15, SYN-16, SYN-17, SYN-21, SYN-26, SYN-33, SYN-35 |

### Phase 03 Backlog

| Session | Delivery Items | Finding Coverage |
|---------|----------------|------------------|
| 03-01 | Make alert config writes atomic, return safe copies from config cache, validate startup environment assumptions such as `OPENCLAW_HOME`, and close remaining low-level runtime hazards. | SYN-27, SYN-28, SYN-30 |
| 03-02 | Add bounds and pruning to browser storage, add confirmation dialogs for destructive or expensive UI actions, remove risky logs and POST-to-GET fallbacks, deduplicate alert or monitor logic, strip unnecessary operator identity from client-facing responses, and coordinate AlertMonitor across tabs. | SYN-12, SYN-32, SYN-33, SYN-34, SYN-35 |
| 03-03 | Run the final validation matrix, synchronize `docs/SECURITY_MASTER.md`, `docs/SECURITY_FINDINGS.md`, and `.spec_system/SECURITY-COMPLIANCE.md`, then record any accepted or deferred residual risks with rationale and evidence. | All findings reach Verified, Accepted, or Deferred with evidence |

## Appendix C: Phase Validation Gates

### Phase 00 Validation

- Unauthenticated requests to sensitive routes return 401 or 403.
- `/api/config` and `/api/gateway-health` no longer expose `gateway.token` or tokenized URLs.
- Side-effect routes no longer accept `GET`.
- Default deployment guidance binds the app to loopback and documents authenticated reverse-proxy access.

### Phase 01 Validation

- Rendered pages and client request payloads contain no `token=` values.
- Cross-origin mutations are rejected before any state change occurs.
- Security headers are present and `X-Powered-By` is absent.
- Route guards reject invalid `agentId` and similar attacker-controlled inputs with generic errors.
- Diagnostics and analytics bursts hit rate limits.
- Alert checks no longer recurse through localhost self-requests and no longer rely on random placeholder logic.

### Phase 02 Validation

- Invalid write payloads return validation errors and oversize payloads are rejected.
- Heavy routes use async filesystem access, file-size checks, and bounded concurrency.
- Cached analytics routes reuse recent results instead of repeating the full work on every request.
- Read responses no longer expose absolute paths, unnecessary platform identifiers, or internal filesystem errors.
- Bridge helpers exist in one canonical implementation path.

### Phase 03 Validation

- Sensitive file writes use atomic write patterns where required.
- Cache APIs return safe copies rather than shared mutable references.
- Browser storage is bounded and pruned.
- Destructive or expensive UI actions require confirmation.
- Multi-tab alert monitoring does not multiply work indefinitely.
- Security docs and finding statuses are synchronized with verification evidence and explicit residual-risk decisions.

## Appendix D: Explicit Out-of-Scope Boundary

Detailed notes for excluded work live in `docs/ongoing-projects/security-items-outside-prd-scope.md`.

The current PRD scope does **not** include:

- Gateway credential rotation, scoping, or revocation inside the OpenClaw gateway itself.
- Session archival, data retention, or other large-store lifecycle controls owned by the runtime rather than the dashboard.
- Multi-user auth, RBAC, or public SaaS expansion beyond the current trusted-operator model.
- Moving runtime state out of the local filesystem or introducing a database.
- Alternate non-Cloudflare remote access recipes beyond the current Cloudflare Access plus Tunnel standard.
- Host-level hardening follow-ons such as read-only mounts, reverse-proxy connection limiting, or process supervision work that can be planned after dashboard code hardening is complete.

Historical multi-file audit notes were consolidated into this PRD on 2026-03-31. If a future item is not covered by Appendix A or Appendix B, it belongs in the out-of-scope tracker until the PRD is intentionally expanded.
