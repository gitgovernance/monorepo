# Triad Web — Implementation Plan

> Documento tecnico: arquitectura, tipos, scripts, componentes, configuracion y tests.
> Para vision y arquitectura ver inputs/epic_input.md.
> Para contexto de conversacion ver inputs/conversation_context.md.
> Fecha: 2026-04-07

---

## 1. Arquitectura

### 1.1. Estructura de Archivos

Todo el codigo de la webapp vive en el directorio del plugin. Los datos generados
en runtime (`state.json`) son transitorios y gitignored.

```
packages/claude-plugins/plugins/triad/
├── web/                           ← NUEVO: Vite + React app
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── scripts/
│   │   └── generate-data.ts      ← lee .triad/ → genera state.json
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx               ← sidebar + routing + page switching
│   │   ├── data/
│   │   │   └── state.json        ← generado, gitignored
│   │   ├── types/
│   │   │   └── index.ts          ← TriadWebData, EpicData, ModuleData, GraphNode, GraphEdge
│   │   ├── hooks/
│   │   │   └── useTriadState.ts  ← lee state.json, optional polling
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── TopBar.tsx
│   │   │   ├── StatCard.tsx
│   │   │   ├── EpicCard.tsx
│   │   │   ├── ModuleTable.tsx
│   │   │   ├── TriadTriangle.tsx ← SVG triangle: Spec/Code/Tests
│   │   │   ├── StatePipeline.tsx ← horizontal state machine pipeline
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── ProvenanceFeed.tsx
│   │   └── pages/
│   │       ├── Dashboard.tsx
│   │       ├── Epics.tsx
│   │       ├── Modules.tsx
│   │       └── Graph.tsx
│   └── dist/                     ← build output, gitignored
├── skills/
│   └── web/
│       └── SKILL.md              ← /triad:web
└── index.html                    ← mockup reference (not served)
```

### 1.2. Flujo de Datos

```
                    ┌──────────────────────────────────┐
                    │   .triad/state.json               │
                    │   (indice global de epics)        │
                    └────────┬─────────────────────────┘
                             │
                             ▼
┌─────────────────┐   ┌──────────────────────────────┐   ┌──────────────────┐
│ .triad/state/   │──▶│  generate-data.ts             │◀──│ specs/epics/*/   │
│ {epic}/*.json   │   │  (lee state + markdowns,      │   │ roadmap.md       │
│ (module states) │   │   genera web/src/data/         │   │ (cycles, tasks)  │
│                 │   │   state.json)                  │   │                  │
└─────────────────┘   └──────────────┬─────────────────┘   └──────────────────┘
                                     │
                                     ▼
                    ┌──────────────────────────────────┐
                    │   web/src/data/state.json         │
                    │   (TriadWebData — todo unificado) │
                    └────────┬─────────────────────────┘
                             │ import / fetch
                             ▼
                    ┌──────────────────────────────────┐
                    │   useTriadState.ts                │
                    │   (hook React, optional polling)  │
                    └────────┬─────────────────────────┘
                             │ data
                             ▼
              ┌──────────────┴──────────────┐
              │  React Pages + Components    │
              │  Dashboard, Epics, Modules,  │
              │  Graph                       │
              └─────────────────────────────┘
```

### 1.3. Reactividad

**Dev mode (vite dev):**
- PostToolUse hook de Claude Code detecta write a `.triad/state/`
- Re-ejecuta `generate-data.ts`
- Vite HMR detecta cambio en `state.json`
- Browser se actualiza automaticamente (zero latency)

**Build mode (vite preview):**
- Polling cada 3 segundos desde `useTriadState.ts`
- Re-fetch de `state.json`, React re-renders si los datos cambiaron
- Alternativa: re-run `generate-data.ts` + refresh manual

---

## 2. Dependencias

### 2.1. Dependencias de Sistema

| Herramienta  | Version  | Proposito                                |
|--------------|----------|------------------------------------------|
| `node`       | >=18     | Runtime de scripts y build               |
| `vite`       | 6.x      | Build tool (dev server + bundler)        |
| `react`      | 19.x     | UI framework                             |
| `typescript` | 5.8      | Type safety                              |
| `d3`         | 7.x      | Graph visualization (Cycle 3)            |
| `tsx`        | latest   | Ejecutar generate-data.ts directamente   |

