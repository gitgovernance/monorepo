# GitGovernance Quick Status Hook

## 🎯 Prompt Detallado para Kiro Hook Creation Chat

### Contexto del Prompt:
```
Quiero crear un Agent Hook que muestre un resumen rápido del estado del proyecto GitGovernance cuando abro el workspace o cuando lo ejecuto manualmente.
```

### Especificaciones del Hook:

**Nombre del Hook:** `GitGovernance Quick Status`

**Tipo de Trigger:** `Manual Trigger`

**Descripción:** `Show quick GitGovernance project status summary in output panel`

**Target/Pattern:** No aplica (es manual trigger)

### Instrucciones Detalladas del Hook:

```
When executed, provide a quick status overview of the GitGovernance project:

1. **Project Health Check**:
   - Execute `gitgov status --json --quiet` to get current metrics
   - Parse key indicators: health score, active tasks, blocked tasks, throughput
   - Format results in a clean, readable summary

2. **Status Summary Format**:
   ```
   🎯 GitGovernance Project Status
   ================================
   📊 Health Score: 87% (Good)
   📋 Tasks: 12 active, 2 blocked, 5 stalled
   🚀 Throughput: 69 tasks/week
   ⏱️ Lead Time: 66.8 days (needs attention)
   
   🚨 Alerts:
   - 2 tasks blocked >3 days
   - 5 tasks stalled >7 days
   
   💡 Suggestions:
   - Run 'gitgov task list --status blocked' to see blockers
   - Use 'gitgov dashboard' for detailed analysis
   ```

3. **Quick Actions Menu**:
   - After showing status, offer common next actions:
   - "What would you like to do next?"
   - Options: "View dashboard", "List tasks", "Check cycles", "Nothing (exit)"

4. **Conditional Alerts**:
   - Only show alerts section if there are actual issues
   - Highlight critical issues (health <60%, >5 blocked tasks)
   - Provide specific commands for each type of issue

5. **Performance Optimization**:
   - Use cached data if available and fresh (<5 minutes)
   - If cache stale, auto-refresh with `gitgov indexer --force`
   - Show cache status: "Using cached data (2 minutes old)"

6. **Error Handling**:
   - If GitGovernance not initialized: "Run 'gitgov init' to get started"
   - If commands fail: Show specific error and troubleshooting steps
   - Graceful degradation with helpful guidance

Always provide actionable information that helps users understand project state quickly.
```

### Configuración Adicional:
- **Auto-approve commands:** `gitgov status --json --quiet`, `gitgov indexer --force`
- **Working directory:** Workspace root
- **Timeout:** 10 seconds
- **Show output:** Yes (formatted status summary)

### Casos de Uso Esperados:
1. **Daily Standup**: Revisar estado del proyecto rápidamente
2. **Context Switching**: Entender estado al volver al proyecto
3. **Health Check**: Verificación rápida de problemas
4. **Team Updates**: Información concisa para compartir con equipo

## 🎯 Integración con Epic

Este hook es parte del **Epic: Implementar DXP con 6 Hooks Fundamentales para IDE**:

- **Task ID:** `1757890832-task-hook-2-quick-status`
- **Dependencies:** Hook 1 (Auto-Indexer) para cache optimizado
- **Cycle:** `1757890814-cycle-epic-implementar-dxp-con-6-hooks-fundamentales-pa`

## 🔗 Hooks Relacionados

- **Hook 1:** Auto-Indexer (prepara cache para este hook)
- **Hook 3:** Task Creator (complementa con creación de tareas)
- **Hook 4:** Work Session (usa datos similares de estado)