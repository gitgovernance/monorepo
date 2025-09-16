# GitGovernance Auto-Indexer Hook

## 🎯 Prompt Detallado para Kiro Hook Creation Chat

### Contexto del Prompt:
```
Quiero crear un Agent Hook para automatizar la indexación de proyectos GitGovernance cuando abro el proyecto en Kiro IDE.
```

### Especificaciones del Hook:

**Nombre del Hook:** `GitGovernance Auto-Indexer`

**Tipo de Trigger:** `Manual Trigger` 

**Descripción:** `Automatically index GitGovernance project cache for optimal CLI performance`

**Target/Pattern:** No aplica (es manual trigger)

### Instrucciones Detalladas del Hook:

```
When this hook is executed, perform GitGovernance project indexing:

1. **Cache Status Analysis**:
   - Check if `.gitgov/index.json` exists
   - If exists, check file modification time vs `.gitgov/` contents
   - Determine if cache is fresh (< 5 minutes old) or stale

2. **Indexing Execution**:
   - If no cache: Execute `gitgov indexer` and report "Generating initial cache..."
   - If stale cache: Execute `gitgov indexer --force` and report "Refreshing stale cache..."
   - If fresh cache: Skip execution and report "Cache is up-to-date"

3. **Performance Reporting**:
   - After successful indexing, run `gitgov indexer --validate-only --json`
   - Report cache size, record count, and indexing time
   - Suggest next steps: "Ready! Try 'gitgov status' or 'gitgov dashboard'"

4. **Error Handling**:
   - If indexing fails, capture error output
   - Provide specific troubleshooting based on error type
   - Suggest running `gitgov indexer --verbose` for debugging

Always execute commands from the workspace root directory and provide clear, actionable feedback.
```

### Configuración Adicional:
- **Auto-approve commands:** `gitgov indexer`, `gitgov indexer --force`, `gitgov indexer --validate-only`
- **Working directory:** Workspace root
- **Timeout:** 30 seconds
- **Show output:** Yes (para ver progreso de indexación)

### Casos de Uso Esperados:
1. **Onboarding**: Nuevo desarrollador abre proyecto GitGovernance
2. **Cache refresh**: Después de cambios importantes en `.gitgov/`
3. **Performance prep**: Antes de usar comandos intensivos como `gitgov dashboard`
4. **Troubleshooting**: Cuando otros comandos GitGovernance son lentos

## 🚀 Implementación

Para crear este hook en Kiro:

1. Abrir Command Palette: `Ctrl+Shift+P`
2. Buscar: "Open Kiro Hook UI"
3. Crear nuevo hook con las especificaciones de arriba
4. Copiar las instrucciones detalladas exactamente como están escritas
5. Configurar auto-approve para los comandos GitGovernance
6. Probar el hook en un proyecto GitGovernance

## 🎯 Integración con Epic

Este hook es parte del **Epic: Implementar DXP con 6 Hooks Fundamentales para IDE**:

- **Task ID:** `1757890832-task-hook-1-auto-indexer`
- **Status:** `done` (implementación completada)
- **Cycle:** `1757890814-cycle-epic-implementar-dxp-con-6-hooks-fundamentales-pa`

## 🔗 Hooks Relacionados

Este hook prepara la base para otros hooks del epic:
- **Hook 2:** Quick Status (necesita cache fresco)
- **Hook 5:** File Analyzer (usa datos indexados)
- **Hook 6:** Dashboard Launcher (usa cache optimizado)

## ✅ Implementación Completada

**Cambios realizados:** Removidos los pasos 1 y 2 (Project Detection y CLI Availability Check) según feedback de implementación real. El hook ahora se enfoca directamente en el análisis y ejecución de indexación.