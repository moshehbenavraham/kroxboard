# Security Policy

This file is the canonical security policy, secure-default guide, and findings
register for OpenClaw Dashboard. It replaces the former
`docs/SECURITY_MASTER.md` and `docs/SECURITY_FINDINGS.md` documents.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest `main` branch and latest release | Yes |
| Older commits or releases | No |

## Current Security Posture

As of 2026-03-31, the dashboard security closeout status is:

| Metric | Value |
| ------ | ----- |
| Total Findings | 35 |
| Verified | 34 |
| Accepted | 1 |
| Open | 0 |
| Fresh Evidence | `npm test`, `npm run build`, and live route and page probes on 2026-03-31 |

Current verified protections include:

- operator auth for sensitive actions
- same-origin mutation guards
- server-only sensitive feature flags
- token-free browser contracts
- bounded read paths and bounded browser persistence
- shared polling controls
- tightened security headers
- loopback-only origin hosting behind Cloudflare Access and Cloudflare Tunnel

## Supported Deployment Model

- Standard non-local deployment is `board.aiwithapex.com` behind Cloudflare
  Access plus Cloudflare Tunnel to a loopback-only origin.
- Direct public origin exposure is unsupported.
- Cloudflare Access should use the owner-only pattern already used for the
  OpenClaw UI.
- Approved-email One-Time PIN is the primary Cloudflare Access login method.
- The allowed operator email is `moshehwebservices@live.com`.
- Sensitive routes require a second app-side protection layer after the
  Cloudflare boundary.
- The app-side layer is an operator code challenge that mints an HTTP-only
  signed cookie for elevated actions.
- The operator code secret and cookie-signing secret must live only in the root
  `.env`.

## Secure Default Policy

- Any route that writes state, sends messages, or triggers provider calls is
  sensitive.
- Sensitive routes must be disabled by default.
- Sensitive routes must be controlled by root env flags documented in
  `.env.example`.
- Sensitive routes must not expose `GET` aliases.
- Sensitive routes must enforce auth, origin checks, validation, and rate
  limiting before execution.
- Read-only routes must not leak secrets, absolute paths, or unnecessary
  operator metadata.
- Preserve read-only monitoring even when sensitive features stay disabled.
- Protect secrets before preserving convenience behavior.
- Centralize feature-flag, auth, validation, and path-boundary logic.
- Do not mark a finding Verified until validation evidence exists.

## Findings Status Values

- `Open`: confirmed and not yet fixed
- `In Progress`: implementation started but not yet verified
- `Fixed`: code or docs changed, awaiting verification
- `Verified`: fix validated
- `Accepted`: risk intentionally accepted with rationale
- `Deferred`: planned for later work

## Findings Register

