# Epic Input: triad_indexer

> Captura completa de la idea, contexto de diseño, investigación, y decisiones.
> Origen: sesion triad_web 2026-04-08, después de implementar graph + edges + drift.
> Este input debe ser suficiente para que un agente cree la epic sin preguntas.

---

## 1. El problema (cómo llegamos aquí)

### 1.1. Contexto: qué existe hoy

El state machine de Triad tiene 7 estados por módulo (`no_spec → spec_draft → spec_ready → implemented → tested → coherent ⇄ drift`). Los estados se almacenan en JSON:

```
.triad/state.json                    ← epic registry (qué epics existen)
.triad/state/{epic}/{module}.json    ← estado de cada módulo
.triad/state/edges.json              ← relaciones module→module (depends_on)
```

Estos JSON los crean/actualizan:
- `detect_hook` (PostToolUse) — cuando Claude Code escribe un archivo
- `state-manager.ts` con `initModule()` / `transitionModule()` — llamado por hooks y skills
- Manual — cuando un developer crea el JSON a mano (nadie lo hace)

La webapp (`triad_web`) lee estos JSON via `generate-data.ts` → produce `state.json` → React renderiza.

### 1.2. Los 3 gaps

**Gap 1: No hay descubrimiento automático.**
Si alguien crea un `.ts` en su IDE, el sistema no se entera. `generate-data.ts` solo lee lo que ya existe en `.triad/state/`. No escanea el filesystem. Resultado: módulos nuevos son invisibles hasta que un hook o un humano cree el JSON.

**Gap 2: Datos ricos atrapados en markdown.**
Los specs tienen EARS estructurados (`[TKN-A1] WHEN X, SHALL Y`), los roadmaps tienen cycles/tasks/progress, los overviews tienen decisiones. Hoy `countEars()` extrae un número con regex, pero no puede extraer el array estructurado `[{id, text, block, status}]` que la webapp necesita para mostrar la triada completa.

**Gap 3: No hay "sistema vivo".**
El usuario quiere que la indexación sea invisible — que al abrir la webapp, el sistema esté vivo: descubriendo módulos, extrayendo datos, calculando métricas. Sin intervención manual. Si un archivo cambia, el grafo se actualiza solo.

### 1.3. Frase clave del usuario

> "quiero que mi usuario el proceso de indexación sea literalmente invisible... podríamos en la web mostrar un stream de cosas que se están pidiendo o calculando... mostrar un sistema que tiene vida propia"

> "la clave acá está en indexar y ser cuidadoso en qué cosas se recalculan, si es con grep o con claude -p, ambos casos determinista y no determinista son testeables con código para mí y por ende tienen triada"

---

## 2. Investigación previa: modelo de relaciones

### 2.1. Research con 5 agentes (2026-04-08)

Se levantaron 5 agentes para investigar cómo el mercado modela relaciones:

| Tool/Framework | Relationship Types | Storage | Cross-boundary |
|---|---|---|---|
| OpenAPI | `$ref` composition | Inline pointers | File-relative URIs |
| GraphQL | Fields, interfaces, Federation `@key` | Schema SDL | Subgraph stitching |
| Terraform | Implicit DAG + `depends_on` | HCL expressions | `module.X.output_Y` |
| SPDX/CycloneDX | ~20 types (`DEPENDS_ON`, `CONTAINS`, `GENERATED_FROM`) | Separate `relationships` array | External document refs |
| Backstage | `dependsOn`, `consumesApi`, `providesApi`, `partOf` | YAML entity descriptor | Namespaced refs `component:ns/name` |

### 2.2. 3 opciones evaluadas

| | Option A: Inline | Option B: Archivo separado | Option C: Spec-derived |
|---|---|---|---|
| Dónde | Dentro de cada module .json | `.triad/state/edges.json` | Computado de specs + imports |
| GitGov futuro | Agregar `protocolRefs` | Agregar edges con prefijo `gitgov:` | No soporta sin híbrido |
| Pros | Sin archivos nuevos | Single source of truth, extensible | Siempre refleja realidad |
| Contras | Denormalizado | Puede desincronizarse | Frágil a formato markdown |

