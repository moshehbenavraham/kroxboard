# Security & Compliance

> Cumulative security posture and GDPR compliance record. Updated between phases via /carryforward.
> **Line budget**: 1000 max | **Last updated**: Phase 00 (2026-03-31)

---

## Current Security Posture

### Overall: AT RISK

| Metric | Value |
|--------|-------|
| Open Findings | 30 |
| Critical/High | 10 |
| Medium/Low | 20 |
| Phases Audited | 1 |
| Last Clean Phase | -- |

---

## Open Findings

Active security or GDPR issues requiring attention. Ordered by severity.
Canonical definitions: `.spec_system/PRD/PRD.md` Appendix A. Live status: `docs/SECURITY_FINDINGS.md`.

### Critical / High

- **[Pre-S02] No application-level authentication**
  - Severity: Critical
  - File: `app/api/` (most GET routes)
  - Description: Read routes still expose sensitive operational data without a universal auth boundary.
  - Remediation: Apply `requireSensitiveRouteAccess` or an equivalent guard to every sensitive route and keep the allowlist under review.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S03] Unauthenticated permanent runtime configuration mutation**
  - Severity: Critical
  - File: `app/api/config/agent-model/route.ts`, `app/api/alerts/route.ts`
  - Description: Mutation coverage exists for the Phase 00 baseline, but the broader write surface still needs complete enforcement.
  - Remediation: Enforce `requireSensitiveRouteAccess` plus feature flags on every mutation endpoint and verify no unauthenticated write path remains.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S04] Unauthenticated outbound messaging to real users**
  - Severity: Critical
  - File: `app/api/test-session/route.ts`, `app/api/test-dm-sessions/route.ts`
  - Description: Outbound messaging remains a high-risk capability that must stay tightly gated and reviewable.
  - Remediation: Keep live-send behind `ENABLE_OUTBOUND_TESTS` plus `requireSensitiveRouteAccess`, with dry-run as the default path.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S06] Path traversal via unvalidated `[agentId]` URL segments**
  - Severity: High
  - File: `app/api/sessions/[agentId]/route.ts`, `app/api/stats/[agentId]/route.ts`
  - Description: `agentId` values still need strict validation before any filesystem path construction.
  - Remediation: Enforce an allowlist or strict pattern and reject traversal sequences.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S07] CSRF on all mutating endpoints**
  - Severity: High
  - File: All POST/PUT/PATCH/DELETE routes
  - Description: Mutation routes still need explicit origin or CSRF defenses.
  - Remediation: Add Origin validation or a dedicated CSRF strategy and reject cross-origin mutations.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S08] LLM API credit exhaustion and self-SSRF amplification**
  - Severity: High
  - File: `lib/model-probe.ts`, `app/api/alerts/check/route.ts`
  - Description: Provider probe and alert-check flows still require stronger throttling and SSRF resistance.
  - Remediation: Keep these routes behind feature flags and auth, add rate limits, and remove self-SSRF patterns.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S09] External platform rate limit lockout**
  - Severity: High
  - File: `app/api/test-session/route.ts`, `app/api/test-dm-sessions/route.ts`
  - Description: Diagnostic traffic can still threaten external platform rate limits if it is not bounded tightly enough.
  - Remediation: Keep rate limits in place and preserve the auth/feature-flag gate.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S11] Attacker-controlled inputs forwarded to gateway**
  - Severity: High
  - File: `app/api/config/agent-model/route.ts`, session and test routes
  - Description: Route inputs still need strict sanitization before they are forwarded to OpenClaw gateway calls.
  - Remediation: Validate and sanitize all user inputs before gateway invocation; use allowlists for known parameters.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S12] AlertMonitor auto-triggers full attack pipeline on every page load**
  - Severity: High
  - File: `app/alert-monitor.tsx`
  - Description: Client-side polling remains an abuse multiplier until it is fully auth-aware and backoff-limited.
  - Remediation: Gate polling behind auth status checks, deduplicate across tabs, and add backoff.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S13] Uncached heavy endpoints with cascading unbounded reads**
  - Severity: High
  - File: `app/api/stats-all/route.ts`, `app/api/activity-heatmap/route.ts`
  - Description: Read-heavy analytics endpoints still need bounded caching and concurrency control.
  - Remediation: Add response caching with stampede protection and impose file-count and size limits.
  - Status: Open
  - Opened: Pre (2026-03-30)

