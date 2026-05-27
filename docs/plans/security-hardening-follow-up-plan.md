# Security Hardening Follow-up Plan

## Status

- Drafted: 2026-04-01
- Basis: local code review of `app/api/*` and unauthenticated live probes of
  `https://board.aiwithapex.com`
- Current live spot-check on 2026-04-01: `/`, `/api/health`, and
  `/api/config` all redirected to Cloudflare Access (`302`)

## Why This Follow-up Exists

The production hostname is currently protected by Cloudflare Access and Cloudflare
Tunnel, which prevented unauthenticated access during live testing. The app code
still leaves many read endpoints unauthenticated at the application layer,
however, and therefore relies on the perimeter staying perfect.

That creates a fail-open risk if any of the following ever drift:

- an alternate hostname or preview deployment is exposed without Access
- Cloudflare policy changes and excludes some paths
- the app is run directly on a public interface outside the documented model
- an operator temporarily bypasses the tunnel and forgets to restore it

This plan hardens the dashboard so sensitive read behavior fails closed even if
the external perimeter is weakened.

It is a defense-in-depth follow-up, not a contradiction of the current
closeout posture in [`SECURITY.md`](/home/aiwithapex/projects/kroxboard/SECURITY.md),
which still reflects the supported deployment model and its verified controls.

## Findings That Still Matter

### 1. Sensitive read routes are public in app code

Several read routes already have bounded reads, caching, rate limiting, and
sanitized error contracts, but they still do not require app-side auth today.

The following handlers currently do not require app-side auth:

