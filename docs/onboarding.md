# Onboarding

Zero-to-hero checklist for new developers.

## Prerequisites

- [ ] Node.js 22+ installed
- [ ] npm available (ships with Node.js)
- [ ] OpenClaw installed with config at `~/.openclaw/openclaw.json`
- [ ] Access to the project repository

## Setup Steps

### 1. Clone Repository

```bash
git clone <repo-url>
cd kroxboard
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with real values for operator secrets:

| Variable | Where to Get | Description |
|----------|--------------|-------------|
| `DASHBOARD_OPERATOR_CODE` | Generate a long random string | In-app operator challenge code |
| `DASHBOARD_OPERATOR_COOKIE_SECRET` | Generate at least 32 random characters | Signs the HTTP-only elevated session cookie |
| `DASHBOARD_CF_ACCESS_AUD` | Cloudflare Access dashboard | Application audience tag (non-local only) |

All sensitive feature flags default to `false` -- no additional configuration needed for read-only monitoring.

### 4. Start Development

```bash
npm run dev
```

### 5. Verify Setup

- [ ] App runs at [http://localhost:3000](http://localhost:3000)
- [ ] Dashboard loads and shows agent cards
- [ ] Tests pass: `npm test`
- [ ] Gateway health indicator appears in sidebar

## Common Issues

### OpenClaw config not found

The dashboard looks for `~/.openclaw/openclaw.json` by default. If your config is elsewhere, set `OPENCLAW_HOME`:

```bash
OPENCLAW_HOME=/path/to/openclaw npm run dev
```

### Port 3000 already in use

Next.js will automatically pick the next available port, or specify one:

```bash
PORT=3001 npm run dev
```

### Sensitive routes returning 403

This is expected when feature flags are disabled (the default). Enable specific flags in `.env` only when you need to test mutation flows. See `.env.example` for the full list.
