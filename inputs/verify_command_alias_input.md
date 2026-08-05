# Input: `gitgov verify` como comando de primer nivel

> Documento de input para futura epic.

**Fecha:** 2026-05-05
**Autor:** humano:camilo + agent:claude (deep review session)
**Origen:** Critical review session / Bomba 2 identificada
**Sesión:** recall_20_2026-05-04_rldx-e1-runner-puro-cli-l1
**Prioridad:** 🔥 Alta — credibilidad del pitch público
**Relacionado con:**
  - `cli/src/commands/lint/` (extender o crear alias)
  - `core/src/crypto/signatures.ts` (primitiva ya existe)
  - README.md (claim "verifiable offline" sin comando que lo respalde)
**Destino:** Pendiente — sub-task chico, candidato a quick win en cualquier sprint

---

## Problema (captura)

El README de GitGovernance promete:

> "Every record signed. Every exception auditable. **Every report verifiable.**"
>
> "Verification: SHA-256(canonicalize(payload)) === header.payloadChecksum ✓
>  Ed25519_Verify(publicKey, digest, signature) ✓"

Cualquier persona razonablemente técnica que abre el repo, ve el pitch, y quiere validar que el producto cumple su promesa va a tipear:

```bash
$ gitgov verify
```

Y obtiene:

```
error: unknown command 'verify'
```

Esa experiencia mata credibilidad en 2 segundos. El pitch dice "verifiable" como propiedad central. La CLI no expone un comando con ese nombre. Es la versión más simple posible del fenómeno "el producto promete cosas que no demuestra".

**Las primitivas técnicas YA existen.** Confirmado en respuesta #13 del review crítico:

> "Archivo crítico para verificación offline: `core/src/crypto/signatures.ts` — `verifySignatures()` function. ~50 líneas de código puro (nacl + checksum). Podría extraerse como script standalone."

Y el `lint` actual ya hace verificación criptográfica vía los validators `SIGNATURE_STRUCTURE` y `CHECKSUM_VERIFICATION`. **Solo falta el comando con el nombre correcto y el énfasis correcto.**

---

## Diagramas (captura)

### Estado actual

```
┌─────────────────────┐
│ Usuario nuevo lee   │
│ README:             │
│ "verifiable offline"│
└──────────┬──────────┘
           │
           ▼
   $ gitgov verify
           │
           ▼
   error: unknown command
           │
           ▼
   ❌ usuario se va
```

```
Comandos hoy:
  gitgov init       ─── crea estructura
  gitgov task       ─── tasks
  gitgov audit      ─── corre scans
  gitgov lint       ─── valida records (incluye sigs y checksums)
  gitgov sync       ─── push/pull
  gitgov dashboard  ─── webapp local
                       └── gitgov verify ❌ no existe
```

### Estado propuesto

```
┌─────────────────────┐
│ Usuario nuevo lee   │
│ README:             │
│ "verifiable offline"│
└──────────┬──────────┘
           │
           ▼
   $ gitgov verify
           │
           ▼
   ┌──────────────────────────────────────────┐
   │ Three Gates Verification — gitgov-state  │
   │                                          │
   │ Gate 1 (Integrity):    487/487 passed ✓  │
   │ Gate 2 (Schema):       487/487 passed ✓  │
   │ Gate 3 (Signatures):   487/487 passed ✓  │
   │                                          │
   │ All records verified offline.            │
   │ No external services contacted.          │
   │                                          │
   │ Run with --json for machine output.      │
   │ Run with --explain for verification trail│
   └──────────────────────────────────────────┘
           │
           ▼
   ✅ usuario convencido
```

```
Comandos propuestos:
  gitgov verify              ─── alias de lint con énfasis criptográfico
  gitgov verify --explain    ─── muestra trail de verificación
  gitgov verify --json       ─── output para integraciones
  gitgov verify <recordId>   ─── verifica un record específico
  gitgov verify --since=...  ─── verifica records desde un timestamp
```

---

## Propuesta (captura)

