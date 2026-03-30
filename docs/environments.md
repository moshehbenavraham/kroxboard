# Environments

## Environment Overview

| Environment | URL | Purpose |
|-------------|-----|---------|
| Development | http://localhost:3000 | Local development and testing |
| Production | https://board.aiwithapex.com | Operator access via Cloudflare Access |

Direct public origin exposure without an authenticated reverse proxy is unsupported.

## Configuration Differences

| Config | Development | Production |
|--------|-------------|------------|
| Bind address | `localhost:3000` | `127.0.0.1:3000` (behind Cloudflare Tunnel) |
| Cloudflare Access | Not required | Required (`DASHBOARD_CF_ACCESS_ENABLED=true`) |
| Operator code | Required for sensitive routes | Required for sensitive routes |
| Feature flags | All disabled by default | All disabled by default |
| NODE_ENV | `development` | `production` |

## Environment Variables

### Required in All Environments

- `DASHBOARD_OPERATOR_CODE` -- In-app operator challenge code for sensitive routes
- `DASHBOARD_OPERATOR_COOKIE_SECRET` -- Signs the HTTP-only elevated session cookie (32+ chars)
- `DASHBOARD_OPERATOR_SESSION_HOURS` -- Elevated session duration (max 12)

### Production Only

- `DASHBOARD_CF_ACCESS_ENABLED=true` -- Enforce Cloudflare Access boundary
- `DASHBOARD_CF_ACCESS_AUD` -- Cloudflare Access application audience tag
- `DASHBOARD_ALLOWED_EMAILS` -- Comma-separated operator email allowlist
- `DASHBOARD_HOST` -- Public hostname (`board.aiwithapex.com`)

### Optional Feature Flags (All Environments)

All default to `false`. Enable only when the operator needs the capability:

- `ENABLE_MODEL_MUTATIONS` -- Allow model configuration changes
- `ENABLE_ALERT_WRITES` -- Allow alert rule modifications
- `ENABLE_PIXEL_OFFICE_WRITES` -- Allow pixel office layout changes
- `ENABLE_PROVIDER_PROBES` -- Allow LLM provider connectivity tests
- `ENABLE_OUTBOUND_TESTS` -- Allow platform connectivity tests
- `ENABLE_LIVE_SEND_DIAGNOSTICS` -- Allow live message sending (vs dry-run)
