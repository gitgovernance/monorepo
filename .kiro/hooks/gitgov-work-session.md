# GitGovernance Work Session Hook

## 🎯 Prompt Detallado para Kiro Hook Creation Chat

### Contexto del Prompt:
```
Quiero crear un Agent Hook que inicie una sesión de trabajo GitGovernance, preparando el entorno y mostrando tareas relevantes para comenzar a trabajar productivamente.
```

### Especificaciones del Hook:

**Nombre del Hook:** `GitGovernance Work Session`

**Tipo de Trigger:** `Manual Trigger`

**Descripción:** `Start a productive GitGovernance work session with context and task recommendations`

**Target/Pattern:** No aplica (es manual trigger)

### Instrucciones Detalladas del Hook:

```
When executed, prepare and start an optimal GitGovernance work session:

1. **Session Preparation**:
   - Execute `gitgov indexer` to ensure fresh cache
   - Check project health with `gitgov status --json`
   - Identify current actor and their assigned work
   - Prepare workspace context for productive session

2. **Personal Work Dashboard**:
   ```
   🎯 GitGovernance Work Session Started
   ====================================
   👤 Actor: human:camilo
   📅 Date: [current date]
   🕐 Session started at: [time]
   
   📋 Your Tasks:
   - [task-123] Fix BacklogAdapter validation (high, active)
   - [task-456] Implement CLI status command (medium, review)
   
   🎯 Suggested Focus:
   - Priority: Complete task-123 (blocking 2 other tasks)
   - Next: Review task-456 for completion
   ```

3. **Work Recommendations**:
   - Analyze personal task queue and suggest optimal work order
   - Identify high-impact tasks (blocking others, critical priority)
   - Suggest quick wins (small tasks that can be completed quickly)
   - Flag tasks needing attention (stalled, waiting for feedback)

4. **Session Goals**:
   - Set realistic session goals based on task complexity and time
   - Suggest: "Goal for this session: Complete task-123 and review 2 pending tasks"
   - Track progress against goals throughout session

5. **Interactive Work Menu**:
   ```
   What would you like to work on?
   1. Start high-priority task (task-123)
   2. Review pending tasks (2 available)
   3. Create new task
   4. Check project health
   5. Open dashboard for full view
   6. End session
   ```

6. **Context Switching Support**:
   - When switching between tasks, show relevant context
   - Provide quick task summaries and current status
   - Suggest related files to open or commands to run

7. **Progress Tracking**:
   - Track tasks worked on during session
   - Show session summary: "Completed 1 task, reviewed 2, created 1"
   - Suggest session wrap-up actions

8. **Session End**:
   - Summarize work accomplished
   - Suggest next session priorities
   - Update task statuses if needed
   - Create execution records for completed work

Always optimize for developer productivity and clear work focus.
```

### Configuración Adicional:
- **Auto-approve commands:** `gitgov indexer`, `gitgov status --json`, `gitgov task list --json`
- **Working directory:** Workspace root
- **Timeout:** 20 seconds
- **Show output:** Yes (interactive session management)

### Casos de Uso Esperados:
1. **Daily Work Start**: Comenzar día de trabajo con contexto claro
2. **Context Switching**: Cambiar entre diferentes áreas del proyecto
3. **Focus Sessions**: Sesiones dedicadas a tareas específicas
4. **Progress Tracking**: Monitorear productividad durante el día

## 🎯 Integración con Epic

Este hook es parte del **Epic: Implementar DXP con 6 Hooks Fundamentales para IDE**:

- **Task ID:** `1757890832-task-hook-4-work-session`
- **Dependencies:** Hook 1 (Auto-Indexer) para datos actualizados
- **Cycle:** `1757890814-cycle-epic-implementar-dxp-con-6-hooks-fundamentales-pa`

## 🔗 Hooks Relacionados

- **Hook 1:** Auto-Indexer (asegura datos frescos para sesión)
- **Hook 2:** Quick Status (proporciona vista inicial de estado)
- **Hook 3:** Task Creator (puede crear tareas durante sesión)