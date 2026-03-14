# @gitgov/e2e

Cross-package E2E tests for the GitGovernance monorepo. Tests run against real infrastructure: CLI binary (`node gitgov.mjs`), PostgreSQL database, GitHub API, and filesystem.

## Prerequisites

```bash
# 1. Build CLI (required for all tests)
cd packages/cli && pnpm build
# Produces build/dist/gitgov.mjs

# 2. PostgreSQL (required for Blocks B, D, E, F)
docker compose up -d
# PostgreSQL at localhost:5432

# 3. Prisma migrations
cd packages/core && npx prisma migrate deploy

# 4. GitHub token (required for Blocks C, D, F — others skip gracefully)
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

## Environment Variables

| Variable                | Required       | Default                                                | Used by                                                |
| ----------------------- | -------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| `DATABASE_URL`          | Blocks B,D,E,F | `postgresql://gitgov:gitgov@localhost:5432/gitgov_dev` | Prisma + projection                                    |
| `GITHUB_TOKEN`          | Blocks C,D,F   | —                                                      | GitHub API auth                                        |
| `GITHUB_TEST_OWNER`     | Blocks C,D,F   | —                                                      | `gitgovernance`                                        |
| `GITHUB_TEST_REPO_NAME` | Blocks C,D,F   | —                                                      | `e2e-test-repo`                                        |
| `GITHUB_TEST_REPO`      | Blocks C,D,F   | —                                                      | `git@github.com:gitgovernance/e2e-test-repo.git`       |
| `SKIP_CLEANUP`          | Optional       | `0`                                                    | Set to `1` to keep temp dirs and DB rows for debugging |

A `.env` file in `packages/e2e/` is loaded automatically by vitest.

## GitHub Test Repository

Tests that interact with GitHub use a dedicated test repo:

**https://github.com/gitgovernance/e2e-test-repo**

This repo is used for:

- Pushing/pulling `.gitgov/` state branches
- Testing `GitHubRecordStore` reads/writes
- Cross-path validation (CLI local vs GitHub remote)
- Change detection and sync state

Tests create isolated branches per run and clean up in `afterAll`.

## Running Tests

```bash
cd packages/e2e

# All tests (requires Docker + GitHub token)
pnpm test

# Local-only tests (no GitHub, no external deps beyond PostgreSQL)
pnpm test:local

# With GitHub integration
pnpm test:github

# Single block
pnpm vitest run tests/cli_records.test.ts
pnpm vitest run tests/projection.test.ts
pnpm vitest run tests/github.test.ts
```

## Test Blocks

Each block is independent and self-contained. No block depends on another having run first.

| Block | File                       | EARS    | Requires                  | What it tests                                                  |
| ----- | -------------------------- | ------- | ------------------------- | -------------------------------------------------------------- |
| A     | `cli_records.test.ts`      | CA1-CA9 | CLI build                 | CLI creates 7 record types on disk                             |
| B     | `projection.test.ts`       | CB1-CB8 | CLI + PostgreSQL          | Records projected to DB via RecordProjector                    |
| C     | `github.test.ts`           | CC1-CC5 | GitHub token              | GitHubRecordStore against real GitHub API                      |
| D     | `cross_path.test.ts`       | CD1-CD5 | CLI + PostgreSQL + GitHub | Records created by CLI readable via GitHub and vice versa      |
| E     | `parity.test.ts`           | CE1     | CLI + PostgreSQL          | FS projection vs Prisma projection produce identical IndexData |
| F     | `change_detection.test.ts` | CF1-CF7 | CLI + PostgreSQL + GitHub | GithubSyncStateModule: delta detection, pushState, concurrency, audit |

## Architecture

```
packages/e2e/
  tests/
    helpers.ts              <- Shared utilities (runCliCommand, createGitRepo, DB, projection)
    cli_records.test.ts     <- Block A
    projection.test.ts      <- Block B
    github.test.ts          <- Block C
    cross_path.test.ts      <- Block D
    parity.test.ts          <- Block E
    change_detection.test.ts <- Block F
  .env                      <- Environment variables (not committed)
  vitest.config.ts          <- Sequential execution, 120s timeout
  package.json
```

Each test file follows the same lifecycle:

```
beforeAll:  mkdtemp → git init → (optional: DB connect, GitHub auth)
tests:      runCliCommand() → verify filesystem / DB / GitHub
afterAll:   cleanup temp dir → cleanup DB rows → (optional: delete GitHub branch)
```

## Troubleshooting

**Tests hang on GitHub blocks:** Check `GITHUB_TOKEN` is valid. Expired tokens cause silent hangs.

**CLI command fails with "not found":** Run `cd packages/cli && pnpm build` first. Tests use the built `gitgov.mjs`, not source.

**DB connection refused:** Start Docker: `docker compose up -d`. Verify with `psql $DATABASE_URL -c '\l'`.

**Keep temp files for debugging:** Run with `SKIP_CLEANUP=1 pnpm test` to preserve temp dirs and DB rows.
