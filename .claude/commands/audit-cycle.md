Audita el Cycle **$ARGUMENTS** de la epic store_backends.

## Contexto

- **Agent:** cycle_completion_auditor
- **Spec:** `packages/blueprints/02_agents/design/cycle_completion_auditor.md`
- **Roadmap:** `packages/blueprints/03_products/epics/store_backends/roadmap.md`

## Instrucciones

1. **Lee el roadmap** y ubica la sección `## Cycle {$ARGUMENTS}`

2. **Extrae los Criterios de Aceptación** (lista de checkboxes)

3. **Verifica cada criterio en el código:**

   | Patrón | Verificación |
   |--------|--------------|
   | `X interface exportada desde @gitgov/core` | Grep export en index.ts |
   | `X exportada desde @gitgov/core/fs` | Grep export en fs.ts |
   | `Y NO importa fs directamente` | Grep import fs en Y.ts → vacío |
   | `Y recibe X por DI` | Leer constructor/dependencies |
   | `Tests funcionan` | npm test pasa |
   | `CI guardrail` | npm run build pasa |

4. **Genera reporte** con estado de cada criterio y evidencia

5. **Actualiza roadmap.md:**
   - Cambia `[ ]` → `[x]` para criterios cumplidos
   - Actualiza "Última actualización" con fecha y versión
   - Agrega notas para criterios movidos o parciales

6. **Sugiere commit message** para el submodule blueprints

## Output Esperado

```markdown
# Cycle Completion Report: Cycle {N}

| Criterio | Estado | Evidencia |
|----------|--------|-----------|
| ... | ✅/❌/⚠️ | archivo:línea |

## Acciones
- [x] Checkboxes actualizados
- [x] Fecha actualizada
- [ ] Commit pendiente
```

## Ejemplo

```
/audit-cycle 4
/audit-cycle 5
/audit-cycle "Adapters Phase 2"
```