`gitgov verify` NO es un comando nuevo en su lógica — **reusa toda la infraestructura existente de lint**. La diferencia es **presentación, defaults y framing**.

### Diferencias con `gitgov lint`

| Aspecto | `gitgov lint` | `gitgov verify` |
|---------|---------------|-----------------|
| Audiencia | Developers fixing record issues | Auditors / external evaluators |
| Default validators | All (schema, naming, references, sigs, checksums, timestamps) | **Solo cryptographic gates** (sigs, checksums, schema) |
| Output | Lista de issues con sugerencias de fix | Reporte estructurado tipo "verification trail" |
| Tono del mensaje | "Found 3 warnings, 1 fixable" | "All 487 records verified ✓" / "FAILED: 2 records have invalid signatures" |
| Exit code | 0 si solo warnings | 0 solo si TODA la verificación pasa |
| Flags útiles | `--fix`, `--watch` | `--explain`, `--json`, `--since`, `--until` |

### Implementación mínima (alias inteligente)

```typescript
// cli/src/commands/verify/verify-command.ts (nuevo, ~50 líneas)
import { LintCommand } from '../lint/lint-command';

export class VerifyCommand {
  constructor(private lintCommand: LintCommand) {}

  register(program: Command) {
    program
      .command('verify [recordId]')
      .description('Cryptographically verify signed records (Three Gates)')
      .option('--json', 'Machine-readable output')
      .option('--explain', 'Show verification trail per record')
      .option('--since <timestamp>', 'Only verify records signed after this time')
      .option('--until <timestamp>', 'Only verify records signed before this time')
      .option('--strict', 'Fail on any warning (default: only fail on errors)')
      .action(async (recordId, options) => {
        // Reusa LintModule pero con defaults distintos
        const result = await this.lintCommand.runWithProfile('verify', {
          ...options,
          recordId,
          validators: ['SIGNATURE_STRUCTURE', 'CHECKSUM_VERIFICATION', 'SCHEMA_VALIDATION'],
          presentation: 'verification-report',
        });

        // Output específico de verify
        this.renderVerificationReport(result, options);
        process.exit(result.allPassed ? 0 : 1);
      });
  }
}
```

### Implementación deluxe (recomendada — comando standalone)

Si `verify` solo es alias, queda subordinado a lint conceptualmente. Para que sea **el flagship público**, vale la pena que tenga su propio archivo + reporting layer dedicado:

- `cli/src/commands/verify/verify-command.ts`
- `cli/src/commands/verify/verification-report.ts` (renderer especializado)
- `cli/src/commands/verify/verification-types.ts`

Reusa `core/src/crypto/signatures.ts` directamente para Gate 3, en lugar de pasar por LintModule. Más control sobre el output.

---

## Archivos clave (refine)

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| `verify-command.ts` (nuevo) | cli | Nuevo comando | `cli/src/commands/verify/verify-command.ts` |
| `verify.ts` (nuevo) | cli | Registro del comando en commander | `cli/src/commands/verify/verify.ts` |
| `verification-report.ts` (nuevo) | cli | Renderer del output | `cli/src/commands/verify/verification-report.ts` |
| `signatures.ts` | core | `verifySignatures()` — primitiva ya existe | `core/src/crypto/signatures.ts` |
| `lint-command.ts` | cli | Comando lint actual — referencia, no se modifica | `cli/src/commands/lint/lint-command.ts` |
| `index.ts` | cli | Punto de registro de comandos | `cli/src/index.ts` |
| `README.md` | repo root | Actualizar para mencionar `gitgov verify` como comando estrella | `README.md` |

---

## Ejemplos de migración (refine)

### Antes — usuario tenía que tipear

```bash
$ gitgov lint --validate-signatures --validate-checksums --validate-schemas
[lint] Validating .gitgov/...
[lint] 487 records checked
[lint] 0 errors, 0 warnings
✓ All checks passed
```

### Después — output dedicado de verify

