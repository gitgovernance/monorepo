Muestra el estado de todas las Epics del monorepo.

## Contexto

- **Ubicación epics:** `packages/blueprints/03_products/epics/*/`
- **Archivo clave:** `roadmap.md` de cada epic

## Instrucciones

1. **Busca todas las epics:**
   ```
   glob: packages/blueprints/03_products/epics/*/roadmap.md
   ```

2. **Para cada roadmap.md encontrado:**
   - Lee el archivo
   - Busca la tabla "Resumen de Cycles" (o similar)
   - Cuenta:
     - Total de cycles
     - Cycles 🟢 Completados
     - Cycles 🟡 En Progreso (si hay)
     - Cycles 🔴 Pendientes
   - Identifica el cycle activo (🟡 o primer 🔴)

3. **Genera tabla resumen:**

```
┌─────────────────────────────────────────────────────────────────┐
│                    EPICS EN EL MONOREPO                          │
├──────────────────┬────────┬────────┬────────────────────────────┤
│  Epic            │ Cycles │ Activo │ Progreso                   │
├──────────────────┼────────┼────────┼────────────────────────────┤
│  store_backends  │  7     │  5     │  ████████░░░░░░ 4/7 (57%)  │
│  saas_mvp        │  3     │  1     │  ░░░░░░░░░░░░░░ 0/3 (0%)   │
│  gitgov_audit    │  2     │  2     │  ███████████░░░ 1/2 (50%)  │
└──────────────────┴────────┴────────┴────────────────────────────┘

Comandos disponibles:
  /resume-epic <epic>     → Ver detalles y continuar trabajando
  /audit-cycle <epic> <n> → Verificar cycle completo
```

4. **Reglas para la barra de progreso:**
   - Usa █ para cycles completados (🟢)
   - Usa ░ para cycles pendientes (🔴 o 🟡)
   - Ancho fijo de 14 caracteres
   - Formato: `████░░░░░░░░░░ X/Y (Z%)`

5. **Si no hay epics:**
```
No se encontraron epics en packages/blueprints/03_products/epics/

Para crear una nueva epic, usa epic_designer.
```

## Output

Una tabla visual que muestra de un vistazo el estado de todas las epics, permitiendo decidir rápidamente en cuál trabajar.

## Ejemplo de uso

```
/status
```