### Medium / Low

- **[Pre-S14] Missing security response headers**
  - Severity: Medium
  - File: `middleware.ts` (partial coverage)
  - Description: Header coverage is still incomplete.
  - Remediation: Tighten the response-header set after the remaining route hardening stabilizes.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S17] Synchronous I/O blocks Node.js event loop**
  - Severity: Medium
  - File: Multiple route handlers
  - Description: Hot-path sync reads still block the event loop.
  - Remediation: Move the remaining request-time reads to `fs/promises`.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S18] No input validation on write payloads**
  - Severity: Medium
  - File: Alert, pixel-office, model mutation routes
  - Description: Write payload validation is still incomplete outside the Phase 00 baseline.
  - Remediation: Add schema validation and payload-size limits before any persistent write or gateway call.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S19] Duplicate CLI bridge with divergent behavior**
  - Severity: Medium
  - File: `lib/model-probe.ts` vs `lib/openclaw-cli.ts`
  - Description: Bridge logic still exists in more than one place.
  - Remediation: Consolidate around the canonical bridge and remove copy drift.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S20] CLI output injection via `parseJsonFromMixedOutput`**
  - Severity: Medium
  - File: `lib/openclaw-cli.ts`
  - Description: Mixed-output parsing still needs hardening.
  - Remediation: Treat non-JSON output as untrusted and keep parsing bounded and defensive.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S21] Unbounded file reads without size limits**
  - Severity: Medium
  - File: Session and skill content routes
  - Description: Large reads can still overwhelm the server.
  - Remediation: Add file-size and concurrency bounds before reading large content.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S22] `resolveCronStorePath` follows arbitrary config-sourced paths**
  - Severity: Medium
  - File: Cron-related route helpers
  - Description: Cron path resolution still trusts config values too much.
  - Remediation: Enforce a strict path boundary and approved-directory allowlist.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S23] Random-based cron alert logic sends real notifications**
  - Severity: Medium
  - File: `app/api/alerts/check/route.ts`
  - Description: Randomized notification behavior still needs deterministic control.
  - Remediation: Remove random-send behavior or keep it behind explicit opt-in test controls.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S24] Platform credentials exercised without auth**
  - Severity: Medium
  - File: Test and probe routes
  - Description: Diagnostic routes still represent a sensitive credential-exercising surface.
  - Remediation: Keep them behind auth and feature flags, and preserve dry-run defaults.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S25] GitHub API rate limit exhaustible via cache bypass**
  - Severity: Medium
  - File: `app/api/pixel-office/version/route.ts`
  - Description: Release checks still need persistent cache discipline.
  - Remediation: Add cache protection and avoid repeated release probes on demand.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S26] Error responses leak internal filesystem paths**
  - Severity: Low
  - File: Multiple error handlers
  - Description: Some errors still reveal internal path details.
  - Remediation: Normalize client-facing errors and redact internal paths.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S27] Non-atomic alert config write**
  - Severity: Low
  - File: `app/api/alerts/route.ts`
  - Description: Alert writes still need crash-safe persistence.
  - Remediation: Switch to rename-and-swap writes.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S28] Config cache returns mutable reference**
  - Severity: Low
  - File: `lib/config-cache.ts`
  - Description: Shared cache objects can still be mutated by callers.
  - Remediation: Return clones or enforce immutability before mutation points.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S29] Dormant Windows shell injection in `quoteShellArg`**
  - Severity: Low
  - File: `lib/openclaw-cli.ts`
  - Description: Windows shell escaping remains fragile.
  - Remediation: Harden the helper or remove the shell path entirely.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S30] Environment variable overrides redirect all filesystem reads**
  - Severity: Low
  - File: `lib/openclaw-paths.ts`
  - Description: Environment overrides still need a path boundary.
  - Remediation: Validate overrides against approved directories before any read.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S31] Uncaught `JSON.parse` crashes skills route**
  - Severity: Low
  - File: `app/api/skills/route.ts`
  - Description: Malformed JSON still needs safer parsing and error handling.
  - Remediation: Catch parse failures and return sanitized errors.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S32] `localStorage` accumulates indefinitely**
  - Severity: Low
  - File: Client-side state management
  - Description: Browser state still needs bounding and pruning.
  - Remediation: Add expiration and size limits.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S33] Operational and reconnaissance intelligence leakage**
  - Severity: Low
  - File: Stats, config, and health responses
  - Description: Responses still reveal more operational metadata than the dashboard needs.
  - Remediation: Continue trimming browser-visible telemetry and internal detail.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S34] Code quality issues with security implications**
  - Severity: Low
  - File: Multiple files
  - Description: Small quality issues still carry security impact when they sit on request paths.
  - Remediation: Keep cleanup tied to security-sensitive code changes.
  - Status: Open
  - Opened: Pre (2026-03-30)

