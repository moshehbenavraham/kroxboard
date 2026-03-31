# Development Guide

## Local Environment

### Required Tools

- Node.js 22+
- npm (ships with Node.js)
- OpenClaw runtime with valid `openclaw.json`

### Port Mappings

| Service | Port | URL |
|---------|------|-----|
| Next.js dev server | 3000 | http://localhost:3000 |

## Dev Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Next.js dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm test` | Run Vitest test suite |
| `npm run test:watch` | Run tests in watch mode |

## Project Layout

| Directory | Purpose |
|-----------|---------|
| `app/` | Next.js App Router pages, layouts, and API route handlers |
| `app/api/` | Server-side API endpoints |
| `lib/` | Shared utilities (security, bridge, i18n, logging) |
| `lib/security/` | Auth, operator session, env flag checks, route guards |
| `lib/pixel-office/` | Pixel office rendering engine |
| `*.test.ts[x]` | Co-located Vitest test files next to the code they cover |
| `scripts/` | Operational scripts (backup) |
| `public/` | Static assets |
| `docs/` | Project and security documentation |

## Environment Variables

The dashboard uses server-only environment variables. See `.env.example` for the full inventory. Key categories:

- **Cloudflare Access** -- `DASHBOARD_CF_ACCESS_*` keys for non-local auth boundary
- **Operator elevation** -- `DASHBOARD_OPERATOR_*` keys for in-app sensitive route protection
- **Feature flags** -- `ENABLE_*` keys that gate mutating/side-effect routes (all default to `false`)

Never use `NEXT_PUBLIC_` for sensitive configuration.

## Development Workflow

1. Pull latest `develop`
2. Create feature or security branch (`feature/*`, `security/*`, `fix/*`)
3. Make changes following `.spec_system/CONVENTIONS.md`
4. Run `npm test` and verify the build with `npm run build`
5. Open PR referencing the relevant spec session or finding ID

## Testing

```bash
# Run all unit tests
npm test

# Watch mode
npm run test:watch
```

Playwright is available for end-to-end tests:

```bash
npx playwright test
```

## Code Quality

Biome handles both formatting and linting:

```bash
npx biome check .
npx biome format --write .
```

Git hooks via husky + lint-staged run Biome automatically on staged files.

## Debugging

### API route returns 401/403

Check which auth layer is rejecting the request:
- **401** typically means operator elevation is missing or expired
- **403** typically means a feature flag is disabled in `.env`

### Config not loading

Verify `OPENCLAW_HOME` points to a valid directory containing `openclaw.json`. The default is `~/.openclaw/`.

### Slow page loads

Heavy endpoints may perform filesystem scans. Check if caching is enabled for the affected route. The security hardening project is adding cache and concurrency bounds (Phase 02).
