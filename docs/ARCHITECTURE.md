# Architecture

## System Overview

OpenClaw Dashboard is a Next.js 16 App Router application that reads local OpenClaw runtime configuration and session data to provide an operator monitoring interface. It has no database -- all state is sourced from the `OPENCLAW_HOME` directory (defaulting to `~/.openclaw/`). Sensitive and mutating behavior is gated behind server-only environment flags and a two-layer operator auth boundary.

## Dependency Graph

```text
Browser (Operator)
   |
   |  Cloudflare Access (non-local only)
   v
Next.js Middleware (rate limiting, security headers)
   |
   +-- App Router Pages (Server Components + Client Components)
   |      |
   |      v
   +-- API Route Handlers (/app/api/*)
          |
          +-- lib/security/*      (auth, operator session, env flags, route guards)
          +-- lib/openclaw-*.ts   (config, CLI bridge, path resolution, bounded reads)
          +-- lib/pixel-office/*  (pixel office engine)
          |
          v
   Local Filesystem (~/.openclaw/)
          |
          +-- openclaw.json       (runtime configuration)
          +-- sessions/           (per-agent session data)
          +-- cron-store/         (cron job state)
          \-- skills/             (installed skills)
```

## Components

### Next.js Proxy (`proxy.ts`)
- **Purpose**: Security headers and rate limiting for all routes
- **Tech**: Next.js Proxy runtime
- **Location**: `proxy.ts`

### API Route Handlers
- **Purpose**: Server-side endpoints for config, health, stats, alerts, and operator actions
- **Tech**: Next.js App Router route handlers
- **Location**: `app/api/`

### Security Layer (`lib/security/`)
- **Purpose**: Centralized auth, operator elevation, env flag gating, and route guards
- **Tech**: TypeScript utilities consumed by route handlers
- **Location**: `lib/security/`

### OpenClaw Bridge (`lib/openclaw-*.ts`)
- **Purpose**: Config reading, CLI invocation, path resolution, and skill parsing
- **Tech**: TypeScript with filesystem and child-process access
- **Location**: `lib/openclaw-cli.ts`, `lib/openclaw-paths.ts`, `lib/openclaw-read-paths.ts`, `lib/openclaw-skills.ts`

### OpenClaw Read Paths (`lib/openclaw-read-paths.ts`)
- **Purpose**: Shared bounded async directory scans, file-size checks, and keyed cache reuse for heavy read routes
- **Tech**: TypeScript with `fs/promises`, in-memory TTL caching, and in-flight dedupe
- **Location**: `lib/openclaw-read-paths.ts`

### Pixel Office Engine (`lib/pixel-office/`)
- **Purpose**: Animated pixel-art office rendering with agent characters
- **Tech**: Canvas-based rendering with sprite engine
- **Location**: `lib/pixel-office/`

### Client Pages
- **Purpose**: Operator-facing monitoring UI for agents, models, sessions, stats, skills, and alerts
- **Tech**: React 19 Server and Client Components with Tailwind CSS
- **Location**: `app/` (page directories)

## Tech Stack Rationale

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| Next.js 16 | Full-stack framework | App Router provides server components, API routes, and proxy/runtime security hooks in one package |
| React 19 | UI rendering | Server Components for data fetching, Client Components for interactivity |
| TypeScript 5 | Type safety | Catch misuse of config shapes, route params, and security utilities at build time |
| Tailwind CSS 4 | Styling | Utility-first CSS with zero runtime overhead |
| Pino | Logging | Structured JSON logs without leaking secrets to the client |
| Biome | Linting and formatting | Single tool for code quality, replaces ESLint + Prettier |

## Data Layer

### Storage
- **Type**: Local filesystem
- **Location**: `OPENCLAW_HOME` directory (default `~/.openclaw/`)
- **No database** -- the dashboard reads OpenClaw's own config and session files

### Key Data Sources

| Source | Path | Purpose |
|--------|------|---------|
| Runtime config | `openclaw.json` | Agent definitions, model configs, platform bindings |
| Session files | `sessions/` | Per-agent conversation history and token usage |
| Cron store | `cron-store/` | Scheduled task state |
| Skills | `skills/` | Installed skill metadata |
| Alert config | `alerts.json` | Alert rule definitions (when writes enabled) |

## Data Flow

1. Operator loads a dashboard page (Server Component renders on the server).
2. Server Component or API route reads from `OPENCLAW_HOME` filesystem.
3. Sensitive metadata (tokens, absolute paths, platform IDs) is stripped before response.
4. Client Component receives sanitized data and renders the operator UI.
5. For mutations (when enabled via env flags), the client submits to an API route that enforces operator elevation before writing.

## Security Architecture

### Two-Layer Auth Boundary

```text
Layer 1: Cloudflare Access (non-local deployments)
  - Approved-email OTP login
  - 24-hour session cap
  - Allowed email: operator allowlist in .env

Layer 2: App-Side Operator Code (all environments)
  - Operator submits a code challenge
  - Server issues HTTP-only signed cookie
  - 12-hour elevated session cap
  - Required for writes, provider probes, outbound diagnostics
```

### Feature Flag Gating

All state-changing routes check server-only env flags before execution. When a flag is `false` (the default), the route returns 403 regardless of operator elevation status.

## Key Decisions

See [Architecture Decision Records](adr/) for detailed decision history.
