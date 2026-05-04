# @gitgov/e2e — AGENTS.md

> Cómo DESARROLLAR este package. Para cómo USARLO, ver [README.md](./README.md).

---

## 1. Arquitectura

```
packages/e2e/
├── scripts/
│   └── sync-prisma-schemas.ts    ← copia schemas de core (Layer 1)
├── prisma/
│   └── schema/
│       ├── base.prisma           ← datasource + generator (output local)
│       ├── protocol.prisma       ← COPIADO de core (DO NOT EDIT)
│       └── audit.prisma          ← COPIADO de core (DO NOT EDIT)
├── generated/
│   └── prisma/                   ← PrismaClient generado localmente
│       ├── index.js
│       └── index.d.ts
├── tests/
│   ├── helpers/
│   │   ├── prisma.ts             ← PrismaClient import (local generated)
│   │   ├── prisma_protocol.ts    ← helpers para projection tests
│   │   ├── prisma_audit.ts       ← helpers para audit projection tests
│   │   ├── cli.ts                ← CLI spawn helpers
│   │   ├── fs.ts                 ← FsRecordStore helpers
│   │   ├── github.ts             ← GitHub API helpers
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

### Patrón: Copy from Core (single-tenant, sin extensions)

El E2E usa los schemas de core directamente — **sin extensions** de saas-api. Los tests de projection usan el `RecordProjector` de core que es single-tenant.

```bash
# Sincronizar schemas de core → e2e/prisma/schema/
pnpm prisma:sync

# Generar PrismaClient localmente
pnpm prisma:generate

# Ambos en un solo comando
pnpm prisma:generate   # (incluye sync)
```

### Por qué no importar de `../../../core/generated/prisma/`

- Path cruzado causa rootDir TS errors
- Dependencia implícita de que core haya hecho `prisma generate`
- El E2E no es autosuficiente

### Por qué no usar el schema de saas-api

- saas-api tiene extensions (`repoId`, `projectionType`, `orgId`) que son multi-tenant
- E2E testea core que es single-tenant
- Si E2E necesitara testear saas-api, usaría e2e-private (que tiene su propio schema)

### Cómo aplica a otros packages

Cualquier package que necesite PrismaClient de core debe seguir este patrón:

1. Crear `prisma/schema/base.prisma` con generator output local
2. Copiar schemas de core via script (`sync-prisma-schemas.ts`)
3. `prisma generate --schema=prisma/schema` → client local
4. Import: `import { PrismaClient } from '../../generated/prisma/index.js'`

**No importar de path relativos cruzados (`../../core/generated/`).** No exportar PrismaClient desde `@gitgov/core/prisma` (el client generado es específico de cada deployment).

Referencia arquitectónica: [`schema_layering.md`](../../blueprints/03_products/core/specs/modules/shared/prisma/schema_layering.md)

## 3. Imports

### Regla: importar de `@gitgov/core`, no de `../../core/src/`

```typescript
// ✅ Correcto — import del package compilado
import { AuditOrchestrator, PolicyEvaluator, Factories } from '@gitgov/core';
import type { Finding, Waiver, IWaiverReader } from '@gitgov/core';

// ✅ Correcto — subpaths para implementaciones específicas
import { FsRecordStore, DEFAULT_ID_ENCODER } from '@gitgov/core/fs';
import { MemoryRecordStore } from '@gitgov/core/memory';

// ✅ Correcto — PrismaClient local
import { PrismaClient } from '../../generated/prisma/index.js';

// ❌ Incorrecto — path cruzado a source
import { createPolicyEvaluator } from '../../core/src/policy_evaluator';

// ❌ Incorrecto — path cruzado a generated
import { PrismaClient } from '../../../core/generated/prisma/index.js';
```

### Helpers como conveniencia (no como source)

`tests/helpers/` re-exporta de core como barrel. Los tipos SIEMPRE vienen de `@gitgov/core` originalmente. Si un tipo falta en helpers, importar directo de core — no agregar re-exports innecesarios.

## 4. Si Tocaste / Actualizar

| Si tocaste... | Actualizar... |
|:-------------|:-------------|
| `scripts/sync-prisma-schemas.ts` | Este AGENTS.md §2 |
| `prisma/schema/base.prisma` | README.md §Prerequisites si cambia el datasource |
| `tests/helpers/prisma.ts` (import path) | Este AGENTS.md §3 |
| Agregaste un nuevo test block | README.md §Test Blocks tabla |
| Agregaste un nuevo EARS | README.md §Test Blocks y el spec del block |
| Core cambió schemas (`protocol.prisma`, `audit.prisma`) | Correr `pnpm prisma:generate` en e2e |

## 5. Deuda Técnica

| Deuda | Severidad | Path to Resolution |
|:------|:----------|:-------------------|
| `sync-prisma-schemas.ts` duplicado entre saas-api y e2e | BAJA | Centralizar en un shared util cuando haya 3+ consumers |
| Algunos tests de projection usan tipos inline `(t: { title: string })` para callbacks de Prisma `findMany` | BAJA | Se resuelve cuando Prisma genera tipos correctos via el client local |
| `globalSetup.ts` usa `prisma db push` que puede derivar del schema si no se corrió `prisma:sync` | MEDIA | Agregar `prisma:sync` al globalSetup |

---

**Última actualización:** 2026-05-04