**Decisión: Option B** con prefijos `mod:`, `epic:` (extensible a `gitgov:task:`, `gitgov:workflow:`).
**Razón:** el grafo de la webapp ya usa estos prefijos en `buildGraph()`. Agregar GitGov es agregar tipos, no cambiar schema.

### 2.3. Insight clave del usuario sobre relaciones

> "una épica que depende de un módulo es porque dicho módulo ya se implementó... una vez que la dependencia es el módulo no tiene sentido decir que es de X epic"

Resultado: **el módulo es la unidad atómica.** Las dependencias siempre apuntan a módulos. Epic→epic se deriva automáticamente de module deps cross-epic. No se declara.

```
edges.json:
  { "source": "mod:refresh_hook", "target": "mod:generate_data", "type": "depends_on" }

Derivado por generate-data.ts:
  { "source": "epic:triad_web", "target": "epic:triad_state_machine", "type": "depends_on" }
```

---

## 3. Solución: pipeline de indexación de 2 capas

### 3.1. Capa 1: Determinista (grep, fs, git) — rápida, sin AI

```
reindex.ts
  │
  ├── Escanea specs/**/*.md → encuentra specs
  ├── Escanea src/**/*.ts (no .test) → encuentra código
  ├── Escanea src/**/*.test.ts → encuentra tests
  │
  ├── Para cada spec encontrado:
  │   ¿Existe .triad/state/{epic}/{module}.json?
  │   NO → crear con state basado en qué vértices existen:
  │       solo spec           → spec_draft
  │       spec + code         → implemented
  │       spec + code + tests → tested
  │   SI → verificar que el state refleja la realidad
  │
  ├── Para cada .ts sin spec:
  │   → Reportar: "archivo suelto, falta spec + tests"
  │
  ├── countEars() regex (existente)
  ├── buildDriftSet() git batch (existente)
  ├── computeNextAction() (existente)
  │
  └── Output: .triad/state/*.json actualizados
```

**Triggers:**
```
/triad:init      → full reindex (una vez)
/triad:web       → reindex + generate-data (cada apertura)
git pre-commit   → reindex + generate-data (cada commit)
refresh_hook     → incremental (solo archivo cambiado)
manual           → npx tsx scripts/reindex.ts
```

**Qué se recalcula y cuándo:**
```
¿Cambió filesystem? (git diff)     → Capa 1: re-escanear (ms)
¿Cambió un .md? (spec, roadmap)    → Capa 2: re-extraer (segundos)
¿Cambió code/tests pero no spec?   → Capa 1 sola (needsAudit, state)
¿Nada cambió?                      → cache, nada que hacer
```

### 3.2. Capa 2: No determinista (claude -p) — lenta, con AI, con confidence

```
extract.ts
  │
  ├── Cola: lista de .md que cambiaron desde última extracción
  │
  ├── Para cada archivo en la cola:
  │   claude -p "parsea este markdown, output JSON" --model haiku
  │   │
  │   ├── Spec module → array de EARS [{id, text, block, status}]
  │   ├── Roadmap → {cycles: [{number, name, status, tasks: [{text, done}]}]}
  │   └── Overview → {decisions: [{id, decision, resolution, reason}]}
  │
  ├── Cada extracción tiene:
  │   - confidence: 0-1 (el propio claude reporta)
  │   - extractedAt: timestamp
  │   - sourceHash: git hash del archivo (para invalidar cache)
  │
  └── Output: enriched JSON que generate-data.ts merge con Capa 1
```

**Patrón de ejecución:** mismo que `skill_e2e_auditor` (ver `e2e/tests/helpers.ts`):
```typescript
const result = execSync(
  `claude -p "${prompt}" --model haiku --permission-mode bypassPermissions`,
  { cwd: dir, timeout: 30_000, encoding: 'utf-8' }
);
const parsed = JSON.parse(result);
```

**Cache:** si el `git hash-object {file}` no cambió desde la última extracción, skip.

### 3.3. Capa 3: Queue + Streaming UI

