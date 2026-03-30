# Security & Compliance

> Cumulative security posture and GDPR compliance record. Updated between phases via /carryforward.
> **Line budget**: 1000 max | **Last updated**: Pre-Phase 00 baseline (2026-03-31)

---

## Current Security Posture

### Overall: AT RISK

| Metric | Value |
|--------|-------|
| Open Findings | 35 |
| Critical/High | 13 |
| Medium/Low | 22 |
| Phases Audited | 0 (pre-implementation baseline) |
| Last Clean Phase | -- |

---

## Open Findings

Active security issues from the March 29-30, 2026 audit. Ordered by severity.
Canonical definitions: `.spec_system/PRD/PRD.md` Appendix A. Live status: `docs/SECURITY_FINDINGS.md`.

### Critical / High

- **[Pre-S01] Gateway auth token leaked to any network client**
  - Severity: Critical
  - File: `app/api/config/route.ts` (gateway object), `app/api/gateway-health/route.ts` (webUrl with `?token=`)
  - Description: `/api/config` GET returns `gateway.token` in JSON. `/api/gateway-health` GET embeds the token in URL query params. Any caller on the network harvests the sole gateway credential.
  - Remediation: Strip `gateway.token` from all API responses; move token attachment to server-side-only flows.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S02] No application-level authentication**
  - Severity: Critical
  - File: `app/api/` (most GET routes)
  - Description: Read routes return rich operational data -- config, sessions, agent activity, stats, skills -- without any auth check. The operator elevation layer exists but is opt-in per handler.
  - Remediation: Apply `requireSensitiveRouteAccess` or equivalent to all routes handling sensitive data; consider tiered read auth.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S03] Unauthenticated permanent runtime configuration mutation**
  - Severity: Critical
  - File: `app/api/config/agent-model/route.ts`, `app/api/alerts/route.ts`
  - Description: Write endpoints can permanently change runtime config. Auth guard added to some but not verified across all mutation paths.
  - Remediation: Enforce `requireSensitiveRouteAccess` + feature flag on every mutation endpoint; verify no unauthenticated write path remains.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S04] Unauthenticated outbound messaging to real users**
  - Severity: Critical
  - File: `app/api/test-session/route.ts`, `app/api/test-dm-sessions/route.ts`
  - Description: Test endpoints can send real messages to external platforms without auth or feature-flag gating.
  - Remediation: Gate behind `ENABLE_OUTBOUND_TESTS` + `requireSensitiveRouteAccess`; default to dry-run.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S05] Zero-click side-effect triggering via GET aliases**
  - Severity: Critical
  - File: Multiple `route.ts` handlers
  - Description: Several side-effect routes accept GET, enabling zero-click exploitation via link injection or image tags.
  - Remediation: Remove GET handlers from all side-effect routes; return 405 for GET on mutation endpoints.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S06] Path traversal via unvalidated `[agentId]` URL segments**
  - Severity: High
  - File: `app/api/sessions/[agentId]/route.ts`, `app/api/stats/[agentId]/route.ts`
  - Description: `agentId` param from URL is used in filesystem path construction without validation. `../` sequences can escape the intended directory.
  - Remediation: Validate `agentId` against an allowlist of known agent names or enforce strict character/pattern rules; reject traversal sequences.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S07] CSRF on all mutating endpoints**
  - Severity: High
  - File: All POST/PUT/PATCH/DELETE routes
  - Description: No Origin or CSRF token validation on mutation routes. Authenticated operator sessions can be exploited via cross-origin requests.
  - Remediation: Add Origin header validation or SameSite cookie enforcement; reject cross-origin mutation requests.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S08] LLM API credit exhaustion and self-SSRF amplification**
  - Severity: High
  - File: `lib/model-probe.ts`, `app/api/alerts/check/route.ts`
  - Description: Provider probe and alert-check endpoints can trigger LLM API calls and self-referencing HTTP requests without rate limits or auth gates.
  - Remediation: Gate behind feature flags + auth; add rate limits; remove self-SSRF patterns in alert check.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S09] External platform rate limit lockout**
  - Severity: High
  - File: `app/api/test-session/route.ts`, `app/api/test-dm-sessions/route.ts`
  - Description: Unthrottled test endpoints can exhaust external platform rate limits, locking out the operator's real bot accounts.
  - Remediation: Rate limit test endpoints; require auth and feature flags.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S10] Docker default binds to all network interfaces**
  - Severity: High
  - File: `Dockerfile` (line 25: `ENV HOSTNAME="0.0.0.0"`)
  - Description: Default `HOSTNAME=0.0.0.0` exposes the origin on all interfaces. README documents loopback override but Dockerfile ships the unsafe default.
  - Remediation: Change Dockerfile default to `127.0.0.1` or document mandatory override; align Docker guidance.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S11] Attacker-controlled inputs forwarded to gateway**
  - Severity: High
  - File: `app/api/config/agent-model/route.ts`, session and test routes
  - Description: URL params and request body values are forwarded to OpenClaw gateway CLI calls without sanitization.
  - Remediation: Validate and sanitize all user inputs before gateway invocation; use allowlists for known parameters.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S12] AlertMonitor auto-triggers full attack pipeline on every page load**
  - Severity: High
  - File: `app/alert-monitor.tsx`
  - Description: Client component fires alert-check and gateway-health requests on every mount. Unauthenticated, these requests amplify the abuse surface with every page navigation.
  - Remediation: Gate client-side polling behind auth status check; deduplicate across tabs; add backoff.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S13] Uncached heavy endpoints with cascading unbounded reads**
  - Severity: High
  - File: `app/api/stats-all/route.ts`, `app/api/activity-heatmap/route.ts`
  - Description: Analytics endpoints perform unbounded filesystem scans on every request with no caching or concurrency limits.
  - Remediation: Add response caching with stampede protection; impose file-count and size limits.
  - Status: Open
  - Opened: Pre (2026-03-30)