- [`app/api/config/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/config/route.ts)
- [`app/api/sessions/[agentId]/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/sessions/[agentId]/route.ts)
- [`app/api/agent-activity/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/agent-activity/route.ts)
- [`app/api/agent-status/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/agent-status/route.ts)
- [`app/api/stats-all/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/stats-all/route.ts)
- [`app/api/stats/[agentId]/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/stats/[agentId]/route.ts)
- [`app/api/stats-models/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/stats-models/route.ts)
- [`app/api/activity-heatmap/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/activity-heatmap/route.ts)
- [`app/api/alerts/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/alerts/route.ts) `GET`
- [`app/api/gateway-health/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/gateway-health/route.ts)
- [`app/api/skills/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/skills/route.ts)
- [`app/api/skills/content/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/skills/content/route.ts)
- [`app/api/pixel-office/layout/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/pixel-office/layout/route.ts) `GET`
- [`app/api/pixel-office/idle-rank/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/pixel-office/idle-rank/route.ts)
- [`app/api/pixel-office/contributions/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/pixel-office/contributions/route.ts)

### 2. Some read payloads still carry operationally sensitive metadata

If the perimeter is bypassed, the current read surface would expose details such
as:

- agent names, models, platform bindings, launch targets, and group-chat layout
- session keys, session IDs, peer/channel identifiers, token counters, and
  update timestamps
- current tool usage, cron-job metadata, subagent labels, and recent activity
- skill inventory and full skill contents

### 3. Deployment hardening still matters

The repo documents the correct deployment model, but live testing also showed a
few perimeter-level concerns worth tracking:

- the app proxy already sets HSTS for HTTPS requests, but the current pre-auth
  Cloudflare Access `302` responses from `board.aiwithapex.com` did not include
  HSTS during the 2026-04-01 spot-check
- pre-auth Cloudflare responses reflected arbitrary `Origin` values while also
  sending `Access-Control-Allow-Credentials: true`

The CORS behavior was not exploitable in browser testing because fetches still
failed pre-auth, but it should still be investigated and tightened if possible.

## Goals

- Make sensitive reads fail closed without depending solely on Cloudflare
  Access.
- Keep only a minimal, explicit set of truly public endpoints.
- Reduce the amount of operational metadata exposed even to authenticated
  readers when the UI does not need it.
- Add tests that catch future regressions in both route protection and payload
  minimization.

## Non-Goals

- Replacing Cloudflare Access as the primary non-local perimeter
- Adding multi-user RBAC or a public SaaS auth model
- Re-architecting runtime storage off the local filesystem

## Proposed Route Policy

### Public

These may remain public if explicitly documented and kept minimal:

- `/api/health`
- `/api/pixel-office/assets`
- `/api/pixel-office/tracks`
- `/api/pixel-office/version`

### Public Auth-State Endpoint

This route should stay callable without elevation because the UI uses it to
discover whether identity and/or operator challenge state is already present:

- `/api/operator/session`

Constraint:

- keep the payload minimal and limited to sanitized auth/session state

### Operator Identity Required

These should require trusted operator identity but not necessarily elevated
session cookies:

- `/api/config`
- `/api/agent-status`
- `/api/gateway-health`
- `/api/alerts` `GET`

### Elevated Operator Session Required

These should require `requireSensitiveRouteAccess()` because they expose
per-agent, per-session, or operational detail:

- `/api/sessions/:agentId`
- `/api/agent-activity`
- `/api/stats-all`
- `/api/stats/:agentId`
- `/api/stats-models`
- `/api/activity-heatmap`
- `/api/skills`
- `/api/skills/content`
- `/api/pixel-office/layout` `GET`
- `/api/pixel-office/idle-rank`
- `/api/pixel-office/contributions`

### Already Sensitive and Correctly Guarded

These already enforce write/auth boundaries and should stay that way:

- mutating `/api/alerts`
- `/api/config/agent-model`
- `/api/operator/elevate`
- mutating `/api/pixel-office/layout`
- `/api/test-*`
- `/gateway/*`

## Implementation Plan

### Phase 1: Add a Shared Sensitive Read Guard

Create a single helper for read-side protection so route authors do not need to
rebuild the logic ad hoc.

Suggested work:

- extend the existing
  [`lib/security/sensitive-route.ts`](/home/aiwithapex/projects/kroxboard/lib/security/sensitive-route.ts)
  pattern instead of introducing a parallel auth helper
- support at least two modes:
  - `identity`: trusted operator identity required
  - `elevated`: trusted operator identity plus valid operator session cookie
- reuse existing response shapes where possible so the UI can handle denial
  consistently
- keep failure modes sanitized and fail closed

Acceptance criteria:

- routes can opt into a single shared read guard
- denial responses do not leak environment or path details

### Phase 2: Protect the Sensitive Read Routes

Apply the shared read guard to all routes in the "Operator Identity Required"
and "Elevated Operator Session Required" groups.

Suggested order:

1. `config`, `sessions/:agentId`, `agent-activity`, `stats*`
2. `skills`, `skills/content`, `pixel-office/layout`
3. `alerts GET`, `gateway-health`, `agent-status`, `idle-rank`,
   `contributions`

Acceptance criteria:

- direct requests to these routes on an unprotected local/server origin return
  app-side denial contracts rather than data
- identity-only dashboard flows still work after Cloudflare login without an
  unnecessary operator-code challenge
- elevated routes surface the existing operator challenge contract rather than a
  generic load failure

### Phase 3: Update Read-Side Client Handling

Protecting currently public read routes will break several pages unless the
client fetch paths learn how to parse and render auth-denial contracts.

Recommended work:

- reuse
  [`lib/operator-elevation-client.ts`](/home/aiwithapex/projects/kroxboard/lib/operator-elevation-client.ts)
  for read-route denial parsing instead of treating every non-200 as a generic
  load error
- update the main read surfaces that currently assume public `GET` success, in
  particular home, sessions, stats, skills, alerts, pixel office, sidebar, and
  gateway status reads
- keep `/api/operator/session` as the bootstrap check for auth/elevation state
- prefer operator banners or explicit denied states over blank charts, empty
  tables, or misleading "load failed" copy

Acceptance criteria:

- pages backed by newly protected read routes render a clear auth/elevation
  state when denied
- Cloudflare-authenticated operators can still use identity-only pages without
  entering the operator code
- elevated-only reads prompt for challenge in a consistent way

### Phase 4: Minimize Read Payloads

Even after auth, several responses return more operational detail than the UI
necessarily needs.

Recommended reductions:

- remove `sessionId` from `/api/sessions/:agentId` unless a concrete UI need is
  documented
- avoid returning raw peer or target IDs when a label or count is sufficient
- trim `/api/config` further if launch metadata, group-chat details, or
  platform account linkage are not required for default rendering
- gate full skill content behind elevation, or return metadata-only by default
- trim `agent-activity` cron/subagent summaries to the minimum display contract

Acceptance criteria:

- every returned field in the protected read surface maps to an explicit UI
  need
- security-sensitive identifiers are removed, masked, or downgraded where
  possible

### Phase 5: Add Deployment Hardening Checks

The documented deployment model is sound, but it should be enforced and tested
more explicitly.

Recommended work:

- document HSTS as a production requirement in
  [`docs/deployment.md`](/home/aiwithapex/projects/kroxboard/docs/deployment.md)
- add an operational check for Cloudflare Access coverage on `/api/*` and
  `/gateway/*`
- review Cloudflare Access/CORS behavior on pre-auth redirects and tighten if
  configurable
- add a smoke-test checklist that verifies the public hostname returns Access
  redirects for protected routes

Acceptance criteria:

- deployment docs contain a concrete perimeter verification checklist
- production rollouts include a post-deploy route-protection smoke pass

### Phase 6: Regression Tests

Add route tests for both denial and happy-path behavior.

Minimum coverage:

- remote unauthenticated `GET` denial for newly protected read routes
- localhost/elevated success for those same routes
- payload minimization assertions for `/api/config`, `/api/sessions/:agentId`,
  and `/api/skills/content`
- client-side handling assertions for representative pages when protected read
  routes return operator-auth denial payloads
- deployment smoke script or runbook snippet for checking public-host
  Cloudflare redirects

Acceptance criteria:

- new tests fail if a sensitive read route becomes public again
- tests prove both auth boundary and sanitized response behavior

## Suggested File Targets

- [`lib/security/sensitive-route.ts`](/home/aiwithapex/projects/kroxboard/lib/security/sensitive-route.ts)
- [`lib/operator-elevation-client.ts`](/home/aiwithapex/projects/kroxboard/lib/operator-elevation-client.ts)
- [`app/api/config/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/config/route.ts)
- [`app/api/sessions/[agentId]/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/sessions/[agentId]/route.ts)
- [`app/api/agent-activity/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/agent-activity/route.ts)
- [`app/api/stats-all/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/stats-all/route.ts)
- [`app/api/stats/[agentId]/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/stats/[agentId]/route.ts)
- [`app/api/stats-models/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/stats-models/route.ts)
- [`app/api/activity-heatmap/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/activity-heatmap/route.ts)
- [`app/api/skills/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/skills/route.ts)
- [`app/api/skills/content/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/skills/content/route.ts)
- [`app/api/pixel-office/layout/route.ts`](/home/aiwithapex/projects/kroxboard/app/api/pixel-office/layout/route.ts)
- [`app/page.tsx`](/home/aiwithapex/projects/kroxboard/app/page.tsx)
- [`app/sessions/page.tsx`](/home/aiwithapex/projects/kroxboard/app/sessions/page.tsx)
- [`app/stats/page.tsx`](/home/aiwithapex/projects/kroxboard/app/stats/page.tsx)
- [`app/skills/page.tsx`](/home/aiwithapex/projects/kroxboard/app/skills/page.tsx)
- [`app/alerts/page.tsx`](/home/aiwithapex/projects/kroxboard/app/alerts/page.tsx)
- [`app/pixel-office/page.tsx`](/home/aiwithapex/projects/kroxboard/app/pixel-office/page.tsx)
- [`docs/deployment.md`](/home/aiwithapex/projects/kroxboard/docs/deployment.md)

## Exit Criteria

This follow-up can be considered complete when all of the following are true:

- sensitive read endpoints enforce app-side auth
- the remaining public endpoints are explicitly documented and intentionally
  public
- sensitive response fields are removed or minimized
- production deployment checks verify both Cloudflare Access coverage and HSTS
- route and regression tests cover the new boundary behavior

## Notes

- This plan does not change the current live conclusion that
  `board.aiwithapex.com` was protected by Cloudflare Access during the
  2026-04-01 probe.
- It exists because the repo should remain safe even if deployment assumptions
  drift.
