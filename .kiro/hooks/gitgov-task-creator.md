# GitGovernance Task Creator Hook

## 🎯 Prompt Detallado para Kiro Hook Creation Chat

### Contexto del Prompt:
```
Quiero crear un Agent Hook que me ayude a crear tareas GitGovernance de forma inteligente, sugiriendo contexto basado en archivos abiertos y estado del proyecto.
```

### Especificaciones del Hook:

**Nombre del Hook:** `GitGovernance Task Creator`

**Tipo de Trigger:** `Manual Trigger`

**Descripción:** `Intelligent task creation with context-aware suggestions`

**Target/Pattern:** No aplica (es manual trigger)

### Instrucciones Detalladas del Hook:

```
When executed, help create GitGovernance tasks with intelligent context:

1. **Context Analysis**:
   - Check currently open files in the editor
   - Identify project area: core, cli, protocol, platform, saas
   - Determine component type: adapter, command, module, spec
   - Extract relevant context from file paths and names

2. **Smart Suggestions**:
   - If in adapter file: "Create task for [AdapterName] enhancement/fix?"
   - If in command file: "Create task for CLI command improvement?"
   - If in spec file: "Create implementation task for this specification?"
   - If no specific context: "Create general project task?"

3. **Interactive Task Creation**:
   - Prompt for task title with context-aware suggestions
   - Suggest relevant tags based on current context:
     - File in packages/core → suggest "core" tag
     - File in BacklogAdapter → suggest "backlog-adapter" tag
     - File in CLI → suggest "cli" tag
   - Suggest priority based on project health and current work

4. **Template Suggestions**:
   ```
   Based on your context, here are some task templates:
   
   🔧 Bug Fix: "Fix [component] [specific issue]"
   ✨ Feature: "Implement [functionality] in [component]"
   📚 Documentation: "Document [component/feature] usage"
   🧪 Testing: "Add tests for [component/feature]"
   🔄 Refactor: "Refactor [component] for [reason]"
   ```

5. **Automated Task Creation**:
   - Generate `gitgov task new` command with suggested parameters
   - Include relevant tags, priority, and description
   - Execute command after user confirmation
   - Show created task ID and next steps

6. **Integration with Current Work**:
   - Check active cycles and suggest adding task to relevant cycle
   - If no active cycle, suggest creating one for related work
   - Link to existing tasks if similar work is in progress

7. **Quick Actions After Creation**:
   - "Task created! What's next?"
   - Options: "Assign to me", "Add to cycle", "Start working", "Create another"
   - Execute follow-up commands based on user choice

8. **Error Handling**:
   - If task creation fails: Show specific error and retry options
   - If GitGovernance not initialized: Guide through initialization
   - Validate input and provide helpful corrections

Always make task creation fast and contextually relevant to current work.
```

### Configuración Adicional:
- **Auto-approve commands:** `gitgov task new`, `gitgov cycle add-task`, `gitgov task assign`
- **Working directory:** Workspace root
- **Timeout:** 15 seconds
- **Show output:** Yes (interactive prompts and confirmations)

### Casos de Uso Esperados:
1. **Bug Reporting**: Crear tareas para bugs encontrados mientras desarrollando
2. **Feature Planning**: Crear tareas para nuevas funcionalidades
3. **Technical Debt**: Crear tareas de refactoring y mejoras
4. **Documentation**: Crear tareas para documentación faltante

## 🎯 Integración con Epic

Este hook es parte del **Epic: Implementar DXP con 6 Hooks Fundamentales para IDE**:

- **Task ID:** `1757890832-task-hook-3-task-creator`
- **Dependencies:** Hook 1 (Auto-Indexer) para datos contextuales
- **Cycle:** `1757890814-cycle-epic-implementar-dxp-con-6-hooks-fundamentales-pa`

## 🔗 Hooks Relacionados

- **Hook 1:** Auto-Indexer (proporciona contexto para sugerencias)
- **Hook 2:** Quick Status (complementa con vista de estado)
- **Hook 5:** File Analyzer (usa lógica similar de contexto)