### Medium / Low

| ID | Severity | Title | File(s) | Status |
|----|----------|-------|---------|--------|
| Pre-S14 | Medium | Missing security response headers | `middleware.ts` (partial coverage) | Open |
| Pre-S15 | Medium | Platform identity metadata and user IDs disclosed | `app/api/config/route.ts` responses | Open |
| Pre-S16 | Medium | Absolute filesystem paths in skill listings | `lib/openclaw-skills.ts` | Open |
| Pre-S17 | Medium | Synchronous I/O blocks Node.js event loop | Multiple route handlers | Open |
| Pre-S18 | Medium | No input validation on write payloads | Alert, pixel-office, model mutation routes | Open |
| Pre-S19 | Medium | Duplicate CLI bridge with divergent behavior | `lib/model-probe.ts` vs `lib/openclaw-cli.ts` | Open |
| Pre-S20 | Medium | CLI output injection via `parseJsonFromMixedOutput` | `lib/openclaw-cli.ts` | Open |
| Pre-S21 | Medium | Unbounded file reads without size limits | Session and skill content routes | Open |
| Pre-S22 | Medium | `resolveCronStorePath` follows arbitrary config-sourced paths | Cron-related route helpers | Open |
| Pre-S23 | Medium | Random-based cron alert logic sends real notifications | `app/api/alerts/check/route.ts` | Open |
| Pre-S24 | Medium | Platform credentials exercised without auth | Test and probe routes | Open |
| Pre-S25 | Medium | GitHub API rate limit exhaustible via cache bypass | `app/api/pixel-office/version/route.ts` | Open |
| Pre-S26 | Low | Error responses leak internal filesystem paths | Multiple error handlers | Open |
| Pre-S27 | Low | Non-atomic alert config write | `app/api/alerts/route.ts` | Open |
| Pre-S28 | Low | Config cache returns mutable reference | `lib/config-cache.ts` | Open |
| Pre-S29 | Low | Dormant Windows shell injection in `quoteShellArg` | `lib/openclaw-cli.ts` | Open |
| Pre-S30 | Low | Environment variable overrides redirect all filesystem reads | `lib/openclaw-paths.ts` | Open |
| Pre-S31 | Low | Uncaught `JSON.parse` crashes skills route | `app/api/skills/route.ts` | Open |
| Pre-S32 | Low | `localStorage` accumulates indefinitely | Client-side state management | Open |
| Pre-S33 | Low | Operational and reconnaissance intelligence leakage | Stats, config, and health responses | Open |
| Pre-S34 | Low | Code quality issues with security implications | Multiple files | Open |
| Pre-S35 | Low | Cron and operational metadata exposed | Stats and health responses | Open |