- **[Pre-S35] Cron and operational metadata exposed**
  - Severity: Low
  - File: Stats and health responses
  - Description: Operational detail still leaks through read paths.
  - Remediation: Reduce exposed metadata to the minimum needed for operators.
  - Status: Open
  - Opened: Pre (2026-03-30)

---

## GDPR Compliance Status

### Overall: NON-COMPLIANT

The dashboard still reads and displays data from the local OpenClaw runtime that may include personal data from external platform users. Phase 00 removed the browser-visible gateway token, absolute filesystem paths, and some identity metadata, but the app still needs minimization, deletion, and logging controls before it can be considered compliant.

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
| Data collection has documented purpose | PARTIAL | Operator monitoring is documented; third-party user data handling is still only partially described. |
| Consent obtained before data storage | N/A | The dashboard reads existing data; it does not collect new PII from data subjects. |
| Data minimization verified | FAIL | Phase 00 reduced browser-visible leakage, but additional operational metadata and read-path exposure remain. |
| Deletion/erasure path exists | FAIL | No mechanism exists to delete or anonymize session/user data from the dashboard. |
| No PII in application logs | FAIL | Pino logging still needs PII and secret filtering enforcement. |
| Third-party transfers documented | PARTIAL | Outbound test routes can send data to external platforms; the transfer story is still incomplete. |

---

## Dependency Security

### Current Vulnerabilities

No known CVEs in current dependency versions as of the Phase 00 update date. Key packages:

| Package | Version | Notes |
|---------|---------|-------|
| next | ^16.0.0 | Latest major; monitor Next.js security advisories |
| react | ^19.0.0 | Latest major |
| pino | ^10.3.1 | No known issues |
| pino-pretty | ^13.1.3 | Listed as production dep; should be devDependency |
| @biomejs/biome | ^2.4.10 | Dev only |

No `npm audit` run was recorded in the phase summaries. Run one in a later validation pass if the dependency set changes.

---

## Resolved Findings

| ID | Severity | Title | Resolution |
|----|----------|-------|------------|
| [P00-S01] | Critical | Gateway auth token leaked to any network client | Removed `gateway.token` from browser-visible payloads and shifted launch handling to same-origin server mediation. |
| [P00-S05] | Critical | Zero-click side-effect triggering via `GET` aliases | Removed GET aliases from side-effect routes and return 405 for side-effect GET requests. |
| [P00-S10] | High | Docker default binds to all network interfaces | Changed the Dockerfile default bind to `127.0.0.1` and aligned deployment guidance. |
| [P00-S15] | Medium | Platform identity metadata and user IDs disclosed | Sanitized browser-visible config and health payloads so identity-only fields stay server-side. |
| [P00-S16] | Medium | Absolute filesystem paths in skill listings | Sanitized skills responses so browser-visible data no longer exposes absolute filesystem paths. |

---

## Phase History

| Phase | Sessions | Security | GDPR | Findings Opened | Findings Closed |
|-------|----------|----------|------|-----------------|-----------------|
| Pre-00 | 0 (baseline) | AT RISK | NON-COMPLIANT | 35 | 0 |
| P00 | 3 | AT RISK | NON-COMPLIANT | 35 | 5 |

---

## Recommendations

Actionable items for the next phase.

1. **Prioritize the remaining auth and write-path gaps**: The Phase 00 baseline is in place, but Phase 01 still needs the broader route-boundary and origin-validation work.
2. **Tighten the heavy read paths**: Phase 02 should focus on caching, file-size limits, and sync-I/O removal.
3. **Run `npm audit` during a later validation pass**: The phase summaries did not record a dependency audit.
4. **Keep PII filtering on the security backlog**: Logging and browser-visible metadata still need explicit minimization.
5. **Continue updating the live findings register**: Keep `docs/SECURITY_FINDINGS.md` synchronized with the PRD and phase closeouts.

---

*Auto-generated by /carryforward. Manual edits allowed but may be overwritten.*