**Sin:** Next.js, SSR, backend server, base de datos, websockets, Tailwind.

### 2.2. Dependencias Internas

| Componente                        | Relacion     | Proposito                                       |
|-----------------------------------|--------------|--------------------------------------------------|
| `.triad/state.json`              | Fuente datos | Indice global de epics (leido por generate-data) |
| `.triad/state/{epic}/*.json`     | Fuente datos | Estado per-module (leido por generate-data)      |
| `specs/epics/*/roadmap.md`       | Fuente datos | Cycles, tasks, progress (parseado)               |
| `triad_state_machine` (Cycle 5)  | Prerequisito | `getEpicSummary()` y `/triad:init`              |
| `index.html` (mockup)            | Referencia   | Diseño visual de 12 paginas                      |

### 2.3. package.json

```json
{
  "name": "@triad/web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "generate": "tsx scripts/generate-data.ts"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "~5.8.0",
    "vite": "^6.0.0",
    "tsx": "^4.0.0",
    "d3": "^7.0.0",
    "@types/d3": "^7.0.0"
  }
}
```

---

## 3. Types

### 3.1. TypeScript Types (`src/types/index.ts`)

```typescript
// types/index.ts — Data model for Triad Web dashboard

interface TriadWebData {
  generatedAt: string;
  projectRoot: string;
  epics: EpicData[];
  modules: ModuleData[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
}

interface EpicData {
  name: string;
  status: 'proposal' | 'active' | 'paused' | 'completed' | 'discarded';
  phase: 'design' | 'ready' | 'impl' | 'complete';
  packages: string[];
  activeCycle: number;
  modules: { total: number; byState: Record<string, number> };
  lastUpdate: string | null;
  // From roadmap.md parsing (if available):
  description?: string;
  cycles?: CycleData[];
  score?: number;
  progress?: number; // 0-100 computed from tasks
}

interface CycleData {
  number: number;
  name: string;
  status: 'completed' | 'in_progress' | 'pending';
  tasksTotal: number;
  tasksCompleted: number;
  modules?: string[];
}

interface ModuleData {
  name: string;
  epic: string;
  state: 'no_spec' | 'spec_draft' | 'spec_ready' | 'implemented' | 'tested' | 'coherent' | 'drift';
  codePath: string;
  specPath: string;
  cycle: number;
  package: string; // derived from codePath
  ears?: number; // from spec parsing if available
  tests?: number; // from test file counting if available
  score: number | null; // from lastAudit.score (0-1 scale, display as 0-100)
  lastAudit?: { verdict: string; score: number; findings: number; ts: string };
  history: { from: string; to: string; trigger: string; ts: string; score?: number }[];
}

interface GraphNode {
  id: string;
  name: string;
  type: string; // ActorRecord, TaskRecord, etc.
  detail: Record<string, any>;
}

interface GraphEdge {
  source: string;
  target: string;
  rel: string;
}
```

### 3.2. State Enum Mapping

Los 7 estados de modulo vienen de `triad_state_machine`:

| Estado        | Significado                                               | Color (display) |
|---------------|-----------------------------------------------------------|-----------------|
| `no_spec`     | Modulo registrado, sin spec                               | zinc-600        |
| `spec_draft`  | Spec existe, no auditada                                  | amber-600       |
| `spec_ready`  | Spec auditada y aprobada (score >= 7.0)                   | blue-500        |
| `implemented` | Codigo escrito que implementa la spec                     | indigo-500      |
| `tested`      | Tests escritos y pasando                                  | purple-500      |
| `coherent`    | Triada completa: spec + codigo + tests (score >= 9.0)     | emerald-500     |
| `drift`       | Desincronizacion detectada post-coherent                  | red-500         |

### 3.3. Epic Status Enum

| Status      | Significado                        |
|-------------|------------------------------------|
| `proposal`  | Epic creada, aun no iniciada       |
| `active`    | Trabajo en progreso                |
| `paused`    | Detenida temporalmente             |
| `completed` | Todos los cycles completados       |
| `discarded` | Abandonada                         |