```
Webapp (React):
  │
  ├── state.json tiene campo "indexing" por módulo:
  │   { "module": "X", "indexing": { "layer1": "done", "layer2": "pending" } }
  │
  ├── Dashboard muestra cola de procesamiento:
  │   "Indexando generate_data... ✓"
  │   "Extrayendo EARS de token_handler... ⏳"
  │   "Parseando roadmap.md... ⏳"
  │
  └── Progressive loading:
      Capa 1 se muestra inmediatamente (state, needsAudit, count)
      Capa 2 streams cuando completa (EARS array, cycles, confidence)
```

---

## 4. Output por módulo (ejemplo completo)

```json
{
  "module": "token_handler",
  "epic": "auth_system",
  "state": "tested",
  "codePath": "src/token_handler/",
  "specPath": "specs/modules/token_handler/",
  "cycle": 2,
  "package": "@gitgov/core",
  "needsAudit": true,
  "nextAction": {
    "command": "/triad:audit token_handler",
    "reason": "triada files changed since last audit"
  },
  "ears": {
    "count": 12,
    "items": [
      { "id": "TKN-A1", "text": "WHEN token expires, SHALL refresh automatically", "block": "A", "status": "implemented" },
      { "id": "TKN-A2", "text": "WHEN refresh fails, SHALL redirect to login", "block": "A", "status": "tested" }
    ],
    "source": "spec",
    "confidence": 0.95,
    "extractedAt": "2026-04-08T10:30:00Z",
    "sourceHash": "a1b2c3d"
  },
  "epicContext": {
    "activeCycle": 2,
    "progress": 78,
    "tasksCompleted": 5,
    "tasksTotal": 7,
    "source": "roadmap",
    "confidence": 0.88,
    "extractedAt": "2026-04-08T10:31:00Z"
  },
  "looseFiles": [],
  "score": 0.86,
  "lastAudit": { "verdict": "PARTIAL", "score": 0.86, "findings": 2, "ts": "2026-04-07" },
  "history": [...]
}
```

---

## 5. Lo que ya existe (implementado en triad_web)

Estas funciones en `generate-data.ts` son la base de Capa 1:

| Función | Qué hace | EARS |
|---|---|---|
| `readEpicRegistry()` | Lee `.triad/state.json` | GEN-A1 |
| `readModuleStates()` | Lee `*.json` de un stateDir | GEN-A2 |
| `countEars()` | Regex `**[PREFIX-X1]**` en specs | GEN-B5 |
| `buildDriftSet()` | 2 git calls: diff + untracked | GEN-B7 |
| `checkTriadDrift()` | Matchea changed files contra paths del módulo | GEN-B7 |
| `readEdges()` | Lee `.triad/state/edges.json` | GEN-B6 |
| `deriveEpicEdges()` | Agrega epic→epic desde module deps cross-epic | GEN-B8 |
| `computeNextAction()` | Recomienda `/triad:*` según estado + drift | GEN-B9 |

**Lo que falta (esta epic):**
- `reindex()` — escanear fs y crear/actualizar state files
- `extract()` — claude -p para datos estructurados
- Queue + streaming UI

---

## 6. Decisiones de diseño ya tomadas

| ID | Decisión | Razón |
|---|---|---|
| D1 | edges.json separado (Option B) | Extensible con prefijos, single source of truth, diffeable en PRs |
| D2 | Prefijos mod:/epic: | Extensible a gitgov:task:, gitgov:workflow: sin cambio de schema |
| D3 | Epic→epic derivado, no declarado | Módulo es la unidad atómica. Epic es contenedor organizativo |
| D4 | Drift via git, no checksums | Zero infraestructura extra. 2 git calls al inicio |
| D5 | Capa 2 opcional | Sistema funciona completo solo con Capa 1. AI enriquece |
| D6 | Ambas capas testeables con triada | Determinista: unit tests. No determinista: E2E con claude -p |
| D7 | Cache por git hash | Si `git hash-object {file}` no cambió, skip extracción |
| D8 | Rate limiting explícito | No saturar suscripción de claude. Cola con prioridad |

---

## 7. Herramientas externas evaluadas: CIE + MIE (kraklabs)

### 7.1. CIE (Code Intelligence Engine) — https://github.com/kraklabs/cie

Go CLI + MCP server que indexa código con **Tree-sitter AST**. 20+ tools: call graph, find callers/callees, trace path, find type, semantic search. Storage: CozoDB (Datalog + RocksDB). Soporta Go, Python, JS, TypeScript.

