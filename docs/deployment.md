# Deployment

## Local Dev

### Start Everything

```bash
npm run dev
```

### Verify

```bash
curl http://localhost:3000/api/health
```

### Stop

`Ctrl+C` in the terminal running the dev server.

## Build Process

```bash
npm run build
```

Next.js produces a standalone output in `.next/standalone/` suitable for Docker or direct Node.js execution.
The `postbuild` step also syncs `.next/static/` and `public/` into the standalone tree so direct systemd launches serve the same hashed assets as the Docker image.

## Systemd (User Service, Non-Docker)

Use this path when running directly on a Linux host without Docker. The
tracked unit file lives at `deploy/systemd/openclaw-dashboard.service`.
The committed unit defaults to loopback port `51203`.

### Install/Update Unit

```bash
install -D -m 0644 deploy/systemd/openclaw-dashboard.service \
  ~/.config/systemd/user/openclaw-dashboard.service
systemctl --user daemon-reload
systemctl --user enable --now openclaw-dashboard.service
```

### Restart After Deploy

```bash
npm run build
systemctl --user restart openclaw-dashboard.service
```

### Verify

```bash
curl http://127.0.0.1:51203/api/health
systemctl --user status openclaw-dashboard.service --no-pager
```

## Cloudflare Tunnel (User Service)

For non-local access, keep the app loopback-only and publish it through
Cloudflare Tunnel + Access.

### One-Time Tunnel Bootstrap

```bash
cloudflared tunnel create openclaw-dashboard
cloudflared tunnel route dns --overwrite-dns <tunnel-uuid> board.aiwithapex.com
```

Create `~/.cloudflared/openclaw-dashboard.yml` from
`deploy/cloudflared/openclaw-dashboard.yml` by replacing `<tunnel-uuid>` with
the tunnel ID.

### Install/Run Tunnel Service

```bash
install -D -m 0644 deploy/systemd/openclaw-dashboard-tunnel.service \
  ~/.config/systemd/user/openclaw-dashboard-tunnel.service
systemctl --user daemon-reload
systemctl --user enable --now openclaw-dashboard-tunnel.service
```

### Verify

```bash
systemctl --user status openclaw-dashboard-tunnel.service --no-pager
curl -I https://board.aiwithapex.com
```

## Docker

### Build Image

```bash
docker build -t openclaw-dashboard .
```

### Run Container

Bind to loopback only. Direct exposure on `0.0.0.0` without an authenticated reverse proxy is unsupported.

```bash
docker run -d --name openclaw-dashboard \
  -p 127.0.0.1:3000:3000 \
  -v /path/to/openclaw:/root/.openclaw:ro \
  --env-file .env \
  openclaw-dashboard
```

The image itself also defaults to `HOSTNAME=127.0.0.1`, so the container and
the published port both stay loopback-only unless you deliberately override the
runtime settings.

### Verify

```bash
curl http://127.0.0.1:3000/api/health
```

### Stop

```bash
docker stop openclaw-dashboard
docker rm openclaw-dashboard
```

## Production Deploy (Cloudflare Access + Tunnel)

The standard non-local deployment uses `board.aiwithapex.com` behind Cloudflare Access with a Cloudflare Tunnel to the loopback-bound origin. Direct unauthenticated internet exposure is unsupported.

### Architecture

```text
Operator --> Cloudflare Access (OTP login) --> Cloudflare Tunnel --> 127.0.0.1:51203
```

### Setup

1. **Deploy the app** on a VPS or container host, bound to `127.0.0.1:3000`
2. **Install cloudflared** on the host and configure a tunnel pointing to `http://127.0.0.1:3000`
3. **Create a Cloudflare Access application** for `board.aiwithapex.com`:
   - Policy: allow `moshehwebservices@live.com` via One-Time PIN
   - Session duration: 24 hours
4. **Configure `.env`** with production values (see [Environments](environments.md))
   - Keep `ENABLE_OUTBOUND_TESTS=false` and `ENABLE_LIVE_SEND_DIAGNOSTICS=false`
     unless you are actively running protected diagnostics.

### Rollback

Redeploy the previous container image or git revision:

```bash
docker stop openclaw-dashboard
docker rm openclaw-dashboard
docker run -d --name openclaw-dashboard \
  -p 127.0.0.1:3000:3000 \
  -v /path/to/openclaw:/root/.openclaw:ro \
  --env-file .env \
  openclaw-dashboard:previous-tag
```

**When to rollback**: Health check fails post-deploy, error rate spikes, or critical bug reported.

## CI/CD Pipeline

```text
Push to main --> Build & Test --> Security Checks --> Integration --> Deploy (webhook)
```

Deployment is triggered by a push to `main` after all required workflows pass. The deploy job calls a webhook (e.g. Coolify) and runs a post-deploy smoke test against `/api/health`.

See `.github/workflows/deploy.yml` for the full workflow.

## Backup

```bash
bash scripts/backup.sh
```

Creates a tar archive of `OPENCLAW_HOME` with 7-day retention. Set `S3_BUCKET` to upload to R2/S3.

## Environments

| Environment | URL | Deploy Trigger |
|-------------|-----|----------------|
| Local | http://localhost:3000 | Manual (`npm run dev`) |
| Production | https://board.aiwithapex.com | Push to `main` (after CI passes) |

## Monitoring

- **Health**: `GET /api/health`
- **Logs**: Pino structured JSON logs (stdout)
- **Gateway health**: Sidebar indicator with 10s auto-polling
