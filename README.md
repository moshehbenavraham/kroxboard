# OpenClaw Dashboard

A lightweight web dashboard for viewing all your [OpenClaw](https://github.com/openclaw/openclaw) agents, models, sessions, and operational status at a glance. No database required -- everything is derived directly from `~/.openclaw/openclaw.json` and local session files.

## Project Origin

- Historical source repo referenced in earlier README versions: [xmanrui/OpenClaw-bot-review](https://github.com/xmanrui/OpenClaw-bot-review) & original author credit: [xmanrui](https://github.com/xmanrui)
- Related runtime/orchestrator project monitored by this dashboard: [openclaw/openclaw](https://github.com/openclaw/openclaw)

## Quick Start

```bash
cp .env.example .env
# Edit .env with your operator code and cookie secret
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Repository Structure

```text
.
|-- app/                   # Next.js App Router pages, layouts, and API routes
|   |-- api/               # Server-side API route handlers
|   |-- components/        # Shared UI (agent cards, operator elevation)
|   |-- alerts/            # Alert center page
|   |-- gateway/           # Catch-all gateway proxy route
|   |-- models/            # Model list page
|   |-- pixel-office/      # Pixel-art office page (+ editor components)
|   |-- sessions/          # Session management page
|   |-- skills/            # Skill management page
|   \-- stats/             # Statistics page
|-- lib/                   # Shared server and client utilities
|   |-- security/          # Auth, operator session, env flags, route guards
|   \-- pixel-office/      # Pixel office engine and rendering
|-- deploy/                # Deployment config (cloudflared, systemd units)
|-- docs/                  # Project and security documentation
|   |-- design/            # Feature design documents
|   |-- plans/             # Implementation plans
|   \-- runbooks/          # Operational response procedures
|-- scripts/               # Build helpers and operational scripts
|-- tests/                 # Playwright end-to-end tests
|-- *.test.ts[x]           # Co-located unit, route, and component tests
|-- public/                # Static assets (platform logos)
\-- .spec_system/          # Specification-driven development state
```

## Documentation

- [Quick Start](docs/quick-start.md)
- [Getting Started](docs/onboarding.md)
- [Development Guide](docs/development.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/deployment.md)
- [Environments](docs/environments.md)
- [Contributing](CONTRIBUTING.md)
- [Security Policy and Findings](SECURITY.md)

## Features

- **Bot Overview** -- Card wall showing all agents with name, emoji, model, platform bindings, session stats, and gateway health
- **Model List** -- All configured providers and models with context window, max output, and reasoning support
- **Session Management** -- Browse sessions per agent with type detection (DM, group, cron) and token usage
- **Statistics** -- Token consumption and average response time trends with daily/weekly/monthly views
- **Skill Management** -- View installed skills (built-in, extension, custom) with search and filter
- **Alert Center** -- Configure alert rules with notification delivery (requires env enablement)
- **Gateway Health** -- Real-time gateway status indicator with auto-polling
- **Pixel Office** -- Animated pixel-art office where agents appear as walking, sitting characters
- **Dark/Light Theme** -- Theme switcher in sidebar
- **i18n** -- Locale switcher (Traditional Chinese, Simplified Chinese, English)
- **Auto Refresh** -- Configurable refresh interval (manual, 10s, 30s, 1min, 5min, 10min)
- **Live Config** -- Reads directly from `~/.openclaw/openclaw.json`, no database needed

## Tech Stack

- **Next.js 16** (App Router) -- UI shell and API routing
- **React 19** -- Client-side operator interactions
- **TypeScript 6** -- Type-safe route, utility, and component code
- **Tailwind CSS 4** -- Styling system
- **Pino** -- Structured server-side logging
- **Biome** -- Formatting and linting
- **Vitest** -- Unit and integration tests
- **Playwright** -- End-to-end tests

## Requirements

- Node.js 22+
- OpenClaw installed with config at `~/.openclaw/openclaw.json`

## Configuration

By default the dashboard reads config from `~/.openclaw/openclaw.json`. Set `OPENCLAW_HOME` to use a custom path:

```bash
OPENCLAW_HOME=/opt/openclaw npm run dev
```

Optional path overrides can also live in your root `.env` when you need a
non-default file layout inside that runtime tree:

```bash
OPENCLAW_CONFIG_PATH=config/openclaw.json
OPENCLAW_ALERTS_PATH=config/alerts.json
OPENCLAW_CRON_STORE_PATH=cron-store/jobs.json
```

Relative override values resolve from `OPENCLAW_HOME` and must stay within the
approved OpenClaw runtime directories.

Production deployments where the dashboard, workspace, skills, and codebase live
in separate directories can set additional path references in `.env`:

```bash
KROXBOARD_PROJECT_DIR=/path/to/kroxboard/
OPENCLAW_WORKSPACE_DIR=/path/to/workspace/
OPENCLAW_CUSTOM_SKILLS_DIR=/path/to/.agents/skills/
OPENCLAW_CODEBASE_DIR=/path/to/openclaw/
```

### Operator Auth

Sensitive dashboard actions use a two-layer operator boundary:

1. **Non-local access** must arrive through Cloudflare Access at `board.aiwithapex.com` and present an allowed operator email.
2. **Sensitive actions** require an in-app operator code challenge that issues a bounded HTTP-only session cookie for write and diagnostic routes.

Local development on `localhost` works without Cloudflare Access, but the operator code challenge still applies to sensitive routes.

Set the following in your root `.env` (see `.env.example` for all keys):

```bash
DASHBOARD_OPERATOR_CODE=replace-with-long-random-operator-code
DASHBOARD_OPERATOR_COOKIE_SECRET=replace-with-32-byte-random-secret
DASHBOARD_OPERATOR_SESSION_HOURS=12
```

Read-only monitoring routes remain available without elevation. The challenge applies only to mutations, provider probes, and outbound diagnostics.

### Sensitive Feature Flags

All state-changing behavior is disabled by default. Enable selectively in `.env`:

```bash
ENABLE_MODEL_MUTATIONS=false
ENABLE_ALERT_WRITES=false
ENABLE_PIXEL_OFFICE_WRITES=false
ENABLE_PROVIDER_PROBES=false
ENABLE_OUTBOUND_TESTS=false
ENABLE_LIVE_SEND_DIAGNOSTICS=false
```

`ENABLE_OUTBOUND_TESTS=true` unlocks the protected diagnostic routes, but they
still run in dry-run mode until `ENABLE_LIVE_SEND_DIAGNOSTICS=true`. Keep
live-send disabled unless you intentionally want platform diagnostics or alert
checks to deliver real messages.

## Docker Deployment

```bash
docker build -t openclaw-dashboard .

# Bind to loopback only -- do not expose on 0.0.0.0 without an
# authenticated reverse proxy such as Cloudflare Tunnel.
docker run -d --name openclaw-dashboard \
  -p 127.0.0.1:3000:3000 \
  -v /path/to/openclaw:/root/.openclaw:ro \
  --env-file .env \
  openclaw-dashboard
```

The `deploy/` directory contains ready-made cloudflared and systemd unit
templates. See [Deployment Guide](docs/deployment.md) for Cloudflare Tunnel and
production setup.

## License

[MIT](LICENSE)