**Dónde aporta a esta epic:**
- **Capa 1 (determinista):** CIE reemplaza regex para descubrimiento de relaciones. En vez de declarar `edges.json` manualmente, CIE computa imports/exports reales via AST: `cie_find_callers --function generateData` devuelve todos los call sites.
- **Call graph real:** `cie_get_call_graph` resuelve el problema de "si toco scan_orchestrator, qué se rompe" con precision de AST, no con edges declarados que pueden desincronizarse.
- **Semantic search:** con embeddings (Ollama/OpenAI), permite "búscame módulos que hacen algo parecido a validación de tokens" — útil para descubrir duplicación.

**Limitación:** No entiende markdown como specs estructurados. Trata `.md` como texto plano.

### 7.2. MIE (Memory Intelligence Engine) — https://github.com/kraklabs/mie

Go daemon + MCP server que persiste **knowledge graph** para agentes AI. Nodes tipados: Facts, Decisions, Entities, Events, Topics. Storage: CozoDB con HNSW vector indexes.

**Dónde aporta a esta epic:**
- **Capa 2 (no determinista):** MIE persiste lo que claude -p extrae, sin re-extraer cada vez. EARS extraídos de un spec se almacenan como Facts. Decisiones arquitectónicas como Decisions. Entre sesiones, `mie_query` devuelve lo almacenado sin llamar a claude.
- **Cross-session memory:** un agente que audita hoy puede leer lo que otro agente indexó ayer. No hay pérdida de contexto entre sesiones.
- **Conflict detection:** `mie_conflicts` detecta hechos contradictorios — útil para detectar drift entre lo que el spec dice y lo que el código hace.

**Limitación:** No indexa código (no tiene AST). Es knowledge store puro. Necesita CIE o el propio agente para alimentarlo.

### 7.3. Cómo encajan juntos

```
CIE  → indexa CÓDIGO (AST, call graph, types, imports)
MIE  → persiste CONOCIMIENTO (EARS extraídos, decisions, facts)
Triad Indexer → ORQUESTA ambos + agrega la METODOLOGÍA (triada, states, drift, nextAction)

Flujo:
  1. reindex.ts escanea filesystem → descubre módulos
  2. CIE indexa código → call graph, types, imports → alimenta edges.json automaticamente
  3. claude -p extrae EARS/roadmap → mie_bulk_store persiste las extracciones
  4. generate-data.ts consume todo → state.json para la webapp
  5. Siguiente sesión: mie_query en vez de re-extraer → inmediato
```

**Decisión clave:** CIE y MIE son opcionales. El indexer funciona sin ellos (regex + claude -p directos). Pero cuando están disponibles, el sistema es más preciso (AST vs regex) y más rápido (cache en MIE vs re-extraer con claude -p).

### 7.4. Licencia y deployment

Ambas son AGPL v3, Go binaries, sin dependencias externas. CIE almacena en `~/.cie/data/`. MIE corre como daemon singleton. Se exponen como MCP servers — la webapp o los scripts pueden consumirlos via MCP tools.

---

## 8. Conexión con GitGov (futuro)

Triad es standalone. GitGov se conecta después con mínima fricción:

```
TRIAD (hoy):
  Node types:  epic, module
  Edge types:  contains, depends_on
  Prefijos:    mod:, epic:

GITGOV (mañana):
  Node types:  + WorkflowRecord, TaskRecord, ExecutionRecord
  Edge types:  + tracks, implements, produces
  Prefijos:    + gitgov:task:, gitgov:workflow:, gitgov:execution:
```

La interfaz de conexión es edges.json — nuevos tipos de nodos y edges, mismo schema.

### 8.1. Roadmap de escalamiento