| ID | Severity | Title | Status |
| -- | -------- | ----- | ------ |
| SYN-01 | Critical | Gateway auth token leaked to any network client | Verified |
| SYN-02 | Critical | No application-level authentication | Verified |
| SYN-03 | Critical | Unauthenticated permanent runtime configuration mutation | Verified |
| SYN-04 | Critical | Unauthenticated outbound messaging to real users | Verified |
| SYN-05 | Critical | Zero-click side-effect triggering via `GET` aliases | Verified |
| SYN-06 | High | Path traversal via unvalidated `[agentId]` URL segments | Verified |
| SYN-07 | High | CSRF on all mutating endpoints | Verified |
| SYN-08 | High | LLM API credit exhaustion and self-SSRF amplification | Verified |
| SYN-09 | High | External platform rate limit lockout | Verified |
| SYN-10 | High | Docker default binds to all network interfaces | Verified |
| SYN-11 | High | Attacker-controlled inputs forwarded to gateway | Verified |
| SYN-12 | High | AlertMonitor auto-triggers full attack pipeline on every page load | Verified |
| SYN-13 | High | Uncached heavy endpoints with cascading unbounded reads | Verified |
| SYN-14 | Medium | Missing security response headers | Verified |
| SYN-15 | Medium | Platform identity metadata and user IDs disclosed | Verified |
| SYN-16 | Medium | Absolute filesystem paths in skill listings | Verified |
| SYN-17 | Medium | Synchronous I/O blocks Node.js event loop | Verified |
| SYN-18 | Medium | No input validation on write payloads | Verified |
| SYN-19 | Medium | Duplicate CLI bridge with divergent behavior | Verified |
| SYN-20 | Medium | CLI output injection via `parseJsonFromMixedOutput` | Verified |
| SYN-21 | Medium | Unbounded file reads without size limits | Verified |
| SYN-22 | Medium | `resolveCronStorePath` follows arbitrary config-sourced paths | Verified |
| SYN-23 | Medium | Random-based cron alert logic sends real notifications | Verified |
| SYN-24 | Medium | Platform credentials exercised without auth | Verified |
| SYN-25 | Medium | GitHub API rate limit exhaustible via cache bypass | Verified |
| SYN-26 | Low | Error responses leak internal filesystem paths | Verified |
| SYN-27 | Low | Non-atomic alert config write | Verified |
| SYN-28 | Low | Config cache returns mutable reference | Verified |
| SYN-29 | Low | Dormant Windows shell injection in `quoteShellArg` | Accepted |
| SYN-30 | Low | Environment variable overrides redirect all filesystem reads | Verified |
| SYN-31 | Low | Uncaught `JSON.parse` crashes skills route | Verified |
| SYN-32 | Low | `localStorage` accumulates indefinitely | Verified |
| SYN-33 | Low | Operational and reconnaissance intelligence leakage | Verified |
| SYN-34 | Low | Code quality issues with security implications | Verified |
| SYN-35 | Low | Cron and operational metadata exposed | Verified |

## Verification Summary

- Phase 00 validation on 2026-03-31 supports Verified status for SYN-01,
  SYN-02, SYN-03, SYN-04, SYN-05, SYN-10, SYN-15, SYN-16, and SYN-24.
- Phase 01 validation on 2026-03-31 supports Verified status for SYN-06,
  SYN-07, SYN-08, SYN-09, SYN-11, SYN-12, SYN-14, SYN-23, and SYN-25.
- Phase 02 validation on 2026-03-31 supports Verified status for SYN-13,
  SYN-17, SYN-18, SYN-19, SYN-20, SYN-21, SYN-22, SYN-26, SYN-31, SYN-33,
  SYN-34, and SYN-35.
- Phase 03 validation on 2026-03-31 supports Verified status for SYN-12,
  SYN-14, SYN-27, SYN-28, SYN-30, SYN-32, SYN-33, SYN-34, and SYN-35.
- Final closeout evidence added a fresh `npm test`, `npm run build`,
  page-smoke, token-free config, sanitized gateway-health, 405 method
  enforcement, 400 traversal rejection, and protected-route denial pass on
  2026-03-31.

## Accepted Residual Risk

- SYN-29 is accepted for the current closeout because the remaining
  `quoteShellArg` path only exists in the `win32` `cmd.exe` fallback inside
  `lib/openclaw-cli.ts`, while the documented supported deployment model is
  localhost or Linux server hosting behind Cloudflare Access plus Tunnel.
- Re-open SYN-29 if Windows becomes a supported deployment target or if a
  future bridge change expands that shell path.

## Reporting a Vulnerability

- Report vulnerabilities privately to `moshehwebservices@live.com`.
- Do not open a public GitHub issue for a live security problem.
- Include the affected route, feature flag, deployment context, reproduction
  steps, and any logs or screenshots needed to confirm the issue.
- Best effort process:
  - acknowledge receipt within 3 business days
  - triage and determine severity after reproduction
  - provide follow-up status updates during remediation

## Maintenance Rules

Update this file when:

- a new sensitive route or feature flag is added
- a finding is fixed, deferred, accepted, or re-opened
- deployment defaults change
- the auth boundary changes
- validation evidence changes the practical risk of an existing finding
- work moves into or out of the in-scope remediation backlog
