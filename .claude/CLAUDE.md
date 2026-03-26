## CRITICAL: Git Safety Rules

### NEVER commit files outside the task scope

Before EVERY `git add` or `git commit`:

1. **Run `git status`** and review EVERY file listed
2. **Run `git diff --cached --name-only`** after staging to verify exactly what will be committed
3. **NEVER use `git add .` or `git add -A`** — always add specific files by name
4. **NEVER commit these paths** even if they appear in `git status`:
   - `.claude/` — confidential build methodology and agent prompts
   - `packages/blueprints/` — confidential specifications (EARS, triadas, epics). This is a private submodule.
   - `.kiro/`, `.vscode/`, `.env`, credentials, or local config files
5. **If a file is in `.gitignore` but shows as tracked, STOP and ask the user** — do not try to fix it yourself

### NEVER use destructive git history tools

- **NEVER use `git filter-repo`, `git filter-branch`, or `BFG`** without explicit user approval AND understanding that it rewrites ALL history
- **NEVER use `git push --force`** to main/master
- **NEVER use `git reset --hard`** without explicit user request
- If sensitive files were committed, the FIRST action is to push a commit that blanks/removes them. History rewriting is a LAST resort decided by the user.

### Verify before pushing

- After committing, run `git diff origin/<branch>...HEAD --name-only` to see what the PR will show
- Check for files that should NOT be in the PR (`.claude/`, `.kiro/`, secrets, unrelated files)
- If the diff looks wrong, STOP and tell the user before pushing

**These rules exist because violating them destroyed a month of work. No exceptions.**

---

## IMPORTANT: No AI Attribution in Git

When creating commits or pull requests, DO NOT include any of the following:

- `🤖 Generated with [Claude Code]` or similar messages
- `Co-Authored-By: Claude <noreply@anthropic.com>`
- Any mention of Claude, Anthropic, or AI assistance
- Any footer or signature indicating AI involvement

Commit messages should only contain the conventional commit format with the actual change description. Example:

```bash
git commit -m "feat(core): add new feature X

Description of what was done and why."
```

This is a legal/business requirement - no exceptions.

---

## CRITICAL: Use Core — Never Reimplement

### Record I/O: SIEMPRE @gitgov/core, NUNCA raw fs

Para leer/escribir records de `.gitgov/`:
- ✅ `FsRecordStore` + `DEFAULT_ID_ENCODER` de `@gitgov/core/fs`
- ❌ `fs.readFile`, `fs.writeFile`, `path.join(..., 'agent-${id}.json')`
- ❌ Construir paths de records manualmente — el encoder maneja `:` → `_`

Para crear records:
- ✅ `backlogAdapter.createTask(payload, actorId)` — crea, firma, persiste, emite evento
- ✅ `executionAdapter.create(payload, actorId)` — crea, firma, persiste
- ✅ `identityAdapter.createActor(payload)` / `.createAgent(payload)` — crea con Ed25519 keypair
- ✅ Factories de core: `createTaskRecord()`, `createExecutionRecord()`, `createFeedbackRecord()`
- ❌ Construir records JSON a mano — los factories validan campos requeridos y generan IDs correctos
- ❌ Generar IDs de records manualmente — usar las factories que siguen el patron `{timestamp}-{type}-{name}`

Para tests:
- ✅ Seedear datos con factories de core (`createTaskRecord()`, etc.)
- ✅ Leer records con `FsRecordStore` / `listWorktreeRecordIds()` de helpers
- ❌ Seedear JSON a mano — falla con IdentityAdapter real, IDs invalidos, checksums incorrectos
- ❌ Mockear lo que se puede instanciar real — si el componente existe en core, usalo

**Si lo que necesitas no existe en core, agrégalo a core. No lo reimplementes en tu módulo.**

**Esta regla existe porque reimplementar lógica de core causó 3 bugs en producción: naming inconsistente (guion vs underscore), taskIds sin TaskRecord, y records sin firma válida.**

---

## Coding Style Guide

### Archivos

```
module_name/
├── index.ts                # Exports
├── module_name.ts          # Implementacion
├── module_name.test.ts     # Tests
└── module_name.types.ts    # Tipos (opcional)
```

### TypeScript

```typescript
// ✅ type para datos
type Finding = { id: string; severity: "critical" | "high" };

// ✅ interface solo para APIs/contratos
interface IModule { run(): Promise<Result>; }

// ✅ Separar imports de tipos
import type { TaskRecord } from '../types';
import { createTask } from '../factories';

// ❌ Prohibido: any, unknown injustificados, @ts-ignore, as any
```

### Tests y EARS

Seguimos la convención de bloques por sección:

```
§4.1  → Bloque A  → EARS-A1, EARS-A2...
§4.2  → Bloque B  → EARS-B1, EARS-B2...
```

```typescript
describe('ModuleName', () => {
  describe('4.1. Seccion X (EARS-A1 a A3)', () => {
    it('[EARS-A1] should do X when Y', () => {});
    it('[EARS-A2] should do Z when W', () => {});
  });

  describe('4.2. Seccion Y (EARS-B1 a B4)', () => {
    it('[EARS-B1] should handle case A', () => {});
  });
});
```

**Reglas:**
- Nunca consolidar EARS. 5 EARS en blueprint = mínimo 5 tests (1 EARS → ≥1 tests).
- Ver `packages/blueprints/02_agents/design/ears_sequence_auditor.md` para convención completa.

### Flujo de Trabajo

```
1. Leer blueprint (specs/modules/*.md)
2. Implementar codigo segun tipos del blueprint
3. Escribir tests que cubran cada EARS
4. pnpm tsc --noEmit  ← repetir hasta 0 errores
5. pnpm test          ← solo después de que tsc pase
```

**Importante:** Siempre arreglar `tsc` antes de correr tests. Si un cambio rompe `tsc`, arreglarlo primero.

### Checklist

- [ ] Codigo sigue tipos del blueprint
- [ ] Sin `any` ni `unknown` injustificados
- [ ] Un test por cada EARS
- [ ] `tsc` sin errores
- [ ] Tests pasan (después de tsc)
