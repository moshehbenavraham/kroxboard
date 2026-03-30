# Contributing

## Branch Conventions

- `main` -- Production-ready code
- `develop` -- Integration branch
- `feature/*` -- New features
- `fix/*` -- Bug fixes
- `security/*` -- Security hardening work

## Commit Style

Use conventional commits:

- `feat:` New feature
- `fix:` Bug fix
- `security:` Security hardening or audit remediation
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Build, CI, or dependency updates

## Pull Request Process

1. Create feature branch from `develop`
2. Make changes with clear commits
3. Run `npm test` and verify the build passes
4. Update documentation if behavior changes
5. Open PR with description referencing the relevant spec session or finding ID
6. Address review feedback
7. Squash and merge

## Code Review Norms

- Review within 24 hours
- Be constructive and specific
- Approve when ready, request changes when not

## Security Considerations

- Never commit secrets, tokens, or operator codes
- Keep sensitive feature flags server-only (no `NEXT_PUBLIC_` prefix)
- Reference audit finding IDs (SYN-XX) when fixing security items
- Follow the conventions in `.spec_system/CONVENTIONS.md`