---

## GDPR Compliance Status

### Overall: NON-COMPLIANT

The dashboard reads and displays data from the local OpenClaw runtime that may include personal data from external platform users. No consent, deletion, or minimization controls exist yet.

### Personal Data Inventory

| Data Element | Source | Storage | Purpose | Legal Basis | Retention | Deletion Path | Since |
|-------------|--------|---------|---------|-------------|-----------|---------------|-------|
| Operator email | Cloudflare Access header | In-memory (identity resolution) | Auth boundary | Legitimate interest (operator access) | Request lifetime | N/A (not persisted) | Pre |
| Platform user IDs | `openclaw.json` + session files | Local filesystem (OpenClaw runtime) | Session display, stats | Legitimate interest (operational monitoring) | OpenClaw runtime default | Not implemented | Pre |
| Platform usernames | Session files, agent config | Local filesystem (OpenClaw runtime) | Session display, DM identification | Legitimate interest (operational monitoring) | OpenClaw runtime default | Not implemented | Pre |
| Agent names/config | `openclaw.json` | Local filesystem (OpenClaw runtime) | Agent monitoring display | Legitimate interest (operational monitoring) | OpenClaw runtime default | Not implemented | Pre |

### Compliance Checklist

| Requirement | Status | Notes |
|------------|--------|-------|
| Data collection has documented purpose | PARTIAL | Operator monitoring documented; third-party user data handling undocumented |
| Consent obtained before data storage | N/A | Dashboard reads existing data; does not collect new PII from data subjects |
| Data minimization verified | FAIL | API responses expose full platform IDs, usernames, and filesystem paths (SYN-15, SYN-16) |
| Deletion/erasure path exists | FAIL | No mechanism to delete or anonymize session/user data from dashboard |
| No PII in application logs | FAIL | Pino logger has no PII filtering; platform identifiers may appear in server logs |
| Third-party transfers documented | PARTIAL | Outbound test routes can send data to external platforms; not documented as data transfers |

---

## Dependency Security

### Current Vulnerabilities

No known CVEs in current dependency versions as of baseline date. Key packages:

| Package | Version | Notes |
|---------|---------|-------|
| next | ^16.0.0 | Latest major; monitor Next.js security advisories |
| react | ^19.0.0 | Latest major |
| pino | ^10.3.1 | No known issues |
| pino-pretty | ^13.1.3 | Listed as production dep; should be devDependency |
| @biomejs/biome | ^2.4.10 | Dev only |

No `npm audit` run was performed during this baseline. Recommend running `npm audit` in Phase 00 Session 01.

---

## Resolved Findings

No resolved findings yet.

---

## Phase History

| Phase | Sessions | Security | GDPR | Findings Opened | Findings Closed |
|-------|----------|----------|------|-----------------|-----------------|
| Pre-00 | 0 (baseline) | AT RISK | NON-COMPLIANT | 35 | 0 |

---

## Recommendations

Actionable items for Phase 00 based on the audit baseline.

1. **Prioritize SYN-01 (token leakage)**: Gateway token in API responses is the single highest-impact finding. Strip from `/api/config` and `/api/gateway-health` responses before any other work.
2. **Extend `requireSensitiveRouteAccess` to all sensitive routes**: The guard exists and works -- the gap is coverage, not implementation. Audit every `route.ts` for opt-in.
3. **Run `npm audit`**: No dependency audit has been recorded. Run and document before Phase 00 begins.
4. **Change Dockerfile default to `127.0.0.1`**: The current `0.0.0.0` default contradicts the security posture. Fix is a one-line change.
5. **Add PII filtering to Pino logger**: Before structured logging expands, ensure platform identifiers and operator secrets cannot appear in log output.
6. **Tighten CSP**: Remove `unsafe-eval` from script-src once client-side hardening stabilizes. Keep `unsafe-inline` only if Tailwind or Next.js requires it.

---

*Auto-generated by /carryforward. Manual edits allowed but may be overwritten.*
