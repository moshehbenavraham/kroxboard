# OpenClaw Dashboard

A lightweight web dashboard for viewing all your [OpenClaw](https://github.com/openclaw/openclaw) agents, models, sessions, and operational status at a glance. No database required -- everything is derived directly from `~/.openclaw/openclaw.json` and local session files.

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
|   |-- alerts/            # Alert center page
|   |-- models/            # Model list page
|   |-- pixel-office/      # Pixel-art office page
|   |-- sessions/          # Session management page
|   |-- skills/            # Skill management page
|   \-- stats/             # Statistics page
|-- lib/                   # Shared server and client utilities
|   |-- security/          # Auth, operator session, env flags, route guards
|   \-- pixel-office/      # Pixel office engine and rendering
|-- docs/                  # Project and security documentation
|-- scripts/               # Operational scripts (backup, etc.)
|-- tests/                 # Test suites
|-- public/                # Static assets
\-- .spec_system/          # Specification-driven development state
```

## Documentation

- [Getting Started](docs/onboarding.md)
- [Development Guide](docs/development.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment](docs/deployment.md)
- [Environments](docs/environments.md)
- [Contributing](CONTRIBUTING.md)
- [Security Master Plan](docs/SECURITY_MASTER.md)
- [Security Findings Register](docs/SECURITY_FINDINGS.md)

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
- **i18n** -- Chinese and English UI language switching
- **Auto Refresh** -- Configurable refresh interval (manual, 10s, 30s, 1min, 5min, 10min)
- **Live Config** -- Reads directly from `~/.openclaw/openclaw.json`, no database needed

## Tech Stack

- **Next.js 16** (App Router) -- UI shell and API routing
- **React 19** -- Client-side operator interactions
- **TypeScript 5** -- Type-safe route, utility, and component code
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

See [Deployment Guide](docs/deployment.md) for Cloudflare Tunnel and production setup.

## Project Status

See [PRD](.spec_system/PRD/PRD.md) for current progress and roadmap.

## License

[MIT](LICENSE)
