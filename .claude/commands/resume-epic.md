Recupera contexto y encuentra dónde continuar trabajando en la epic: **$ARGUMENTS**

Formato: `/resume-epic <epic>`

## Contexto

- **Agent:** epic_resume_agent
- **Spec:** `packages/blueprints/02_agents/design/epic_resume_agent.md`
- **Epic path:** `packages/blueprints/03_products/epics/{epic}/`

## Instrucciones

1. **Parsea el argumento:** `<epic>` (ej: `store_backends`)

2. **Lee los documentos de la epic en orden:**
   ```
   packages/blueprints/03_products/epics/{epic}/
   ├── overview.md       → Objetivo, arquitectura, decisiones
   ├── roadmap.md        → Estado de cycles, criterios
   └── implementation_plan.md → Detalles técnicos (si existe)
   ```

3. **En roadmap.md, identifica el cycle activo:**
   - Busca 🟡 "En Progreso" (prioridad)
   - Si no hay 🟡, busca primer 🔴 "Pendiente"
   - Si todos 🟢, la epic está completa

4. **Para el cycle activo, analiza:**
   - Criterios de aceptación (checkboxes)
   - Cuántos `[x]` vs `[ ]`
   - Qué criterios faltan

5. **Verifica estado del código:**
   - `git status` → cambios pendientes?
   - Grep rápido de interfaces/exports mencionados en criterios

6. **Genera resumen ejecutivo:**
   ```
   ## Resumen: Epic {epic}

   **Objetivo:** [1-2 líneas del overview]

   **Cycle activo:** {N} - {nombre}
   **Progreso:** X/Y criterios cumplidos

   **Criterios pendientes:**
   - [ ] Criterio 1
   - [ ] Criterio 2

   **Sugerencia:** Continuar con [criterio más importante]
   ```

7. **NO modifica ningún archivo** - solo lee y reporta

## Output Esperado

Un resumen conciso que permita retomar el trabajo inmediatamente, sin necesidad de leer todos los documentos manualmente.

## Ejemplo

```
/resume-epic store_backends
/resume-epic saas_mvp
/resume-epic gitgov_audit
```