```
FASE 1 — Triad Indexer (esta epic):
  regex + fs + git → reindex.ts
  claude -p → extract.ts
  Cola + streaming UI

FASE 2 — CIE integration:
  Tree-sitter AST reemplaza regex para code discovery
  Call graph reemplaza edges.json manuales
  cie_find_callers/callees alimenta depends_on automáticamente

FASE 3 — MIE integration:
  Extracciones de claude -p se persisten en MIE
  Cross-session: no re-extraer, query lo almacenado
  Conflict detection: spec dice X, código hace Y → finding

FASE 4 — GitGov protocol:
  Nuevos node/edge types en el grafo
  WorkflowRecord → TaskRecord → ExecutionRecord
  edges.json absorbe protocol records con prefijo gitgov:

FASE 5 — SaaS:
  Graph DB (Neo4j o similar) reemplaza edges.json files
  Vector DB para semantic search cross-project
  CIE + MIE como servicios (no CLI locales)
```

Cada fase se agrega encima de la anterior. Nada se reescribe.

---

## 9. Referencia: skill_e2e_auditor pattern

La Capa 2 reutiliza el patrón de `skill_e2e_auditor` (epic completada Cycles 1-2):

```typescript
// helpers.ts de skill_e2e_auditor
function runSkillCommand(prompt: string, cwd: string, opts?: { model?: string }): SkillResult {
  const cmd = `claude -p "${prompt}" --model ${model} --permission-mode bypassPermissions`;
  const stdout = execSync(cmd, { cwd, timeout, encoding: 'utf-8' });
  return { stdout, stderr: '', exitCode: 0 };
}
```

Los tests E2E crean tmpdir con `git init` + `.triad/config.json`, ejecutan claude -p, y verifican assertions sobre el output. Ver: `e2e/tests/skill_new.test.ts`.

---

## 10. Cycles estimados

| Cycle | Nombre | Qué produce |
|---|---|---|
| 1 | Reindexer determinista | `reindex.ts`: scan fs, crear state files, integrar en triggers |
| 2 | AI extraction + cache | `extract.ts`: claude -p, EARS array, roadmap parsing, confidence, cache |
| 3 | Queue + streaming UI | Cola visible en webapp, progressive loading, rate limiting |

---

## 11. Investigación de mercado (2026-04-08)

### 11.1. Code Indexing — herramientas evaluadas

| Tool | Qué hace | Lenguajes | Indexing | Output | License | Stars | Recomendación |
|---|---|---|---|---|---|---|---|
| **ts-morph** | TS compiler API wrapper | TS/JS | Full type-checker | Programmatic | MIT | 5.2k | Cycle 3: imports/exports/call sites reales |
| **dependency-cruiser** | Valida + visualiza deps | JS/TS | AST (TS compiler) | JSON, DOT, Mermaid | MIT | 5.5k | Cycle 3: alternativa a ts-morph, más ergonómico para reglas |
| **tree-sitter** | Parser incremental multi-lang | 100+ (TS, Go, MD) | AST error-tolerant | S-expression, queries | MIT | Massive | Futuro: multi-lenguaje (Go+TS+Markdown) |
| **skott** | Grafo de deps TS/JS con web UI | TS/JS | AST imports | JSON graph + web UI | MIT | 800 | Interesante web UI, pero duplica nuestra webapp |
| **madge** | Circular deps + grafo | JS/TS/CSS | AST (detective) | JSON, DOT, SVG | MIT | 7.8k | Solo si necesitamos detectar circular deps |
| **SCIP** (Sourcegraph) | Cross-repo code intel | TS, Go, 10+ | Full type-checker | Protobuf (SCIP) | Apache-2.0 | — | GitGov scale: precisión cross-repo |
| **Semgrep** | Pattern matching structural | 30+ | AST (tree-sitter) | JSON, SARIF | LGPL-2.1 | 11k | Búsqueda de patrones, no indexación |
| **CIE** (kraklabs) | Code intelligence + MCP | TS, Go, Py, JS | Tree-sitter + CozoDB | MCP tools (20+) | AGPL-3.0 | — | GitGov scale: CIE ya integra tree-sitter + CozoDB + MCP |

**Decisión para Cycle 3 (code deps):** `ts-morph` o `dependency-cruiser`. Ambos MIT, TS nativo, JSON output. ts-morph es más granular (call sites, types), dependency-cruiser es más ergonómico (reglas declarativas, visualización). Evaluar al implementar.

**Decisión para GitGov scale:** `CIE` si necesitamos Go+TS+Python en un solo tool. `ts-morph` + `tree-sitter` si preferimos composición de herramientas MIT.

