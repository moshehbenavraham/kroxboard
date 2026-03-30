# CONVENTIONS.md

## Guiding Principles

- Default to safe-by-default behavior for any route that can change state, send messages, or call external providers.
- Server-only secrets never cross the server-client boundary.
- Keep read-only monitoring useful even when all sensitive feature flags are disabled.
- Centralize security controls instead of re-implementing them per route.
- Prefer boring, explicit code over clever shortcuts in bridge, filesystem, and route logic.

## Naming

- Use `PascalCase` for React components and TypeScript types.
- Use `camelCase` for variables, functions, and object fields.
- Use `UPPER_SNAKE_CASE` for env keys and exported constants.
- Name route helpers by intent, such as `requireFeatureFlag`, `assertAllowedOrigin`, and `resolveAgentPath`.
- Feature flags that unlock sensitive behavior must read clearly and default to off.

## Files & Structure

- Keep `app/` for pages, layouts, and route handlers; keep reusable logic in `lib/`.
- Keep `app/api/*/route.ts` thin and move filesystem, gateway, and validation logic into shared helpers.
- Default to Server Components; add `"use client"` only when browser APIs or interactive state are required.
- Keep env parsing and feature-flag checks centralized instead of scattered across handlers.
- Do not duplicate OpenClaw bridge code across files.

## Types

- Add explicit return types on exported functions and route helpers.
- Prefer `type` for local unions and utility shapes; use `interface` for shared extendable contracts.
- Treat filesystem and gateway JSON as `unknown` until validated into typed shapes.
- Narrow nullable config fields before use instead of relying on non-null assertions.

## Components

- Do not pass secrets, tokens, or internal filesystem paths into client props.
- Keep client components focused on presentation and user interaction, not privileged data assembly.
- Any UI action that can change persisted state or trigger external effects must have a clear disabled state and confirmation path.
- Preserve visible labels and keyboard-triggerable controls when adding hardening UI.

## Endpoints

- Read-only routes are the default.
- Any route that writes state, sends messages, or exercises provider credentials must enforce auth, origin checks, rate limits, and an env feature flag.
- Side-effect routes must never expose `GET` aliases.
- Validate route params and body payloads before any filesystem access, gateway call, or subprocess invocation.
- Return sanitized client errors; keep raw filesystem and provider details in server logs only.
- Add caching or bounded work for analytics and scan-heavy endpoints.

## Functions & Modules

- Keep one responsibility per helper and reuse shared bridge utilities.
- Prefer `fs/promises` over sync filesystem calls in request paths.
- Prefer `execFile` or direct imports over shell invocation.
- Reject unsafe path resolution at one shared boundary instead of checking ad hoc in every route.
- Prefer deterministic control flow over placeholder randomness in production logic.

## Comments

- Explain why a security guard or constraint exists.
- Remove comments that restate obvious TypeScript or JSX.
- When a fix maps to an audit item, reference the finding ID in the comment or PR context, not inline everywhere.

## Error Handling

- Fail closed for auth, origin, validation, and feature-flag checks.
- Use explicit HTTP status codes for auth, validation, method, and rate-limit failures.
- Never echo raw `err.message` values from filesystem or provider failures to clients.
- Log enough server-side context to debug without logging secrets or user identifiers.

## Testing

- Add regression coverage for secret stripping, route method enforcement, env-flag gating, and sanitized errors.
- Add abuse-oriented tests for traversal, origin rejection, invalid payloads, and rate limits.
- Smoke test read-only dashboard pages with all sensitive feature flags turned off.
- Prefer tests that validate operator-visible behavior over implementation details.

## Dependencies

- Prefer built-in platform APIs and existing utilities before adding new packages.
- Add a dependency only when it materially reduces security or maintenance risk.
- Keep `package-lock.json` authoritative for installs and CI reproducibility.

## CI/CD

Platform: GitHub Actions

| Bundle | Status | Workflow |
|--------|--------|----------|
| Code Quality | configured | .github/workflows/quality.yml |
| Build & Test | configured | .github/workflows/test.yml |
| Security | configured | .github/workflows/security.yml |
| Integration | configured | .github/workflows/integration.yml |
| Operations | configured | .github/workflows/deploy.yml |

## Local Dev Tools

| Category | Tool | Config |
|----------|------|--------|
| Package Manager | npm | `package-lock.json` |
| Framework | Next.js App Router | `app/`, `next.config.mjs` |
| Type Safety | TypeScript | `tsconfig.json` |
| Styling | Tailwind CSS | `@tailwindcss/postcss` |
| Formatting | Biome | `biome.json` |
| Testing | Vitest | `vitest.config.ts` |
| Linting | Biome | `biome.json` |
| Git Hooks | husky + lint-staged | `.husky/`, `.lintstagedrc` |
| Dev Server | npm run dev | `next.config.mjs` |
| Database | not applicable | filesystem-backed runtime |
| Observability | Pino | `lib/logger.ts` |

## Infrastructure

| Component | Provider | Details |
|-----------|----------|---------|
| CDN/DNS | Cloudflare | `board.aiwithapex.com` |
| WAF | Cloudflare | OWASP ruleset enabled (manual config) |
| Hosting | Docker / VPS | Loopback-bound origin |
| Database | local filesystem | `OPENCLAW_HOME` directory |
| Health | Next.js API | `/api/health` |
| Security | Next.js Middleware | Rate limiting (100 req/min) & Security Headers |
| Backup | Local / R2 | `scripts/backup.sh` (tar of OPENCLAW_HOME, 7-day retention) |
| Deploy | GitHub Actions | Webhook trigger on push to main |
| Local Dev | `npm run dev` | Verified responding |

## Security Toggles

- Every sensitive feature flag must be documented in root `.env.example`.
- Sensitive flags default to `false` unless the product owner explicitly approves a safer default.
- Add new flags whenever a feature can change persisted state, send messages, or exercise third-party credentials.
- Read feature flags on the server and fail safely when a flag is missing or invalid.

## Documentation

- Keep `docs/SECURITY_MASTER.md` aligned with the current remediation plan and secure-default policy.
- Keep `docs/SECURITY_FINDINGS.md` aligned with finding status changes and verification results.
- Update deployment docs whenever a security default or required env flag changes.

## When In Doubt

- Protect secrets first
- Preserve read-only operator value
- Centralize the guard
- Document the decision
