# Repository Guidelines

## Project Structure & Module Organization
`app/` contains the Next.js 16 App Router UI, layouts, and API handlers. Keep route files in `app/api/*/route.ts` thin and move reusable logic into `lib/`. Shared security, OpenClaw bridge, logging, and client helpers live in `lib/`, with sensitive guards under `lib/security/` and the pixel renderer under `lib/pixel-office/`. Co-located unit and component tests use `*.test.ts` or `*.test.tsx` beside the source. Playwright end-to-end tests live in `tests/`. Reference docs and specs are under `docs/` and `.spec_system/`.

## Build, Test, and Development Commands
Use Node.js 22+ and install with `npm install`.

- `npm run dev` starts the local dashboard at `http://localhost:3000`.
- `npm run build` creates the production build.
- `npm start` serves the production build.
- `npm test` runs the Vitest suite in `jsdom`.
- `npm run test:watch` runs Vitest in watch mode.
- `npx playwright test` runs browser E2E tests from `tests/`.
- `npx biome check .` validates formatting and lint rules; `npx biome format --write .` rewrites files.

## Coding Style & Naming Conventions
Biome is the source of truth for formatting: tabs for indentation, double quotes, and organized imports. Use `PascalCase` for React components and exported types, `camelCase` for functions and variables, and `UPPER_SNAKE_CASE` for env vars and constants. Default to Server Components; add `"use client"` only for browser APIs or interactive state. Prefer explicit, safe-by-default route and filesystem code over clever shortcuts.

## Testing Guidelines
Vitest covers `**/*.test.{ts,tsx}` and `**/*.spec.{ts,tsx}` except `tests/**`, which is reserved for Playwright. Add regression tests for new API routes, auth boundaries, feature flags, and sanitized error paths. Maintain coverage on guarded modules listed in [`vitest.config.ts`](/home/krox/kroxboard/vitest.config.ts). Name new tests after the behavior under test, for example `app/api/alerts/route.test.ts`.

## Commit & Pull Request Guidelines
Recent history mixes imperative closeout summaries with Conventional Commits; prefer Conventional Commit prefixes from [`CONTRIBUTING.md`](/home/krox/kroxboard/CONTRIBUTING.md): `feat:`, `fix:`, `security:`, `docs:`, `refactor:`, `test:`, `chore:`. Use topic branches such as `feature/*`, `fix/*`, or `security/*`. PRs should explain the change, reference the relevant spec session or security finding ID, note config or docs updates, and confirm `npm test` plus `npm run build` passed.

## Security & Configuration Tips
Copy `.env.example` to `.env` for local setup. Never commit secrets, operator codes, or cookie secrets. Sensitive behavior is gated by server-only `ENABLE_*` flags and `DASHBOARD_OPERATOR_*` settings; keep new secrets out of `NEXT_PUBLIC_` variables. When adding mutating or external-effect routes, enforce auth, origin checks, rate limits, and fail-closed defaults.