### 11.2. Knowledge/Graph Storage — herramientas evaluadas

| Tool | Qué hace | Storage | Query | Vector? | MCP? | License | Recomendación |
|---|---|---|---|---|---|---|---|
| **@anthropic/memory** | Knowledge graph JSON | JSON file | MCP tools | No | Si (oficial) | MIT | Cycle 2: prototipo rápido, zero setup |
| **CozoDB** | Graph + vector embeddable | RocksDB/SQLite | Datalog | Si (HNSW) | No | MPL-2.0 | Cycle 3: si necesitamos queries complejas |
| **SurrealDB** | Multi-model embeddable | Embedded/server | SurrealQL | Si | Community | BSL-1.1 | GitGov: all-in-one (doc+graph+vector) |
| **LanceDB** | Vector DB embeddable | File-based | SQL + vector | Si (core) | Community | Apache-2.0 | Cycle 2: semantic search sobre specs |
| **Neo4j** | Graph DB completo | Server | Cypher | Si (5.11+) | Si | GPL-3.0 | SaaS: queries complejas multi-tenant |
| **ChromaDB** | Embedding store | SQLite+HNSW | API + filters | Si (core) | Si | Apache-2.0 | Cycle 2: alternativa a LanceDB |
| **MIE** (kraklabs) | Memory graph + MCP | CozoDB | Datalog + MCP | Si | Si (nativo) | AGPL-3.0 | GitGov: ya integra CozoDB + MCP + conflict detection |

**Decisión para Cycle 2 (cache):** empezar con JSON file (`.triad/cache/`). Si necesitamos semantic search, agregar `LanceDB` (Apache-2.0, embedded, zero server). Si necesitamos cross-session memory para agentes, evaluar `@anthropic/memory` (MCP oficial, MIT).

**Decisión para GitGov scale:** `SurrealDB embedded` (graph+vector+doc en uno, SQL-like) o `MIE` (ya trae CozoDB + MCP + conflict detection pero AGPL).

### 11.3. Markdown Extraction — herramientas evaluadas

| Tool | Qué hace | EARS custom? | Tables→JSON? | Checkboxes? | API TS? | License |
|---|---|---|---|---|---|---|
| **remark + remark-gfm** | Markdown→AST (mdast) | Si, via visitors | Si, nativo | Si (`checked`) | Si, ESM | MIT |
| **markdown-it** | Markdown→tokens | Manual (reglas) | Si, tokens | Via plugin | Si | MIT |
| **gray-matter** | Frontmatter parser | No | No | No | Si | MIT |
| **claude -p** | AI extraction | Si, cualquier formato | Si | Si | Via execSync | N/A |

**Decisión para Cycle 1:** `remark` + `remark-gfm` + visitors custom. Razón:
- Parsea markdown como AST, no como texto. Tables son nodos, checkboxes tienen `.checked: boolean`
- EARS se extraen con `unist-util-visit` sobre text nodes: match `[PREFIX-X1] WHEN...SHALL`
- Determinista, 500 archivos en segundos, zero cost
- TypeScript nativo (ESM), MIT
- `claude -p` solo como fallback para specs con formato inconsistente

### 11.4. Recomendación por fase

| Fase | Code Indexing | Knowledge Storage | Markdown Extraction |
|---|---|---|---|
| Cycle 1 | `fs` + `git diff` | JSON files (`.triad/cache/`) | `remark` + `remark-gfm` |
| Cycle 2 | (mismo) | + `LanceDB` o JSON cache | + `claude -p` fallback |
| Cycle 3 | + `ts-morph` o `dependency-cruiser` | + `@anthropic/memory` (MCP) | (mismo) |
| GitGov | + `CIE` (multi-lang) | + `SurrealDB` o `MIE` | (mismo) |
| SaaS | + `SCIP` (cross-repo) | + `Neo4j` (multi-tenant) | (mismo) |

---

## 12. Deuda Técnica como View Computado

### 12.1. El problema de la deuda hoy

La deuda técnica en Triad está dispersa en múltiples lugares:

