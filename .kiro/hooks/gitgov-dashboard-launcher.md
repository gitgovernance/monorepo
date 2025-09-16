# GitGovernance Dashboard Launcher Hook

## 🎯 Prompt Detallado para Kiro Hook Creation Chat

### Contexto del Prompt:
```
Quiero crear un Agent Hook que lance el dashboard interactivo de GitGovernance con configuraciones inteligentes basadas en el contexto actual del proyecto.
```

### Especificaciones del Hook:

**Nombre del Hook:** `GitGovernance Dashboard Launcher`

**Tipo de Trigger:** `Manual Trigger`

**Descripción:** `Launch GitGovernance interactive dashboard with intelligent context-aware configuration`

**Target/Pattern:** No aplica (es manual trigger)

### Instrucciones Detalladas del Hook:

```
When executed, launch the GitGovernance dashboard with intelligent configuration:

1. **Context Analysis**:
   - Check current project phase: early development, active sprint, maintenance
   - Analyze team composition: solo developer, small team, large team
   - Determine primary workflow: kanban, scrum, custom methodology

2. **Smart Template Selection**:
   - Solo developer or <5 tasks: Use `--template=row-based` (simple view)
   - Active sprint with cycles: Use `--template=scrum-board` (ceremony focus)
   - Continuous flow >20 tasks: Use `--template=kanban-7col` (workflow optimization)
   - Default fallback: `--template=row-based`

3. **Configuration Optimization**:
   - High activity projects: `--refresh-interval=3` (faster updates)
   - Stable projects: `--refresh-interval=10` (less resource usage)
   - Development mode: Enable live mode (default)
   - Demo/presentation: Consider `--no-live` for stability

4. **Pre-Launch Preparation**:
   - Ensure cache is fresh: Check if indexer needed
   - If cache >5 minutes old: Auto-run `gitgov indexer --force`
   - Validate GitGovernance project structure
   - Check for critical alerts that need immediate attention

5. **Dashboard Launch**:
   - Execute `gitgov dashboard` with optimized parameters
   - Show launch message: "🚀 Launching GitGovernance Dashboard..."
   - Include context info: "Template: {template} | Refresh: {interval}s | Mode: {live/static}"

6. **Launch Variations**:
   - Standard launch: `gitgov dashboard`
   - Quick demo: `gitgov dashboard --template=kanban-7col --refresh-interval=5`
   - Presentation mode: `gitgov dashboard --no-live --template=scrum-board`
   - Performance mode: `gitgov dashboard --template=row-based --refresh-interval=15`

7. **Error Handling**:
   - If GitGovernance not initialized: Suggest running initialization
   - If no tasks/cycles: Launch with educational content
   - If dashboard fails: Provide troubleshooting steps
   - Terminal compatibility issues: Suggest alternative commands

8. **Post-Launch Support**:
   - Show quick help: "Press '?' in dashboard for controls"
   - Mention key shortcuts: "v: cycle views, r: refresh, q: quit"
   - Provide context for first-time users

Always optimize the dashboard experience for the current project context and user needs.
```

### Configuración Adicional:
- **Auto-approve commands:** `gitgov dashboard`, `gitgov indexer --force`
- **Working directory:** Workspace root
- **Timeout:** 30 seconds (dashboard startup)
- **Show output:** Yes (launch feedback and dashboard)
- **Terminal:** Required (interactive TUI)

### Casos de Uso Esperados:
1. **Daily Standup**: Lanzar dashboard para revisión de equipo
2. **Sprint Planning**: Vista scrum-board para planificación
3. **Workflow Analysis**: Vista kanban para optimización de flujo
4. **Demo/Presentation**: Dashboard estable para mostrar a stakeholders
5. **Development Monitoring**: Vista continua durante desarrollo activo

## 🎯 Integración con Epic

Este hook es parte del **Epic: Implementar DXP con 6 Hooks Fundamentales para IDE**:

- **Task ID:** `1757890832-task-hook-6-dashboard-launcher`
- **Dependencies:** Hook 1 (Auto-Indexer) para preparación de cache
- **Cycle:** `1757890814-cycle-epic-implementar-dxp-con-6-hooks-fundamentales-pa`

## 🔗 Hooks Relacionados

- **Hook 1:** Auto-Indexer (preparación automática de cache)
- **Hook 2:** Quick Status (vista rápida vs dashboard completo)
- **Hook 4:** Work Session (puede lanzar dashboard durante sesión)

## 🎯 Integración con Epic

Este hook es parte del **Epic: Implementar DXP con 10 Hooks Fundamentales para IDE**:

- **Task ID:** `1757890832-task-hook-5-dashboard-launcher-intelligent`
- **Dependencies:** Hook 1 (Auto-Indexer) para preparación de cache
- **Cycle:** `1757890814-cycle-epic-implementar-dxp-con-10-hooks-fundamentales-pa`

## 🔗 Hooks Relacionados

- **Hook 1:** Auto-Indexer (preparación automática de cache)
- **Hook 4:** Health Alerts (puede auto-lanzar dashboard en alertas críticas)
- **Hook 6:** Workflow Optimizer (usa insights del dashboard)