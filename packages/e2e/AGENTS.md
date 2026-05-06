# @gitgov/e2e — AGENTS.md

> How to DEVELOP this package. For how to USE it, see [README.md](./README.md).

---

## 1. Architecture

```
packages/e2e/
├── scripts/
│   └── sync-prisma-schemas.ts    ← copies schemas from core (Layer 1)
├── prisma/
│   └── schema/
│       ├── base.prisma           ← datasource + generator (local output)
│       ├── protocol.prisma       ← COPIED from core (DO NOT EDIT)
│       └── audit.prisma          ← COPIED from core (DO NOT EDIT)
├── generated/
│   └── prisma/                   ← locally generated PrismaClient
│       ├── index.js
│       └── index.d.ts
├── tests/
│   ├── helpers/
│   │   ├── prisma.ts             ← PrismaClient import (local generated)
│   │   ├── prisma_protocol.ts    ← helpers for projection tests
│   │   ├── prisma_audit.ts       ← helpers for audit projection tests
│   │   ├── cli.ts                ← CLI spawn helpers
│   │   ├── fs.ts                 ← FsRecordStore helpers
│   │   ├── github.ts            ← GitHub API helpers
│   │   └── index.ts              ← barrel
│   ├── cli_records.test.ts       ← Block A: CLI creates records
│   ├── projection_protocol.test.ts ← Block B: protocol → DB
│   ├── projection_audit.test.ts  ← Block CBA: SARIF → audit DB
│   ├── audit_orchestration.test.ts ← Block G: full pipeline
│   ├── policy_evaluation.test.ts ← Block H: policy evaluation
│   ├── redaction.test.ts         ← Block I: L1/L2 redaction
│   └── ...                       ← Blocks C-F, J (GitHub, GitLab, parity)
└── vitest.config.ts
```

## 2. Prisma Schema Management

### Pattern: Copy from Core (single-tenant, no extensions)

E2E uses core schemas directly — **without** saas-api extensions. Projection tests use core's `RecordProjector` which is single-tenant.

```bash
# Sync schemas from core → e2e/prisma/schema/
pnpm prisma:sync

# Generate PrismaClient locally
pnpm prisma:generate

# Both in one command
pnpm prisma:generate   # (includes sync)
```

### Why not import from `../../../core/generated/prisma/`

- Cross-path import causes rootDir TS errors
- Implicit dependency on core having run `prisma generate`
- E2E is not self-contained

### Why not use the saas-api schema

- saas-api has multi-tenant extensions (`repoId`, `projectionType`, `orgId`)
- E2E tests core which is single-tenant
- If E2E needs to test saas-api, use e2e-private (which has its own schema)

### How this applies to other packages

Any package that needs core's PrismaClient must follow this pattern:

1. Create `prisma/schema/base.prisma` with local generator output
2. Copy core schemas via script (`sync-prisma-schemas.ts`)
3. `prisma generate --schema=prisma/schema` → local client
4. Import: `import { PrismaClient } from '../../generated/prisma/index.js'`

**Do not import from cross-path relatives (`../../core/generated/`).** Do not export PrismaClient from `@gitgov/core/prisma` (the generated client is deployment-specific).

Architecture reference: [`schema_layering.md`](../../blueprints/03_products/core/specs/modules/shared/prisma/schema_layering.md)

## 3. Imports

### Rule: import from `@gitgov/core`, not from `../../core/src/`

```typescript
// ✅ Correct — import from compiled package
import { AuditOrchestrator, PolicyEvaluator, Factories } from '@gitgov/core';
import type { Finding, Waiver, IWaiverReader } from '@gitgov/core';

// ✅ Correct — subpaths for specific implementations
import { FsRecordStore, DEFAULT_ID_ENCODER } from '@gitgov/core/fs';
import { MemoryRecordStore } from '@gitgov/core/memory';

// ✅ Correct — local PrismaClient
import { PrismaClient } from '../../generated/prisma/index.js';

// ❌ Wrong — cross-path to source
import { createPolicyEvaluator } from '../../core/src/policy_evaluator';

// ❌ Wrong — cross-path to generated
import { PrismaClient } from '../../../core/generated/prisma/index.js';
```

### Helpers as convenience (not as source)

`tests/helpers/` re-exports from core as a barrel. Types ALWAYS come from `@gitgov/core` originally. If a type is missing in helpers, import directly from core — do not add unnecessary re-exports.

## 4. If You Touched / Update

| If you touched... | Update... |
|:-------------|:-------------|
| `scripts/sync-prisma-schemas.ts` | This AGENTS.md §2 |
| `prisma/schema/base.prisma` | README.md §Prerequisites if datasource changes |
| `tests/helpers/prisma.ts` (import path) | This AGENTS.md §3 |
| Added a new test block | README.md §Test Blocks table |
| Added a new EARS | README.md §Test Blocks and the block's spec |
| Core changed schemas (`protocol.prisma`, `audit.prisma`) | Run `pnpm prisma:generate` in e2e |

## 5. Technical Debt

| Debt | Severity | Path to Resolution |
|:------|:----------|:-------------------|
| `sync-prisma-schemas.ts` duplicated between saas-api and e2e | LOW | Centralize in a shared util when there are 3+ consumers |
| Some projection tests use inline types `(t: { title: string })` for Prisma `findMany` callbacks | LOW | Resolved when Prisma generates correct types via local client |
| `globalSetup.ts` uses `prisma db push` which can drift from schema if `prisma:sync` wasn't run | MEDIUM | Add `prisma:sync` to globalSetup |

---

**Last updated:** 2026-05-06