| Dónde vive hoy | Qué registra | Problema |
|:----------------|:-------------|:---------|
| `AGENTS.md §Deuda` | Deuda del package (skills sin formato, tests faltantes) | Manual, se desactualiza, solo si lees el archivo |
| `roadmap.md "Trabajo futuro"` | Tasks no completadas de la epic | Se olvida cuando la epic se cierra |
| Spec `§ESTADO` | 🔴 en tablas de trazabilidad | Solo visible si abres el spec |
| Código (`// TODO`) | Deuda micro | Se pierde en el ruido |
| Conversación | "Lo dejamos para después" | Se pierde en rewind/compaction |
| State machine | Módulo en `tested` en vez de `coherent` | Es dato, pero nadie lo agrega como "deuda" |

**No hay un solo lugar donde preguntar: "¿cuál es toda la deuda técnica del proyecto?"**

### 12.2. La deuda NO necesita sistema propio — el indexer la computa

Cada tipo de deuda técnica es un **predicado sobre datos que el indexer ya produce**:

| Tipo de deuda | Dato del indexer | Predicado |
|:-------------|:-----------------|:----------|
| Triada incompleta | `module.state` | `state !== 'coherent' && state !== 'drift'` |
| Triada no auditada | `module.needsAudit` | `needsAudit === true` |
| EARS sin implementar | `module.ears.items[].status` | `status !== 'tested'` |
| EARS sin test | `module.ears.items[].status` | `status === 'implemented'` (code pero no test) |
| Score bajo | `module.score` | `score < 0.9` |
| Audit con findings | `module.lastAudit.findings` | `findings > 0` |
| Cycle incompleto | `module.epicContext.progress` | `progress < 100` |
| Skill sin formato | `skill_auditor findings` | `findings.length > 0` (seccion faltante, EARS mal) |
| Skill sin E2E | `skill.testPath` | `testPath === null` (no existe skill_e2e.test.ts) |
| Spec sin código | `module.state` | `state === 'spec_ready'` (spec aprobado, 0 código) |
| Drift detectado | `module.state` | `state === 'drift'` |
| Módulo descubierto sin spec | `module.state` | `state === 'no_spec'` (Capa 1 lo descubrió) |

### 12.3. Output: debt summary por proyecto

El indexer produce un campo `debt` en el state.json global:

```json
{
  "debt": {
    "total": 23,
    "critical": 3,
    "high": 8,
    "medium": 12,
    "items": [
      {
        "type": "triada_incomplete",
        "module": "token_handler",
        "epic": "auth_system",
        "state": "tested",
        "reason": "Audit score 0.86 (needs 0.9 for coherent)",
        "action": "/triad:audit token_handler",
        "severity": "high"
      },
      {
        "type": "ears_no_test",
        "module": "token_handler",
        "epic": "auth_system",
        "earsId": "TKN-B3",
        "reason": "EARS TKN-B3 in spec and code but no test",
        "action": "Add test for [TKN-B3]",
        "severity": "critical"
      },
      {
        "type": "skill_no_format",
        "skill": "audit",
        "reason": "SKILL.md missing 4 of 6 required sections",
        "action": "Reformat with skill_designer (6 sections + EARS)",
        "severity": "medium"
      },
      {
        "type": "skill_no_e2e",
        "skill": "checkpoint",
        "reason": "No skill_e2e.test.ts exists",
        "action": "Create E2E test following helpers pattern",
        "severity": "medium"
      },
      {
        "type": "cycle_incomplete",
        "epic": "auth_system",
        "cycle": 2,
        "progress": 78,
        "pendingTasks": 2,
        "reason": "Cycle 2 at 78% — 2 tasks pending",
        "action": "/triad:resume auth_system",
        "severity": "high"
      }
    ]
  }
}
```

### 12.4. Visualización en /triad:status y webapp

**`/triad:status` incluye deuda:**

```
╔══════════════════════════════════════════════════════════╗
║                    PROJECT HEALTH                         ║
╚══════════════════════════════════════════════════════════╝

  Technical Debt: 23 items
  ════════════════════════════════════════
  🔴 CRITICAL  ████                    3
  🟠 HIGH      ████████                8
  🟡 MEDIUM    ████████████           12

  Top 3 actions:
  1. /triad:audit token_handler    (score 0.86 → needs 0.9)
  2. Add test for [TKN-B3]         (EARS in spec+code, no test)
  3. /triad:resume auth_system     (Cycle 2 at 78%)
```