```bash
$ gitgov verify
┌──────────────────────────────────────────────────────────┐
│  GitGov Three Gates Verification                         │
│  Repository: your-team/your-project                      │
│  Branch: gitgov-state @ a4f7e2g9                         │
│  Timestamp: 2026-05-05 14:32:11 UTC                      │
└──────────────────────────────────────────────────────────┘

Gate 1 — Integrity (SHA-256 payload checksums)
  ✓ 487/487 records verified

Gate 2 — Schema (RFC compliance)
  ✓ 487/487 records valid

Gate 3 — Authentication (Ed25519 signatures)
  ✓ 487/487 signatures verified
  ↳ 12 unique actors (8 humans, 4 agents)
  ↳ Earliest record: 2026-01-15 09:14:22 UTC
  ↳ Latest record:   2026-05-05 14:30:55 UTC

╔══════════════════════════════════════════════════════════╗
║  ALL VERIFIED — 487 records, 100% offline                ║
║  No external services contacted.                         ║
║  This output is reproducible: `gitgov verify --json`     ║
╚══════════════════════════════════════════════════════════╝

Run with --explain to see verification trail per record.
```

### Output JSON (para integraciones)

```bash
$ gitgov verify --json
{
  "verified": true,
  "totalRecords": 487,
  "gates": {
    "integrity": { "passed": 487, "failed": 0 },
    "schema":    { "passed": 487, "failed": 0 },
    "signatures":{ "passed": 487, "failed": 0 }
  },
  "actors": {
    "total": 12,
    "humans": 8,
    "agents": 4
  },
  "timeRange": {
    "earliest": "2026-01-15T09:14:22Z",
    "latest":   "2026-05-05T14:30:55Z"
  },
  "branch": "gitgov-state",
  "head": "a4f7e2g9",
  "verifiedAt": "2026-05-05T14:32:11Z"
}
```

### Output cuando falla (importante para credibilidad)

```bash
$ gitgov verify

Gate 1 — Integrity (SHA-256 payload checksums)
  ✗ 485/487 records verified
  ✗ FAILED: rec_abc12345.json
    expected: 8b2f3a7c1d...
    actual:   9e1d4c8a2b...
    → Payload was modified after signing

Gate 2 — Schema
  ✓ 487/487 records valid

Gate 3 — Authentication (Ed25519 signatures)
  ✗ 486/487 signatures verified
  ✗ FAILED: rec_xyz98765.json
    keyId: human:bob
    error: Signature does not verify against actor public key
    → Either record was tampered, or actor key was rotated without re-signing

VERIFICATION FAILED — 2 issues across 487 records.
Run with --explain rec_abc12345 for detailed trail.
```

---

## Plan paso a paso (refine)

**Fase 1 — Quick win (1 sesión, ~2-3 horas):**

1. Crear `cli/src/commands/verify/verify-command.ts` como alias de lint con presets de validators
2. Registrar en `cli/src/index.ts`
3. Test básico: `gitgov verify` corre y devuelve exit code apropiado
4. Actualizar `README.md` para mencionar `gitgov verify` como comando estrella

**Fase 2 — Output dedicado (1-2 sesiones):**

5. Crear `verification-report.ts` con renderer dedicado (visible en ejemplo arriba)
6. Implementar flags: `--json`, `--explain`, `--since`, `--until`
7. Output cuando falla (mensaje claro de qué falló y por qué)

**Fase 3 — Polish (1 sesión):**

8. Añadir comando `gitgov verify --help` con ejemplos en línea
9. Tests E2E: verificación pasa, verificación falla con record corrupto, verificación con record específico
10. Documentación en `cli/specs/verify_command.md`

**Total estimado: 4-5 sesiones de trabajo** para versión completa con output dedicado. **1 sesión** para versión MVP (alias simple).

---

## Verificación (refine)

```bash
# Test que verify funciona en repo limpio
gitgov init --name test-verify
gitgov verify
# Expected: "✓ All verified — 1 record (the actor record)"

# Test que detecta corrupción
echo "tampered" >> .gitgov/feedbacks/some-record.json
gitgov verify
# Expected: exit code 1, output explica qué falló

# Test JSON output parseable
gitgov verify --json | jq .verified
# Expected: true

# Tests CLI
cd cli && pnpm jest --testPathPattern="verify"
```

