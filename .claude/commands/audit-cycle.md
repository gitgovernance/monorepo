Audita el Cycle de una Epic usando los argumentos: **$ARGUMENTS**

Formato: `/audit-cycle <epic> <cycle_number>`

## Contexto

- **Agent:** cycle_completion_auditor
- **Spec:** `packages/blueprints/02_agents/design/cycle_completion_auditor.md`
- **Roadmap:** `packages/blueprints/03_products/epics/{epic}/roadmap.md`

## Instrucciones

1. **Parsea los argumentos:** `<epic> <cycle_number>` (ej: `store_backends 4`)

2. **Lee el roadmap** en `packages/blueprints/03_products/epics/{epic}/roadmap.md` y ubica la sección `## Cycle {cycle_number}`

3. **Extrae los Criterios de Aceptación** (lista de checkboxes)

4. **Verifica cada criterio en el código:**

   | Patrón | Verificación |
   |--------|--------------|
   | `X interface exportada desde @gitgov/core` | Grep export en index.ts |
   | `X exportada desde @gitgov/core/fs` | Grep export en fs.ts |
   | `Y NO importa fs directamente` | Grep import fs en Y.ts → vacío |
   | `Y recibe X por DI` | Leer constructor/dependencies |
   | `Tests funcionan` | npm test pasa |
   | `CI guardrail` | npm run build pasa |

5. **Genera reporte** con estado de cada criterio y evidencia

6. **Pregunta al usuario** si desea actualizar el roadmap.md

7. **Si el usuario confirma**, actualiza roadmap.md:
   - Cambia `[ ]` → `[x]` para criterios cumplidos
   - Actualiza "Última actualización" con fecha y versión
   - Agrega notas para criterios movidos o parciales

8. **Sugiere commit message** para el submodule blueprints (NO commitear sin permiso)

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
/audit-cycle store_backends 4
/audit-cycle store_backends 5
/audit-cycle saas_mvp 1
```