---

## 4. Implementacion: `generate-data.ts`

### 4.1. Proposito

Script TypeScript que lee `.triad/` y markdowns del proyecto, y genera un unico
archivo `state.json` que la webapp consume. Es el puente entre los state files
del filesystem y la SPA React.

### 4.2. Interfaz

```
# Uso
npx tsx scripts/generate-data.ts [projectRoot]

# Parametros
projectRoot  — Path al directorio raiz del proyecto (default: process.cwd())

# Output
Escribe: web/src/data/state.json
Stdout:  "Generated: {path} ({N} epics, {M} modules)"

# Exit codes
0 — Exito
1 — .triad/state.json no existe (sugiere /triad:init)
```

### 4.3. Pseudocodigo

```typescript
// scripts/generate-data.ts
// Usage: npx tsx scripts/generate-data.ts [projectRoot]

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';

const projectRoot = process.argv[2] || process.cwd();

function main() {
  // 1. Validar que .triad/ existe
  const stateJsonPath = join(projectRoot, '.triad/state.json');
  if (!existsSync(stateJsonPath)) {
    console.error('No .triad/state.json found. Run /triad:init first.');
    process.exit(1);
  }

  // 2. Leer indice global
  const registry = JSON.parse(readFileSync(stateJsonPath, 'utf-8'));
  const epics: EpicData[] = [];
  const modules: ModuleData[] = [];

  // 3. Iterar epics del registry
  for (const [epicName, entry] of Object.entries(registry.epics)) {
    // 3a. Leer module state files del stateDir
    const stateDir = join(projectRoot, entry.stateDir);
    const epicModules = readModuleStates(stateDir, epicName);
    modules.push(...epicModules);

    // 3b. Construir resumen del epic
    epics.push({
      name: epicName,
      status: entry.status,
      phase: entry.phase,
      packages: entry.packages,
      activeCycle: entry.activeCycle,
      modules: summarizeModules(epicModules),
      lastUpdate: getLastUpdate(epicModules),
      // 3c. Parsear roadmap.md para datos enriquecidos (cycles, tasks, progress)
      ...parseRoadmap(projectRoot, epicName),
    });
  }

  // 4. Construir grafo de relaciones
  const graph = buildGraph(epics, modules);

  // 5. Ensamblar y escribir output
  const data: TriadWebData = {
    generatedAt: new Date().toISOString(),
    projectRoot,
    epics,
    modules,
    graph,
  };

  const outputPath = join(__dirname, '../src/data/state.json');
  writeFileSync(outputPath, JSON.stringify(data, null, 2));
  console.log(`Generated: ${outputPath} (${epics.length} epics, ${modules.length} modules)`);
}

// --- Helper functions ---

function readModuleStates(stateDir: string, epicName: string): ModuleData[] {
  // Lee todos los .json de stateDir
  // Parsea cada uno como ModuleStateFile
  // Convierte a ModuleData (agrega package derivado de codePath)
  // Retorna array de ModuleData
}

function summarizeModules(modules: ModuleData[]): { total: number; byState: Record<string, number> } {
  // Cuenta modulos por estado
  // Retorna { total: N, byState: { no_spec: 1, coherent: 3, ... } }
}

function getLastUpdate(modules: ModuleData[]): string | null {
  // Encuentra el timestamp mas reciente de todas las historias
  // Retorna ISO string o null si no hay transiciones
}

function parseRoadmap(projectRoot: string, epicName: string): Partial<EpicData> {
  // Busca specs/epics/{epicName}/roadmap.md
  // Parsea cycles (headers ## Cycle N: Name)
  // Parsea tasks (checkboxes - [ ] / - [x])
  // Computa progress: (completedTasks / totalTasks) * 100
  // Retorna { description, cycles, score, progress }
}

function buildGraph(epics: EpicData[], modules: ModuleData[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // Nodos: cada epic + cada modulo
  // Edges: epic → modulo (pertenencia), modulo → modulo (dependencias futuras)
  // Retorna { nodes, edges }
}

main();
```

