# Security Items Outside PRD Scope

## Purpose

This is the only remaining file under `docs/ongoing-projects/`. It holds work that is intentionally outside the current scope of `.spec_system/PRD/PRD.md`.

The in-scope audit backlog, phase mapping, and validation gates now live in `.spec_system/PRD/PRD.md`. Root `SECURITY.md` is the canonical policy document and live status register.

## Outside Current PRD Scope

| Item | Why It Is Outside the Current PRD | Re-Entry Trigger |
|------|-----------------------------------|------------------|
| Gateway credential rotation, scoping, or revocation inside OpenClaw | Requires changes to the gateway product rather than the dashboard | A separate gateway security project or a product requirement to manage token lifecycle from the dashboard |
| Session archival, retention, or large-store lifecycle controls | Depends on runtime ownership beyond dashboard hardening | Storage or performance work after dashboard hardening lands |
| Host and container hardening follow-ons such as read-only mounts, reverse-proxy connection limits, or process supervision | Operational follow-on work, not required to complete the current dashboard code hardening scope | A dedicated infrastructure or deployment-hardening project |
| Multi-user auth, RBAC, or public SaaS expansion | Conflicts with the current trusted-operator and owner-only access model | Product decision to support more than one trusted operator |
| Moving runtime state off the local filesystem or adding a database | Architectural change outside the current dashboard hardening goal | Separate architecture initiative |
| Alternate non-Cloudflare remote access recipes | The current standard deployment is Cloudflare Access plus Tunnel | A future deployment requirement that the current standard cannot satisfy |

## Notes

- Historical security audit chunk files were consolidated into `.spec_system/PRD/PRD.md` on 2026-03-31.
- If future work is not represented in Appendix A or Appendix B of the PRD, it belongs here until the PRD is explicitly expanded.
- Closeout review on 2026-03-31 found no additional outside-PRD security items; the current list remains accurate.
