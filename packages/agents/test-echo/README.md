# @gitgov/agent-test-echo

Agente de referencia minimo para el ecosistema [GitGovernance](https://github.com/gitgovernance/monorepo). Recibe input, devuelve un echo con contexto de ejecucion. Sirve como ejemplo funcional de como crear, instalar y ejecutar un agente.

## Instalacion

### Desde NPM (produccion)

```bash
npm install @gitgov/agent-test-echo
```

### Desde el monorepo (desarrollo)

```bash
cd packages/agents/test-echo
pnpm build
```

## Uso

### 1. Registrar el agente

```bash
# Crear actor de tipo agente
gitgov actor new --type agent --name test-echo --role tester

# Registrar agente con entrypoint NPM
gitgov agent new agent:test-echo --config '{
  "metadata": { "purpose": "testing" },
  "engine": {
    "type": "local",
    "entrypoint": "@gitgov/agent-test-echo",
    "function": "runAgent"
  }
}'
```

O con path local (desarrollo):

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

### 2. Ejecutar

```bash
gitgov agent run agent:test-echo --input '{"hello": "world"}'
```

### 3. Output esperado

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

## Modos de entrypoint

El `engine.entrypoint` del AgentRecord soporta 3 formatos:

| Modo | Ejemplo | Cuando usar |
|---|---|---|
| **NPM package** | `"@gitgov/agent-test-echo"` | Produccion, CI, agente instalado via npm |
| **Path relativo** | `"packages/agents/test-echo/dist/index.mjs"` | Desarrollo en monorepo |
| **Path absoluto** | `"/Users/.../dist/index.mjs"` | Debugging |

## Crear tu propio agente

Copia este package como template:

```bash
cp -r packages/agents/test-echo packages/agents/my-agent
```

Edita `index.ts` con tu logica. El contrato es simple:

```typescript
export async function runAgent(ctx) {
  // ctx.agentId    — ID del agente
  // ctx.taskId     — TaskRecord que disparo la ejecucion
  // ctx.projectRoot — directorio del repo del usuario
  // ctx.input      — input del usuario (opcional)

  return {
    message: "...",
    data: { /* tu resultado */ },
    metadata: { /* tu metadata */ },
  };
}
```

El `AgentRunner` se encarga de:
- Cargar el AgentRecord desde `.gitgov/agents/`
- Resolver el entrypoint (NPM, local, absoluto)
- Ejecutar `runAgent(ctx)` con el contexto completo
- Crear y firmar el `ExecutionRecord` automaticamente
- Emitir eventos via `EventBus`

Tu agente solo necesita retornar `AgentOutput`. No necesita conocer el protocolo de firma ni los records.

## License

MPL-2.0