### 4.4. Fuentes de Datos

| Dato                  | Fuente                             | Disponibilidad |
|-----------------------|------------------------------------|----------------|
| Epic status/phase     | `.triad/state.json`                | Siempre        |
| Module state/history  | `.triad/state/{epic}/*.json`       | Siempre        |
| Module lastAudit      | `.triad/state/{epic}/*.json`       | Si auditado    |
| Cycle names/counts    | `specs/epics/*/roadmap.md`         | Si existe      |
| Task checkboxes       | `specs/epics/*/roadmap.md`         | Si existe      |
| EARS count            | `specs/modules/*/spec.md`          | Si existe      |
| Test count            | Conteo de `*.test.ts` en codePath  | Si existe      |

---

## 5. Configuracion Vite

### 5.1. `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyDirFirst: true,
  },
  server: {
    port: 4173,
    open: true,
  },
});
```

### 5.2. `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

### 5.3. `index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TRIAD</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

---

## 6. Componentes

### 6.1. `App.tsx` — Layout + Routing

Componente raiz. Sidebar fija a la izquierda, contenido principal a la derecha.
Routing via estado local (`activePage`), sin React Router (como el mockup).

```typescript
// App.tsx
type Page = 'dashboard' | 'epics' | 'modules' | 'graph';

function App() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const data = useTriadState();

  return (
    <div className="app-layout">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="main-content">
        <TopBar />
        {activePage === 'dashboard' && <Dashboard data={data} />}
        {activePage === 'epics' && <Epics data={data} />}
        {activePage === 'modules' && <Modules data={data} />}
        {activePage === 'graph' && <Graph data={data} />}
      </main>
    </div>
  );
}
```

### 6.2. `Sidebar.tsx`

Fixed 240px left panel.