### Criterios de aceptación

- ✅ `gitgov verify` existe como comando de primer nivel (no subcomando de lint)
- ✅ Output por defecto enfatiza la propiedad criptográfica (no "lint passed", sino "verified")
- ✅ Exit code 0 solo si TODOS los records pasan TODOS los gates
- ✅ `--json` produce output válido y parseable
- ✅ README incluye al menos un ejemplo de output de `gitgov verify`
- ✅ La hero animation del landing puede mostrar el output de `gitgov verify`

---

## Preguntas de comprensión (obligatoria — captura)

**1. ¿`verify` reemplaza a `lint --signatures`, lo complementa, o ambos coexisten con tareas distintas?**

> Hint: lint hoy hace muchas cosas (file naming, references, soft-delete detection). Verify debería ser SOLO los gates criptográficos. Coexistencia con scope distinto es lo correcto. Ver tabla §"Diferencias con `gitgov lint`".

**2. ¿Verify debe verificar TODO el branch `gitgov-state` o solo el HEAD?**

> Hint: ambas opciones son válidas. Default debería ser HEAD (rápido, lo que importa al auditor hoy). Flag `--all-commits` podría verificar el historial completo (más lento, útil para forensic audit). Decidir scope default.

**3. ¿Qué hace verify cuando un record fue firmado por una key que después se archivó/revocó?**

> Hint: depende del modelo de revocación. Si la firma es válida criptográficamente pero el actor está `status: revoked`, ¿pasa o falla? Defendible que pase con un warning, porque la verificación es sobre el momento de firma. Validar contra RFC-02.

**4. ¿Verify debe contactar el remote o trabajar puramente offline?**

> Hint: el pitch es "offline-verifiable", entonces verify NO debe hacer fetch. Si el branch local está desactualizado, eso es problema del usuario (que corra `gitgov sync pull` antes). Si verify silenciosamente sincroniza, perdemos el atributo "offline" del pitch.

**5. ¿Hay gap entre lo que `verify` reporta y lo que el dashboard del SaaS reporta?**

> Hint: si los dos divergen (verify dice "all good", dashboard dice "3 issues"), confunde. La fuente de verdad debería ser `verify` (offline, deterministic). Dashboard puede agregar metadata pero no debería contradecir la verificación criptográfica.

---

## EARS estimados (refine)

| Categoría | EARS estimados |
|-----------|---------------|
| Verify command registration | 2-3 |
| Verification report rendering | 4-5 |
| Output flags (--json, --explain, --since) | 3-4 |
| Error cases (corruption, revoked keys) | 3-4 |
| Tests E2E | 3-4 |
| **Total estimado** | **15-20** |

Estimación de esfuerzo: **4-5 sesiones de trabajo** para versión completa, **1 sesión** para MVP.

---

## Notas adicionales

**Por qué este input es alta prioridad pese a ser técnicamente trivial:**

Es el cambio de menor esfuerzo y mayor leverage en credibilidad pública identificado en el review crítico. El producto YA hace la verificación. Solo falta el comando con el nombre correcto.

Si tuviera que ponerle números: 4-8 horas de trabajo, mueve el "trust score" del repo de un visitante técnico hipotéticamente de 6/10 a 8/10. Pocas mejoras tienen ese ROI.

**Dependencias upstream:**

- AORCH-P1..P3 fix (en flight): si los L1 ExecutionRecords no se escriben a disco, `gitgov verify` no tiene mucho que verificar. Pero `verify` puede shippearse en paralelo y se beneficia automáticamente cuando AORCH aterrice.

**Riesgo de no hacerlo:**

Cada visitante técnico nuevo del repo que tipea `gitgov verify` y obtiene `command not found` es una conversación perdida con un evangelista potencial. Y va a pasar — porque el README invita a hacer exactamente eso.
