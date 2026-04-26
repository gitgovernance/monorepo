# @gitgov/e2e

Cross-package E2E tests for the GitGovernance monorepo. Tests run against real infrastructure: CLI binary (`node gitgov.mjs`), PostgreSQL database, GitHub API, and filesystem.

> Para reglas de desarrollo, blocks, tiempos, y arquitectura ver el [AGENTS.md del package](../../packages/blueprints/03_products/e2e/AGENTS.md).

## Core Dependency

This package depends on `@gitgov/core` for all record types, audit types, and adapters. Never redefine types — import from `@gitgov/core`.

## Prerequisites

```bash
# 1. Build CLI (required for CLI-based tests)
cd packages/cli && pnpm build

# 2. PostgreSQL (required for projection tests)
docker run -d --name gitgov-pg -e POSTGRES_USER=gitgov -e POSTGRES_PASSWORD=gitgov -e POSTGRES_DB=gitgov_dev -p 5432:5432 postgres:16

# 3. GitHub token (required for T2 tests — T1 tests skip gracefully)
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

`globalSetup.ts` creates the 2 E2E databases (`gitgov_e2e_protocol`, `gitgov_e2e_audit`) and runs `prisma db push` automatically.

## Environment Variables

| Variable | Required for | Default |
|---|---|---|
| `DATABASE_URL_PROTOCOL` | Blocks B, D, E | `postgresql://gitgov:gitgov@localhost:5432/gitgov_e2e_protocol` |
| `DATABASE_URL_AUDIT` | Block CBA | `postgresql://gitgov:gitgov@localhost:5432/gitgov_e2e_audit` |
| `GITHUB_TOKEN` | Blocks C, D, E, F | — |
| `GITHUB_TEST_OWNER` | Blocks C, D, E, F | `gitgovernance` |
| `GITHUB_TEST_REPO_NAME` | Blocks C, D, E, F | `e2e-test-repo` |
| `GITHUB_TEST_REPO` | Blocks C, D, E, F | `git@github.com:gitgovernance/e2e-test-repo.git` |
| `GITLAB_TOKEN` | Block J | — |
| `GITLAB_TEST_PROJECT_ID` | Block J | — |
| `SKIP_CLEANUP` | Debug | `0` |

A `.env` file in `packages/e2e/` is loaded automatically by vitest.

## Running Tests

All tests are **autonomous** — no human interaction required (unlike e2e-private which needs Playwright OAuth).

```bash
cd packages/e2e

# T1: Fast, no GitHub (~30s)
pnpm vitest run tests/cli_records.test.ts tests/projection_protocol.test.ts tests/projection_audit.test.ts tests/audit_orchestration.test.ts tests/policy_evaluation.test.ts tests/redaction.test.ts

# T2: With GitHub (~2min, needs GITHUB_TOKEN)
pnpm vitest run tests/github.test.ts tests/cross_path.test.ts tests/parity.test.ts tests/change_detection.test.ts

# All tests
pnpm test

# GitLab only
pnpm test:gitlab

# Debug: keep temp dirs and DB rows
SKIP_CLEANUP=1 pnpm test
```

## Test Blocks

Each block is independent and self-contained. No block depends on another.

| Block | File | EARS | Tier | Requires | What it tests |
|---|---|---|---|---|---|
| A | `cli_records.test.ts` | CA1-CA9 | T1 | CLI build | CLI creates 7 record types on disk |
| B | `projection_protocol.test.ts` | CB1-CB11 | T1 | CLI + PostgreSQL | Protocol records projected to DB |
| CBA | `projection_audit.test.ts` | CBA1-CBA6 | T1 | PostgreSQL | SARIF → audit projection → DB |
| C | `github.test.ts` | CC1-CC5 | T2 | GitHub token | GitHubRecordStore against real GitHub |
| D | `cross_path.test.ts` | CD1-CD5 | T2 | CLI + PostgreSQL + GitHub | CLI ↔ GitHub cross-path |
| E | `parity.test.ts` | CE1-CE3 | T2 | CLI + PostgreSQL + GitHub | FS vs Prisma vs GitHub parity |
| F | `change_detection.test.ts` | CF1-CF4 | T2 | CLI + PostgreSQL + GitHub | Delta detection, pushState, concurrency |
| G | `audit_orchestration.test.ts` | CG1-CG16 | T1 | — | Pipeline: orchestrator → agent → SARIF → policy |
| H | `policy_evaluation.test.ts` | CH1-CH4 | T1 | — | PolicyEvaluator + ExecutionRecord decision |
| I | `redaction.test.ts` | CI1-CI4 | T1 | — | Snippet redaction L1/L2 + fingerprint integrity |
| J | `gitlab.test.ts` | CJ1-CJ8 | T2 | GitLab token | GitLabRecordStore against real GitLab |

## Troubleshooting

**Tests hang on GitHub blocks:** Check `GITHUB_TOKEN` is valid. Expired tokens cause silent hangs.

**CLI command fails:** Run `cd packages/cli && pnpm build` first. Tests use the built `gitgov.mjs`, not source.

**DB connection refused:** Start Docker. `globalSetup.ts` creates databases automatically.

**GitHub rate limit:** Space out T2 runs. Multiple runs in quick succession can trigger secondary rate limits.

## License

MPL-2.0