| Elemento            | Detalle                                               |
|---------------------|-------------------------------------------------------|
| Logo                | SVG triangle + "TRIAD" en JetBrains Mono              |
| Nav items           | DASHBOARD, EPICS, MODULES, GRAPH                      |
| Active indicator    | Gold (#eab308) left border + text highlight            |
| Bottom section      | Org name + plan badge (si disponible)                  |
| Background          | `#0f0f0f` (ligeramente mas claro que body)             |

### 6.3. `TopBar.tsx`

Barra superior del contenido principal.

| Elemento     | Detalle                                              |
|--------------|------------------------------------------------------|
| Page title   | Nombre de la pagina activa, Inter semibold            |
| Breadcrumb   | Opcional, para sub-navegacion futura                  |
| Actions      | Refresh button (re-run generate-data)                 |
| Background   | Transparente, border-bottom zinc-800                  |

### 6.4. `StatCard.tsx`

Tarjeta de metrica individual usada en Dashboard.

| Prop       | Tipo             | Ejemplo             |
|------------|------------------|---------------------|
| `label`    | `string`         | "Total Modules"     |
| `value`    | `string | number`| "42"                |
| `subtext`  | `string?`        | "+3 this week"      |
| `accent`   | `boolean?`       | Gold border si true |

Estilo: fondo `#161616`, borde `#27272a`, padding 24px, JetBrains Mono para value.

### 6.5. `EpicCard.tsx`

Tarjeta de epic usada en la pagina Epics.

| Prop       | Tipo       | Detalle                                   |
|------------|------------|-------------------------------------------|
| `epic`     | `EpicData` | Datos completos del epic                  |
| `expanded` | `boolean`  | Si true, muestra cycles + module list     |
| `onToggle` | `() => void` | Toggle expansion                       |

Contenido:
- **Header:** Nombre del epic (gold), status badge, phase badge
- **Body:** Description (si disponible), package tags, ProgressBar
- **Footer:** Cycle activo, score, last activity timestamp
- **Expanded:** Lista de CycleData con checkboxes, lista de modulos del epic

### 6.6. `ModuleTable.tsx`

Tabla de modulos agrupada por package.

| Columna      | Fuente                 | Formato                  |
|--------------|------------------------|--------------------------|
| MODULE       | `module.name`          | monospace                |
| PACKAGE      | `module.package`       | badge                    |
| STATE        | `module.state`         | badge coloreado          |
| EARS         | `module.ears`          | numero o "—"             |
| SCORE        | `module.score`         | 0-100 o "—"             |
| LAST AUDIT   | `module.lastAudit.ts`  | relative timestamp       |

Agrupacion: secciones colapsables por `module.package`.
Header de seccion: package name, module count, % coherent, avg score.

### 6.7. `TriadTriangle.tsx`

Componente SVG que visualiza la triada Spec/Code/Tests de un modulo.

```
          SPEC
         /    \
        / EARS \
       /  IDs   \
      /    ▼     \
   CODE ——————— TESTS
```

| Vertice       | Dato              | Posicion     |
|---------------|-------------------|--------------|
| Spec (top)    | EARS count        | Centro-arriba|
| Code (bottom-left)  | Refs count  | Izquierda    |
| Tests (bottom-right) | Tests count | Derecha      |

| Linea           | Color                                  |
|-----------------|----------------------------------------|
| Spec → Code     | Verde si EARS implementados, rojo si gap|
| Spec → Tests    | Verde si EARS testeados, rojo si gap   |
| Code → Tests    | Verde si tests pasan, rojo si gap      |

Centro: Score numerico (0-100). Finding callout si hay gaps.

### 6.8. `StatePipeline.tsx`

Pipeline horizontal mostrando la maquina de estados con conteos.

```
[no_spec: 2] → [spec_draft: 3] → [spec_ready: 5] → [implemented: 8] → [tested: 4] → [coherent: 12]
```

Cada nodo: badge con estado + count. Nodo activo (con modulos) mas grande.
Flechas entre nodos. Colores segun la tabla 3.2.

### 6.9. `ProgressBar.tsx`

Barra de progreso reutilizable.

| Prop       | Tipo     | Detalle                          |
|------------|----------|----------------------------------|
| `value`    | `number` | 0-100                            |
| `label`    | `string?`| Texto a la izquierda             |
| `showPct`  | `boolean`| Mostrar porcentaje a la derecha  |

Estilo: fondo `#27272a`, fill gold (`#eab308`), height 6px, border-radius 3px.

### 6.10. `Badge.tsx`

Badge/tag reutilizable.

| Prop      | Tipo     | Detalle                  |
|-----------|----------|--------------------------|
| `text`    | `string` | Contenido                |
| `variant` | `string` | Determina color de fondo |

Variantes predefinidas para cada estado de modulo y status de epic.

### 6.11. `ProvenanceFeed.tsx`

Feed de las ultimas N transiciones de estado.

Cada entrada:
- Timestamp (relative: "2h ago")
- Module name (monospace)
- Transicion: `from` → `to` con badges coloreados
- Trigger (skill:audit, hook:detect, etc.)

Ordenado por timestamp descendente. Default: ultimas 20 transiciones.

---

## 7. Paginas

### 7.1. `Dashboard.tsx` (Cycle 1)

Pagina principal con vision general del proyecto.

**Layout:**

```
┌─────────────────────────────────────────────────────────┐
│  Stats Row (4x StatCard)                                │
│  [Epics] [Modules] [Coherent %] [Avg Score]            │
├─────────────────────────────────────────────────────────┤
│  Epic Progress                    │  State Pipeline      │
│  (lista de epics con ProgressBar) │  (StatePipeline)     │
├─────────────────────────────────────────────────────────┤
│  Provenance Feed (ultimas 20 transiciones)              │
└─────────────────────────────────────────────────────────┘
```

**Stats row:**

| Card           | Value                                      | Subtext                  |
|----------------|--------------------------------------------|--------------------------|
| Epics          | `data.epics.length`                        | `N active`               |
| Modules        | `data.modules.length`                      | `N by state breakdown`   |
| Coherent %     | `(coherent / total) * 100`                 | `vs last week`           |
| Avg Score      | Promedio de `module.score` (no null)        | `N audited`              |

### 7.2. `Epics.tsx` (Cycle 2)

Grid de EpicCard components (2 columnas).

**Comportamiento:**
- Cada card clickeable para expandir/colapsar
- Expansion muestra: roadmap cycles con checkboxes, module list con estado
- Filtro por status (all, active, completed, proposal)
- Sort por: name, progress, lastUpdate

### 7.3. `Modules.tsx` (Cycle 2)

ModuleTable agrupada por package.

**Comportamiento:**
- Secciones colapsables por package
- Click en modulo muestra panel lateral con:
  - TriadTriangle (visualizacion)
  - History timeline (transiciones)
  - Last audit details
- Filtro por state, package, epic
- Sort por: name, state, score, lastAudit

### 7.4. `Graph.tsx` (Cycle 3)

Grafo D3 force-directed como componente React.

**Nodos:**
- Epics: nodos grandes, gold border
- Modules: nodos medianos, color segun estado
- Dependencies: nodos pequenos, gris

**Edges:**
- Epic → Module: pertenencia (solido)
- Module → Module: dependencia (dashed, futuro)

**Controles:**
- Zoom + pan
- Layer toggles: epics, modules, dependencies
- Search: highlight nodo por nombre
- Click nodo: tooltip con detalle

Mismo estilo visual que el mockup `index.html` graph page.

---

## 8. Hook: `useTriadState.ts`

```typescript
// hooks/useTriadState.ts

import { useState, useEffect } from 'react';
import type { TriadWebData } from '../types';

export function useTriadState(pollInterval?: number): TriadWebData | null {
  const [data, setData] = useState<TriadWebData | null>(null);

  useEffect(() => {
    // Initial load
    fetch('/src/data/state.json')
      .then(res => res.json())
      .then(setData)
      .catch(console.error);

    // Optional polling (build mode)
    if (pollInterval && pollInterval > 0) {
      const interval = setInterval(() => {
        fetch('/src/data/state.json')
          .then(res => res.json())
          .then(newData => {
            // Only update if data changed (compare generatedAt)
            setData(prev =>
              prev?.generatedAt !== newData.generatedAt ? newData : prev
            );
          })
          .catch(console.error);
      }, pollInterval);
      return () => clearInterval(interval);
    }
  }, [pollInterval]);

  return data;
}
```

**Notas:**
- En dev mode (`vite dev`), Vite HMR re-importa `state.json` automaticamente — no necesita polling.
- En build mode (`vite preview`), se activa polling con `useTriadState(3000)`.
- El hook compara `generatedAt` para evitar re-renders innecesarios.
- Futura migracion SaaS: reemplazar fetch por `triad.getEpics()` via tRPC.

---

## 9. CSS/Styling

### 9.1. Approach

CSS custom properties en archivo global. Sin Tailwind, sin CSS-in-JS.
Esto da control total sobre el brand guide y produce CSS minimo.

### 9.2. Brand Guide Variables

```css
/* src/styles/global.css */

:root {
  /* Backgrounds */
  --bg-primary: #0a0a0a;
  --bg-secondary: #0f0f0f;
  --bg-card: #161616;
  --bg-hover: #1a1a1a;

  /* Borders */
  --border-default: #27272a;
  --border-hover: #3f3f46;

  /* Text */
  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;

  /* Accent (gold — sparingly) */
  --accent-gold: #eab308;
  --accent-gold-dim: #a16207;

  /* State colors (for badges and indicators) */
  --state-no-spec: #52525b;
  --state-spec-draft: #d97706;
  --state-spec-ready: #3b82f6;
  --state-implemented: #6366f1;
  --state-tested: #a855f7;
  --state-coherent: #10b981;
  --state-drift: #ef4444;

  /* Typography */
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
```

### 9.3. Reglas de Estilo

| Regla                      | Aplicacion                                    |
|----------------------------|-----------------------------------------------|
| Sin shadows                | Ningun `box-shadow` en toda la app             |
| Sin gradients              | Ningun `linear-gradient` ni `radial-gradient`  |
| Gold solo para acentos     | Active nav, selected items, key metrics        |
| JetBrains Mono para datos  | Numeros, scores, module names, timestamps      |
| Inter para texto           | Labels, descriptions, paragraphs               |
| Dark mode unico            | No hay light mode, no hay toggle               |

---

## 10. Skill: `/triad:web`

### 10.1. SKILL.md Spec

```markdown
# /triad:web — Launch Triad Web Dashboard

## Trigger
User types `/triad:web` or asks to "see the dashboard" / "open triad web"

## Steps

1. **Verify .triad/ exists**
   - Check `${PROJECT_ROOT}/.triad/state.json`
   - If missing: "No .triad/ found. Run `/triad:init` to initialize state tracking."
   - Exit

2. **Generate data**
   - Run: `npx tsx packages/claude-plugins/plugins/triad/web/scripts/generate-data.ts $(pwd)`
   - Verify output: `web/src/data/state.json` created
   - Report: "{N} epics, {M} modules loaded"

3. **Build if needed**
   - If `web/dist/` does not exist: run `cd web && npm run build`
   - If exists: skip (use cached build)

4. **Serve and open**
   - Run: `cd web && npx vite preview`
   - Open: `http://localhost:4173`
   - Report: "Dashboard running at http://localhost:4173"

## Rules
- Read-only: never modify .triad/ state files
- Never modify source code
- If generate-data.ts fails, report the error and suggest fixes
```

### 10.2. Opciones

| Flag         | Detalle                                        |
|--------------|------------------------------------------------|
| `--dev`      | Usa `vite dev` en vez de `vite preview`        |
| `--no-open`  | No abre el browser automaticamente             |
| `--port N`   | Puerto alternativo (default: 4173)             |
| `--refresh`  | Force re-run de generate-data.ts               |

---

## 11. Estrategia de Tests

### 11.1. `generate-data.ts` — Unit Tests

```typescript
// scripts/__tests__/generate-data.test.ts

describe('generate-data', () => {
  // Setup: crear directorio .triad/ temporal con datos mock

  it('should fail if .triad/state.json does not exist', () => {
    // Verificar exit code 1 y mensaje de error
  });

  it('should read epic registry and produce TriadWebData', () => {
    // Seed: state.json con 2 epics
    // Seed: state/{epic}/module.json con 3 modulos
    // Run generate-data.ts
    // Assert: output contiene 2 epics, 3 modules
  });

  it('should parse roadmap.md for cycle data', () => {
    // Seed: roadmap.md con 3 cycles, 10 tasks (6 completadas)
    // Run generate-data.ts
    // Assert: epic.cycles.length === 3, epic.progress === 60
  });

  it('should compute module byState summary', () => {
    // Seed: 5 modulos en estados variados
    // Assert: epic.modules.byState matches expected counts
  });

  it('should build graph with correct nodes and edges', () => {
    // Seed: 2 epics, 4 modulos
    // Assert: graph.nodes.length === 6 (2 epics + 4 modulos)
    // Assert: graph.edges.length === 4 (epic→module)
  });

  it('should handle missing roadmap.md gracefully', () => {
    // Seed: epic sin roadmap.md
    // Assert: epic.cycles === undefined, epic.progress === undefined
  });

  it('should derive package from codePath', () => {
    // Seed: module con codePath "packages/core/src/auth/"
    // Assert: module.package === "packages/core"
  });
});
```

### 11.2. Components — Visual Review

No unit tests para componentes React individuales en Cycle 1.
Validacion visual contra el mockup `index.html`:

| Componente       | Validacion                                      |
|------------------|-------------------------------------------------|
| Sidebar          | Matches mockup nav layout, gold active state    |
| StatCard         | Correct font (JetBrains Mono), no shadows       |
| EpicCard         | Gold name, badges, progress bar                 |
| ModuleTable      | Grouped by package, correct state colors        |
| TriadTriangle    | SVG renders correctly, green/red lines          |
| StatePipeline    | All 7 states shown, counts match data           |
| ProvenanceFeed   | Chronological order, relative timestamps        |

### 11.3. E2E — Skill Integration

```typescript
// __tests__/e2e/triad-web.test.ts

describe('/triad:web E2E', () => {
  it('should launch and serve dashboard with mock data', () => {
    // 1. Create temp project with .triad/ mock data
    // 2. Run generate-data.ts
    // 3. Run vite build
    // 4. Run vite preview
    // 5. Fetch http://localhost:4173
    // 6. Assert: HTML contains <div id="root">
    // 7. Cleanup: kill server, remove temp dir
  });

  it('should show correct epic count on dashboard', () => {
    // Seed: 3 epics
    // Assert: StatCard shows "3"
  });

  it('should show correct module states in pipeline', () => {
    // Seed: known distribution of states
    // Assert: StatePipeline counts match
  });
});
```

### 11.4. Ciclo de Validacion

```
1. tsc --noEmit                    ← tipos correctos
2. vitest run scripts/             ← generate-data.ts unit tests
3. vite build                      ← build compila sin errores
4. Comparacion visual vs mockup    ← screenshot comparison
5. E2E con mock .triad/            ← skill integration
```

---

## 12. Decisiones de Implementacion

| #  | Decision                          | Elegido                | Alternativa rechazada         | Razon                                              |
|----|-----------------------------------|------------------------|-------------------------------|-----------------------------------------------------|
| D1 | Framework CSS                     | CSS custom properties  | Tailwind 4.x                  | Control total del brand guide, menos dependencias    |
| D2 | Router                            | Estado local (`useState`) | React Router              | Sin deep linking necesario, igual que el mockup     |
| D3 | Build output                      | `dist/` gitignored     | Commiteado                    | Se genera en install, reduce repo size               |
| D4 | generate-data.ts lenguaje         | TypeScript (tsx)       | Bash script                   | Type-safe, reutiliza tipos de state_schema           |
| D5 | Polling interval (build mode)     | 3 segundos             | 10s, manual refresh           | Balance entre responsividad y load                   |
| D6 | Graph library (Cycle 3)           | D3.js                  | vis.js, react-flow            | Ya probado en mockup, maximo control                 |
| D7 | Data fetch en SPA                 | Import JSON directo    | REST API                      | No necesita server, Vite resuelve el import          |

---

## 13. Ciclos de Implementacion

### Cycle 1: Foundation + Dashboard

**Deliverables:**
- [ ] Scaffold: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- [ ] Types: `src/types/index.ts` completo
- [ ] Script: `generate-data.ts` funcional con unit tests
- [ ] Hook: `useTriadState.ts`
- [ ] CSS: `global.css` con todas las variables del brand guide
- [ ] Layout: `App.tsx`, `Sidebar.tsx`, `TopBar.tsx`
- [ ] Components: `StatCard.tsx`, `ProgressBar.tsx`, `Badge.tsx`, `StatePipeline.tsx`, `ProvenanceFeed.tsx`
- [ ] Page: `Dashboard.tsx` con datos reales
- [ ] Skill: `SKILL.md` para `/triad:web`

**Criterio de exito:** `/triad:web` levanta el dashboard con datos de `.triad/` del monorepo.

### Cycle 2: Epics + Modules

**Deliverables:**
- [ ] Component: `EpicCard.tsx` con expansion
- [ ] Page: `Epics.tsx` con grid + filtros
- [ ] Component: `ModuleTable.tsx` agrupada por package
- [ ] Component: `TriadTriangle.tsx` SVG
- [ ] Page: `Modules.tsx` con panel lateral

**Criterio de exito:** Navegacion completa Dashboard → Epics → Modules con datos reales.

### Cycle 3: Graph + Polish

**Deliverables:**
- [ ] Component: D3 Graph con force layout
- [ ] Page: `Graph.tsx` con controles
- [ ] E2E tests completos
- [ ] Performance: lazy load de paginas
- [ ] Polish: transiciones, loading states, empty states

**Criterio de exito:** Las 4 paginas funcionales, E2E green, visual match con mockup.

---

## 14. Exclusiones

Fuera del scope de esta epic:

- Version SaaS (eso es `triad_protocol_bridge` epic futura)
- Websockets/SSE (polling es suficiente para local)
- Paginas: Audit, Agents, Marketplace, Settings (dependen de `.gitgov/` records)
- Binario `triad` standalone (el skill `/triad:web` es suficiente)
- Light mode (dark mode unico)
- Migracion del mockup `index.html` (queda como referencia, no se sirve)
- Internacionalizacion (single language: English)