**Webapp dashboard muestra deuda como gráfico:**
- Barra de deuda por epic (stacked: critical/high/medium)
- Debt trend over time (si el indexer corre periódicamente)
- Click en un item → navega al módulo/skill con el problema

### 12.5. Relación con AGENTS.md

AGENTS.md sigue teniendo §Deuda Técnica pero **solo para deuda de proceso** — convenciones, decisiones pendientes, patrones que cambiar. La deuda de **código/specs/triada** se elimina de AGENTS.md y se computa por el indexer.

| Tipo | Dónde vive | Quién lo mantiene |
|:-----|:-----------|:------------------|
| Deuda de proceso | AGENTS.md §Deuda | Humano/agente (manual) |
| Deuda de triada | Computado por indexer | Automático (reindex) |
| Deuda de skills | Computado por indexer + skill_auditor | Automático |
| Deuda de epics | Computado por indexer (cycle progress) | Automático |

### 12.6. Cuándo se computa

La deuda se recalcula cada vez que el indexer corre:

```
/triad:init         → full debt scan (una vez)
/triad:web          → debt summary en dashboard
/triad:status       → debt summary en terminal
git pre-commit      → incremental (solo módulos cambiados)
/triad:audit        → actualiza score/findings → debt recalculated
/triad:checkpoint   → actualiza progress → debt recalculated
```

No hay cron ni daemon. El indexer corre bajo demanda y la deuda se computa como side-effect de la indexación.

---

## 13. Preguntas abiertas (incluyendo deuda)

- ¿El reindexer debe correr como parte de `generate-data.ts` o como script separado que se llama antes?
- ¿La cola de Capa 2 debe persistirse en disco (`.triad/cache/extractions/`) o en MIE?
- ¿Qué modelo usar para extracciones? haiku (rápido, barato) vs sonnet (más preciso)?
- ¿Cómo manejar extracciones fallidas? retry con backoff? marcar como "extraction_failed"?
- ¿CIE/MIE se instalan como prerequisito de `/triad:init` o son opcionales que se detectan en runtime?
- ¿El call graph de CIE alimenta edges.json directamente o genera un edges-computed.json separado que se merge?
- ¿MIE reemplaza completamente claude -p para extracciones repetidas, o claude -p sigue siendo fallback?
- ¿La debt summary se incluye en state.json global o en un archivo separado `.triad/debt.json`?
- ¿El debt trend (evolución en el tiempo) se persiste? ¿Dónde? (git history de state.json vs archivo de métricas)
- ¿Los items de deuda tienen un ID estable para tracking? (ej: `debt:token_handler:ears_no_test:TKN-B3`)
- ¿La webapp muestra deuda como tab separado o integrado en cada módulo/epic view?

## 14. Contexto del monorepo

El monorepo tiene **487 specs** en blueprints, 13 packages, 47 epics (19 completed, 4 active, 3 paused, 17 proposals, 4 absorbed). Los specs siguen el formato Triad (EARS). Los packages incluyen: core, cli, saas-api, saas-web, saas-worker, mcp-server, agents (5), e2e, skill_gitgov.

Nota: blueprints se reorganizará: `03_products/epics` → `06_epics`, `03_products` → `05_packages` (según blueprints/README.md).

El indexer debe funcionar tanto para Triad standalone (specs en `specs/` del proyecto) como para el monorepo GitGov (specs en `blueprints/03_products/{pkg}/specs/`). La config `.triad/config.json → specsDir` ya soporta paths custom.

---

**Fecha:** 2026-04-08
**Origen:** Sesión triad_web, discusión sobre "cómo se actualizan los json", "debería ser invisible", y "un sistema con vida propia"
**Dependencias:** triad_web (generate-data.ts), skill_e2e_auditor (claude -p pattern + helpers), state_machine (hooks)
**Incluye:** §12 Deuda Técnica como View Computado — la deuda no necesita sistema propio, el indexer la calcula de los datos que ya produce
