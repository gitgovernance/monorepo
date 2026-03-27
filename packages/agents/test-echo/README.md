# @gitgov/agent-test-echo

Agente de referencia minimo para el ecosistema [GitGovernance](https://github.com/gitgovernance/monorepo). Recibe input, devuelve un echo con contexto de ejecucion.

**Para que sirve:**

- Validar que el AgentRunner funciona correctamente
- Ejemplo concreto de como crear un agente desde cero
- Demostrar los 2 modos de instalacion: NPM package y path local
- Template para crear nuevos agentes

---

## Requisitos Previos

- [GitGovernance CLI](https://github.com/gitgovernance/monorepo) instalado (`npm install -g @gitgov/cli`)
- Un proyecto inicializado con `gitgov init`

---

## Instalacion

### Opcion A: Desde NPM (produccion, CI, GitLab Duo)

```bash
npm install @gitgov/agent-test-echo
```

### Opcion B: Desde el monorepo (desarrollo local)

```bash
cd packages/agents/test-echo
pnpm build
```

No necesitas instalar nada — el CLI puede cargar el agente directamente desde su path local.

---

## Registro del Agente

Antes de ejecutar un agente, necesitas registrarlo en tu proyecto GitGovernance. Son 2 pasos:

### Paso 1: Crear el actor (identidad criptografica)

```bash
gitgov actor new --type agent --name test-echo --role tester
```

Esto genera:
- Un `ActorRecord` con keypair Ed25519 en `.gitgov/actors/`
- Una clave privada en `.gitgov/keys/` (para firmar records)

### Paso 2: Registrar el agente

**Si instalaste desde NPM:**

```bash
gitgov agent new agent:test-echo --config '{
  "metadata": { "purpose": "testing" },
  "engine": {
    "type": "local",
    "entrypoint": "@gitgov/agent-test-echo",
    "function": "runAgent"
  }
}'
```

**Si usas path local (desarrollo):**

```bash
gitgov agent new agent:test-echo --config '{
  "metadata": { "purpose": "testing" },
  "engine": {
    "type": "local",
    "entrypoint": "packages/agents/test-echo/dist/index.mjs",
    "function": "runAgent"
  }
}'
```

### Verificar

```bash
gitgov agent list
# → agent:test-echo  engine:local  status:active
```

---

## Ejecucion

```bash
# Sin input
gitgov agent run agent:test-echo

# Con input
gitgov agent run agent:test-echo --input '{"hello": "world"}'
```

### Output esperado

```json
{
  "message": "Echo agent executed successfully at 2026-03-26T12:00:00.000Z",
  "data": {
    "echo": { "hello": "world" },
    "context": {
      "agentId": "agent:test-echo",
      "taskId": "1774524476-task-run-test-echo",
      "runId": "a1b2c3d4-...",
      "projectRoot": "/path/to/your/repo"
    }
  },
  "metadata": {
    "executedAt": "2026-03-26T12:00:00.000Z",
    "version": "1.0.0"
  }
}
```

El `AgentRunner` automaticamente:
- Carga el `AgentRecord` desde `.gitgov/agents/`
- Resuelve el entrypoint (NPM o path local)
- Ejecuta `runAgent(ctx)` inyectando `projectRoot` (directorio del repo)
- Crea y firma un `ExecutionRecord` con Ed25519
- Emite eventos via `EventBus`

Tu agente solo retorna `AgentOutput`. No necesita conocer el protocolo de firma ni los records.

---

## Modos de Entrypoint

El `engine.entrypoint` del AgentRecord soporta 3 formatos:

| Modo | Valor de entrypoint | Cuando usar |
|---|---|---|
| **NPM package** | `"@gitgov/agent-test-echo"` | Produccion, CI, GitLab Duo container. El agente se instala con `npm install` |
| **Path relativo** | `"packages/agents/test-echo/dist/index.mjs"` | Desarrollo local en el monorepo. Se resuelve desde el root del proyecto |
| **Path absoluto** | `"/Users/.../dist/index.mjs"` | Debugging. Se usa directamente sin resolver |

El `LocalBackend` detecta automaticamente el modo:
- Si empieza con `@` o no tiene extension de archivo → NPM package
- Si empieza con `/` → path absoluto
- Si empieza con `.` o tiene extension → path relativo

---

## Crear Tu Propio Agente

Usa este package como template:

### 1. Copiar

```bash
cp -r packages/agents/test-echo packages/agents/my-agent
```

### 2. Editar `package.json`

```json
{
  "name": "@gitgov/agent-my-agent",
  "version": "1.0.0",
  ...
}
```

### 3. Editar `index.ts`

```typescript
type AgentExecutionContext = {
  agentId: string;
  actorId: string;
  taskId: string;
  runId: string;
  input?: unknown;
  /** Directorio del repo del usuario. Usar en vez de process.cwd(). */
  projectRoot: string;
};

type AgentOutput = {
  data?: unknown;
  message?: string;
  artifacts?: string[];
  metadata?: Record<string, unknown>;
};

export async function runAgent(ctx: AgentExecutionContext): Promise<AgentOutput> {
  // ctx.projectRoot — directorio del repo (donde estan los archivos fuente)
  // ctx.input       — input del usuario (lo que paso con --input)
  // ctx.agentId     — ID de este agente
  // ctx.taskId      — TaskRecord que disparo la ejecucion

  // Tu logica aqui...

  return {
    message: "Mi agente ejecuto exitosamente",
    data: { /* tu resultado */ },
    metadata: { /* tu metadata */ },
  };
}
```

**Importante:** Usa `ctx.projectRoot` para acceder al filesystem del repo. Nunca uses `process.cwd()` — puede apuntar a un directorio incorrecto cuando el agente corre via AgentRunner.

### 4. Build y registrar

```bash
pnpm build

gitgov actor new --type agent --name my-agent --role developer
gitgov agent new agent:my-agent --config '{
  "metadata": { "purpose": "audit" },
  "engine": { "type": "local", "entrypoint": "@gitgov/agent-my-agent", "function": "runAgent" }
}'
gitgov agent run agent:my-agent
```

### 5. Publicar a NPM (opcional)

```bash
npm publish
```

Cualquier usuario puede entonces:
```bash
npm install @gitgov/agent-my-agent
gitgov actor new --type agent --name my-agent --role developer
gitgov agent new agent:my-agent --config '{"engine":{"type":"local","entrypoint":"@gitgov/agent-my-agent"}}'
gitgov agent run agent:my-agent
```

---

## Que Hace el AgentRunner (para entender el flujo)

```
Usuario ejecuta: gitgov agent run agent:test-echo --input '{"hello":"world"}'
         │
         ▼
    AgentRunner
         │
         ├── 1. loadAgent("agent:test-echo")
         │       └── FsRecordStore lee .gitgov/agents/agent_test-echo.json
         │
         ├── 2. Resolve entrypoint
         │       ├── "@gitgov/agent-test-echo" → import desde node_modules
         │       └── "packages/.../dist/index.mjs" → import desde path local
         │
         ├── 3. Build AgentExecutionContext
         │       └── { agentId, actorId, taskId, runId, input, projectRoot }
         │
         ├── 4. Execute runAgent(ctx)
         │       └── Tu funcion corre y retorna AgentOutput
         │
         ├── 5. Create ExecutionRecord (automatico)
         │       └── Firmado con Ed25519 del ActorRecord del agente
         │
         └── 6. Return AgentResponse al CLI
                 └── { status, output, executionRecordId, durationMs }
```

---

## Agentes Existentes en el Ecosistema

| Agente | Proposito | Package |
|---|---|---|
| **test-echo** | Testing y referencia | `@gitgov/agent-test-echo` |
| **security-audit** | Deteccion de PII, secrets, GDPR | `@gitgov/agent-security-audit` |
| **review-advisor** | Analisis semantico con Claude | `@gitgov/agent-review-advisor` |

---

## License

MPL-2.0
