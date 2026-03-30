# Session 03: Safe defaults and deployment baseline

**Session ID**: `phase00-session03-safe-defaults-and-deployment-baseline`
**Status**: Not Started
**Estimated Tasks**: ~12-18
**Estimated Duration**: 2-4 hours

---

## Objective

Disable side effects by default, remove `GET` side-effect aliases, and align
root env plus deployment docs around loopback and Cloudflare Access defaults.

---

## Scope

### In Scope (MVP)

- Disable mutating and side-effect behavior by default through server-only env
  controls
- Remove `GET` aliases or equivalent convenience paths for side-effect routes
- Align localhost, Docker, and Cloudflare Access deployment guidance with the
  hardened model
- Make dry-run or explicitly opt-in operator diagnostics the default pattern

### Out of Scope

- Route-by-route abuse controls and diagnostics determinism planned for Phase 01
- Runtime bridge deduplication and read-path performance work planned for Phase 02
- Final documentation audit and findings reconciliation planned for Phase 03

---

## Prerequisites

- [ ] Sessions 01 and 02 have established the auth baseline and secret
      containment model
- [ ] Sensitive routes and side-effect features are fully inventoried
- [ ] Deployment guidance inputs for localhost, Docker, and Cloudflare Access
      are available

---

## Deliverables

1. Default-off server-only env flags for sensitive and side-effect features
2. Removal of `GET` side-effect aliases and equivalent unsafe convenience paths
3. Updated deployment and env guidance for loopback and Cloudflare Access usage

---

## Success Criteria

- [ ] Sensitive and side-effect features default to disabled in every environment
- [ ] `GET` requests cannot trigger side effects on protected routes
- [ ] Deployment guidance matches the intended localhost and Cloudflare Access
      security model
- [ ] Phase 00 exits with a clear secure-default baseline for later hardening
