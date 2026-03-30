# Incident Response

## Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| P0 | Complete outage or active security breach | Immediate |
| P1 | Major feature broken or secret exposure detected | < 1 hour |
| P2 | Minor feature broken or degraded performance | < 4 hours |
| P3 | Cosmetic or low-impact issue | Next business day |

## On-Call Contacts

| Role | Contact |
|------|---------|
| Primary Operator | moshehwebservices@live.com |

## Common Incidents

### Dashboard unreachable at board.aiwithapex.com

**Symptoms**: Browser shows Cloudflare error or timeout

**Resolution**:
1. Check Cloudflare Tunnel status: `cloudflared tunnel info`
2. Verify the origin is running: `curl http://127.0.0.1:3000/api/health`
3. If origin is down, restart: `docker restart openclaw-dashboard`
4. If Tunnel is down, restart cloudflared service

### Gateway health shows unhealthy

**Symptoms**: Sidebar gateway indicator turns red

**Resolution**:
1. Check OpenClaw gateway process is running
2. Verify `openclaw.json` has valid gateway configuration
3. Test gateway directly outside the dashboard
4. Check Pino logs for connection errors

### Sensitive routes returning unexpected 403

**Symptoms**: Operator actions fail even after elevation

**Resolution**:
1. Check `.env` feature flags -- the relevant `ENABLE_*` flag may be `false`
2. Verify operator session cookie has not expired (12-hour cap)
3. Re-submit operator code challenge
4. Check Pino logs for the specific rejection reason

### High request rate / 429 responses

**Symptoms**: Dashboard pages return "Too many requests"

**Resolution**:
1. Middleware rate limit is 100 requests per minute per IP
2. If legitimate traffic, check for runaway auto-refresh or AlertMonitor amplification
3. Wait 60 seconds for the rate limit window to reset
4. If under attack, verify Cloudflare WAF rules are active

### Backup failure

**Symptoms**: `scripts/backup.sh` exits with error

**Resolution**:
1. Verify `OPENCLAW_HOME` directory exists and is readable
2. Verify `BACKUP_DIR` has write permissions
3. Check disk space
4. For R2/S3 uploads, verify `S3_BUCKET` and credentials are configured
