# GitGovernance Commit Helper Hook

## 🎯 Prompt Detallado para Kiro Hook Creation Chat

### Contexto del Prompt:
```
Quiero crear un Agent Hook que me ayude a crear commits más informativos correlacionando cambios de archivos con tareas GitGovernance y sugiriendo mensajes de commit apropiados.
```

### Especificaciones del Hook:

**Nombre del Hook:** `GitGovernance Commit Helper`

**Tipo de Trigger:** `Manual Trigger`

**Descripción:** `Help create informative commits by correlating file changes with GitGovernance tasks`

**Target/Pattern:** No aplica (es manual trigger)

### Instrucciones Detalladas del Hook:

```
When executed, help create better commits by analyzing changes and GitGovernance context:

1. **Git Status Analysis**:
   - Execute `git status --porcelain` to get modified files
   - Categorize changes: modified, added, deleted files
   - Identify affected packages: core, cli, protocol, etc.
   - Determine change scope: single component vs multiple areas

2. **File-to-Task Correlation**:
   - Execute `gitgov task list --json --quiet` to get active tasks
   - For each modified file, find related tasks by:
     - File path mentions in task descriptions
     - Component/package correlation (BacklogAdapter → backlog tasks)
     - Active tasks in same architectural area
   - Prioritize tasks with "active" or "review" status

3. **Commit Message Suggestions**:
   ```
   📝 Suggested Commit Messages:
   
   Based on modified files and related tasks:
   
   1. "feat(core): implement BacklogAdapter validation (task-123)"
   2. "fix(cli): resolve task command status update issue"
   3. "docs(core): update BacklogAdapter documentation"
   4. "test(core): add BacklogAdapter validation tests"
   ```

4. **Change Impact Analysis**:
   - Identify if changes are: feature, fix, refactor, docs, test
   - Determine breaking changes or API modifications
   - Assess scope: patch, minor, or major change
   - Flag if changes affect multiple packages

5. **Task Status Suggestions**:
   - If committing task-related work: "Update task-123 status to 'review'?"
   - If completing feature: "Mark task-123 as 'done'?"
   - If fixing bug: "Create execution record for task-123?"
   - Provide specific GitGovernance commands

6. **Commit Quality Checks**:
   - Suggest including task references: "(task-123)" or "fixes #123"
   - Recommend conventional commit format: "feat:", "fix:", "docs:"
   - Flag commits affecting multiple unrelated areas
   - Suggest splitting large commits if needed

7. **Interactive Workflow**:
   ```
   🔄 Commit Workflow:
   1. Review suggested commit message
   2. Choose or customize message
   3. Update related task status?
   4. Create execution record?
   5. Proceed with commit
   ```

8. **Post-Commit Actions**:
   - Suggest updating task statuses based on commit
   - Recommend creating execution records for significant work
   - Update project cache if needed
   - Suggest next steps for continued work

Always help create commits that maintain clear project history and GitGovernance correlation.
```

### Configuración Adicional:
- **Auto-approve commands:** `git status --porcelain`, `gitgov task list --json --quiet`
- **Working directory:** Workspace root
- **Timeout:** 5 seconds
- **Show output:** Yes (commit suggestions and workflow)
- **Git integration:** Read-only Git operations

### Integración con Git Diagnostics:
Este hook funciona de manera complementaria con la configuración `git.diagnosticsCommitHook.enabled` de Kiro. Cuando ambos están habilitados:
- Git Diagnostics proporciona análisis automático en cada commit
- Este hook manual ofrece análisis detallado bajo demanda
- Ambos comparten la misma lógica de correlación task-to-file

### Casos de Uso Esperados:
1. **Better Commit Messages**: Crear commits más informativos y consistentes
2. **Task Correlation**: Vincular commits con tareas GitGovernance
3. **Workflow Integration**: Actualizar estado de tareas después de commits
4. **Project History**: Mantener historial claro de cambios y progreso

## 🎯 Integración con Epic

Este hook es parte del **Epic: Implementar DXP con 6 Hooks Fundamentales para IDE**:

- **Task ID:** `1757890832-task-hook-7-commit-helper`
- **Dependencies:** Hook 1 (Auto-Indexer) para correlación de tareas
- **Cycle:** `1757890814-cycle-epic-implementar-dxp-con-6-hooks-fundamentales-pa`

## 🔗 Hooks Relacionados

- **Hook 1:** Auto-Indexer (proporciona datos para correlación)
- **Hook 5:** File Analyzer (usa lógica similar de file-to-task mapping)
- **Hook 4:** Work Session (puede sugerir commits durante sesión)