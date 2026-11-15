# Transfer and local validation notes

This archive contains the original MVP source with a structural TypeScript fix in `apps/api/src/audits.controller.ts`: artifact handlers are inside `AuditsController`.

## Validation status

- ZIP integrity: checked.
- Corrected controller syntax: checked separately.
- Full dependency installation, typecheck, and build: not yet completed; npm registry access was unavailable in the preparation environment.
- Docker services: not started.
- Production readiness: not established. Review `docs/SECURITY.md` and `docs/MVP-1.0.0-AUDIT.md` before exposing any service publicly.

## Local setup

Requirements: Node.js 22+, Corepack with pnpm 10, Git for Windows, and Docker Compose. PostgreSQL and Redis are bound to localhost in the supplied Compose file.

```bash
corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm install
cp .env.example .env
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm build
```

## Import to GitHub (Windows)

1. Extract the ZIP archive.
2. Open PowerShell in the extracted `web-project-control-center` folder.
3. Run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\push-to-github.ps1
```

The script clones the existing `v2-foundation` branch, copies application source and workspace files, preserves existing README/docs, and pushes a normal commit. It does not force-push. Git for Windows and GitHub authentication are required.

## CI

The GitHub Actions workflow installs pnpm 10, installs dependencies, generates Prisma Client, then runs typecheck and build. It skips validation until the workspace root files are present. A successful CI run is still pending.

## Verification attempt — 2026-11-15

A local TypeScript check was attempted with the globally available compiler, but the workspace dependencies are not installed. The reported diagnostics include unresolved packages and missing generated Prisma Client types; these results are therefore inconclusive and are not represented as a successful typecheck.

Corepack was then used to request pnpm 10.0.0, but package-manager download failed because the environment could not resolve `registry.npmjs.org` (`EAI_AGAIN`). Consequently, dependency installation and the full build could not be run in this environment.

The source archive itself passed ZIP integrity validation. This confirms archive integrity only, not application correctness.
