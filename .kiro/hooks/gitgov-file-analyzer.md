# GitGovernance File Analyzer Hook

## 🎯 Prompt Detallado para Kiro Hook Creation Chat

### Contexto del Prompt:
```
Quiero crear un Agent Hook que analice archivos del proyecto GitGovernance cuando los abro, mostrando contexto relevante, tareas relacionadas y sugerencias de trabajo.
```

### Especificaciones del Hook:

**Nombre del Hook:** `GitGovernance File Analyzer`

**Tipo de Trigger:** `File Open Trigger`

**Descripción:** `Analyze opened files and show GitGovernance context, related tasks, and work suggestions`

**Target/Pattern:** `packages/**/*.{ts,js,md}` (archivos de código y documentación)

### Instrucciones Detalladas del Hook:

```
When opening files in the GitGovernance project, provide intelligent context analysis:

1. **File Context Detection**:
   - Parse file path to identify: package (core/cli/protocol), component type
   - Detect if file is: adapter, command, module, spec, test, documentation
   - Extract component name: BacklogAdapter, TaskCommand, EventBusModule, etc.
   - Determine architectural role in GitGovernance system

2. **Related Task Discovery**:
   - Execute `gitgov task list --json --quiet` to get all tasks
   - Search for tasks mentioning:
     - File name or component name in title/description
     - Package tags matching file location (core, cli, etc.)
     - Related functionality keywords
   - Prioritize active and review status tasks

3. **Context Summary Display**:
   ```
   📁 File Context: packages/core/src/adapters/backlog_adapter.ts
   🏗️ Component: BacklogAdapter (Domain Logic)
   📦 Package: @gitgov/core
   
   📋 Related Tasks (2 found):
   - [task-123] Fix BacklogAdapter validation (active, high)
   - [task-456] Add BacklogAdapter tests (draft, medium)
   
   💡 Suggestions:
   - Task-123 is active and high priority - focus here first
   - Consider running tests: pnpm --filter @gitgov/core test
   ```

4. **Architecture Context**:
   - For adapters: Show adapter pattern info and dependencies
   - For commands: Show CLI command structure and usage
   - For modules: Show module purpose and integration points
   - For specs: Show implementation status and related tasks

5. **Work Suggestions**:
   - If active tasks exist: "Continue work on task-123"
   - If no active tasks: "Consider creating task for improvements"
   - If tests exist: "Run tests to verify current state"
   - If documentation: "Check if implementation matches spec"

6. **Quick Actions**:
   - Show relevant GitGovernance commands for the file context
   - Suggest: "View related tasks", "Create new task", "Run tests", "Check status"
   - Provide copy-pasteable commands

7. **Performance Optimization**:
   - Use cached task data from indexer
   - Only analyze files in GitGovernance packages
   - Limit output to most relevant information (top 3 tasks)

8. **Error Handling**:
   - If no GitGovernance context: Show minimal info or skip
   - If task lookup fails: Show file context only
   - Graceful degradation without blocking file opening

Always provide useful context without overwhelming the developer.
```

### Configuración Adicional:
- **Auto-approve commands:** `gitgov task list --json --quiet`
- **Working directory:** Workspace root
- **Timeout:** 3 seconds (fast response)
- **Show output:** Yes (contextual information)
- **Debounce:** 1 second (avoid rapid file switching spam)

### Casos de Uso Esperados:
1. **Context Awareness**: Entender qué componente estoy editando
2. **Task Discovery**: Encontrar trabajo relacionado al archivo actual
3. **Work Continuity**: Recordar tareas en progreso en ese componente
4. **Architecture Navigation**: Entender rol del archivo en el sistema

## 🎯 Integración con Epic

Este hook es parte del **Epic: Implementar DXP con 6 Hooks Fundamentales para IDE**:

- **Task ID:** `1757890832-task-hook-5-file-analyzer`
- **Dependencies:** Hook 1 (Auto-Indexer) para datos cacheados
- **Cycle:** `1757890814-cycle-epic-implementar-dxp-con-6-hooks-fundamentales-pa`

## 🔗 Hooks Relacionados

- **Hook 1:** Auto-Indexer (proporciona datos para correlación)
- **Hook 3:** Task Creator (puede usar contexto similar)
- **Hook 4:** Work Session (complementa con contexto de trabajo)