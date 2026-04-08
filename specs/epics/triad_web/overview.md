# triad_web — Epic Overview

> **CONTEXTO PARA AGENTES:** Este documento es la vision ejecutiva del epic
> (arquitectura, decisiones, "que" y "por que"). Para detalles tecnicos ver
> `implementation_plan.md`. **Para estado actual del trabajo ver
> [`roadmap.md`](./roadmap.md)** (fuente de verdad unica del progreso).

---

## Vision

**Triad Web** es una SPA local (Vite + React) que lee `.triad/state/` y visualiza Epics, Modules y Dashboard en el browser — sin dependencia SaaS, sin servidor externo, sin base de datos. El developer ejecuta `/triad:web` desde Claude Code, el skill genera un `state.json` desde los archivos de estado, levanta Vite y abre el browser.

El valor central es convertir datos que hoy solo existen como JSON files y output de terminal en una interfaz visual navegable. Los mismos componentes React migran despues al producto SaaS (GitGov Builder) cambiando unicamente el data layer.

### Origen del Epic

El state machine de Triad (epic `triad_state_machine`, Cycles 1-5 completados) genera datos ricos: estado de modulos, transiciones con timestamps, epic registry, audit scores, historial de provenance. Pero toda esa informacion solo es accesible via:

1. **Archivos JSON en `.triad/state/`** — hay que leerlos manualmente o con `jq`
2. **`/triad:status`** — output de texto en terminal, limitado a una tabla
3. **`/triad:resume`** — texto en terminal, una epic a la vez

Durante el diseno de `triad_state_machine` se construyo un mockup HTML de 12 paginas (11,000+ lineas) que demuestra como se veria el producto con datos reales. Ese mockup es la referencia visual, pero usa datos hardcoded y HTML monolitico no mantenible.

La pregunta fue: "como hacemos que esto funcione con datos reales, en local, sin depender del SaaS?" Esta epic es la respuesta.

### Que Problema Resuelve

```
ANTES (solo terminal + JSON):

  .triad/state/                         Developer
  ┌──────────────────────────┐          ┌─────────────────────────────────┐
  │ epic_a/                  │          │                                 │
  │   auth.json   (raw JSON) │          │ 1. cat .triad/state.json | jq   │
  │   backlog.json           │          │ 2. /triad:status (texto plano)  │
  │ epic_b/                  │          │ 3. /triad:resume (una epic)     │
  │   router.json            │          │ 4. No ve relaciones entre       │
  │   ...                    │          │    modulos ni progreso global   │
  └──────────────────────────┘          └─────────────────────────────────┘
           │                                        │
           ▼                                        ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ PROBLEMAS:                                                           │
  │ 1. Datos ricos pero accesibles solo como JSON crudo                  │
  │ 2. No hay vista de progreso global (multi-epic)                      │
  │ 3. No hay visualizacion de state machine transitions                 │
  │ 4. Stakeholders no pueden ver estado sin terminal                    │
  │ 5. Mockup existe pero es hardcoded (11k lineas, no mantenible)       │
  └──────────────────────────────────────────────────────────────────────┘

DESPUES (Triad Web):

  .triad/state/          generate-data.ts          Vite + React SPA
  ┌──────────────┐       ┌──────────────┐          ┌──────────────────────┐
  │ state.json   │ ────> │ Lee state/   │ ───────> │ Dashboard            │
  │ state/       │       │ Lee roadmaps │          │ ├── Epic progress    │
  │  epic/*.json │       │ Computa      │          │ ├── Module states    │
  └──────────────┘       │ summaries    │          │ └── Activity feed    │
                         │ Genera:      │          │                      │
  specs/epics/           │ state.json   │          │ Epics                │
  ┌──────────────┐       │ (consumible) │          │ ├── Cards + cycles   │
  │ roadmap.md   │ ────> │              │          │ ├── Tasks progress   │
  │ (N epics)    │       └──────────────┘          │ └── Module breakdown │
  └──────────────┘                                 │                      │
                                                   │ Modules              │
  /triad:web skill                                 │ ├── Table by state   │
  ┌──────────────────────────────────────┐         │ ├── Triad triangle   │
  │ 1. generate-data.ts $(pwd)           │         │ └── Score + history  │
  │ 2. vite preview (o vite dev)         │         │                      │
  │ 3. open http://localhost:4173        │         │ Graph (D3 force)     │
  └──────────────────────────────────────┘         └──────────────────────┘
```

### Que NO es

- **No es un producto SaaS** — es una herramienta local, sin internet, sin DB, sin server externo. La version SaaS es `triad_protocol_bridge` (epic futura)
- **No reemplaza `/triad:status`** — el CLI sigue siendo la forma rapida de consultar estado. La web es la forma visual de explorarlo
- **No es el dashboard completo de 12 paginas** — se construye incrementalmente: 3 paginas primero (Dashboard, Epics, Modules), el resto en cycles posteriores
- **No es una app server-rendered** — Vite build produce HTML+JS+CSS estaticos. No hay SSR, no hay Next.js, no hay backend
- **No modifica el state machine** — `generate-data.ts` es un lector puro. No extiende `state_manager`, no escribe a `.triad/state/`
- **No es el mockup migrado** — el mockup es la referencia visual. Los componentes React replican su apariencia con datos reales, no son una conversion linea-por-linea del HTML

---

## Target Persona

**Primary: Developer usando Triad con Claude Code**

- Trabaja en un monorepo con multiples epics activas
- Quiere VER el estado de su proyecto, no leerlo en JSON
- Pain: datos ricos generados por state machine + audits, pero sin forma de visualizarlos
- Contexto: ya usa `/triad:status` pero quiere mas detalle (history, graphs, cross-epic view)

**Secondary: Tech Lead / Product Owner revisando progreso**

- Quiere entender en que estado esta cada epic sin abrir terminal
- Necesita vista de progreso global (cycles completados, tasks pendientes, EARS coverage)
- Pain: hoy depende de que el developer le diga el estado

---

## Objetivos del Producto

1. **Skill `/triad:web` funcional** — un comando levanta la webapp con datos reales del proyecto
2. **Dashboard page** — vista global con epic progress, module states, activity feed
3. **Epics page** — cards por epic con cycles, tasks, EARS, module breakdown
4. **Modules page** — tabla de modulos agrupada por package con state, score, triad triangle
5. **Datos reales** — `generate-data.ts` lee `.triad/state/` + `roadmap.md` y genera JSON consumible
6. **Reactividad** — cambios en state files se reflejan en el browser (HMR en dev, polling en build)
7. **Componentes migrables** — los componentes React funcionan identicos en la version SaaS futura

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TRIAD WEB                                          │
│                           Local Dashboard SPA                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DATA SOURCES                          DATA PIPELINE                         │
│  ┌──────────────────────┐              ┌──────────────────────────────────┐  │
│  │ .triad/              │              │ generate-data.ts                  │  │
│  │ ├── state.json       │──── read ──> │                                  │  │
│  │ │   (epic registry)  │              │ 1. Read .triad/state.json        │  │
│  │ └── state/           │              │ 2. Read .triad/state/{epic}/*.json│ │
│  │     ├── epic_a/      │              │ 3. Parse specs/epics/*/roadmap.md│  │
│  │     │   ├── mod1.json│              │ 4. Compute summaries (cycles,    │  │
│  │     │   └── mod2.json│              │    tasks, EARS, scores)          │  │
│  │     └── epic_b/      │              │ 5. Write web/src/data/state.json │  │
│  │         └── mod3.json│              │                                  │  │
│  └──────────────────────┘              └──────────────────────────────────┘  │
│                                                       │                      │
│  specs/epics/                                         │ state.json           │
│  ┌──────────────────────┐                             │ (generated)          │
│  │ epic_a/roadmap.md    │──── parse ──────────────────┘                      │
│  │ epic_b/roadmap.md    │                             │                      │
│  └──────────────────────┘                             ▼                      │
│                                                                              │
│  FRONTEND (Vite + React)                                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │  useTriadState.ts ──── reads state.json ──── provides to components    │  │
│  │       │                                                                │  │
│  │       ├── Dashboard.tsx ─── EpicCard[] + ModuleTable + ActivityFeed    │  │
│  │       ├── Epics.tsx ─────── EpicCard (expanded) + CycleTimeline       │  │
│  │       ├── Modules.tsx ───── ModuleTable + TriadTriangle + ScoreCard   │  │
│  │       └── Graph.tsx ─────── D3 ForceGraph (nodes=modules, edges=deps) │  │
│  │                                                                        │  │
│  │  Layout: Sidebar (nav) + Header (org info) + Content (page)           │  │
│  │  Brand: Dark (#0a0a0a) + Gold (#eab308) + JetBrains Mono + Inter     │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  REACTIVITY                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │  DEV MODE (vite dev):                                                  │  │
│  │    PostToolUse hook ─> re-run generate-data.ts ─> Vite HMR ─> browser │  │
│  │    Latency: ~200ms (state change to visual update)                    │  │
│  │                                                                        │  │
│  │  BUILD MODE (vite preview):                                            │  │
│  │    Polling every 3s from browser ─> re-fetch state.json ─> re-render  │  │
│  │    Alternative: manual refresh after /triad:status                     │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  SKILL: /triad:web                                                           │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  1. Verify .triad/ exists (else suggest /triad:init)                   │  │
│  │  2. Run generate-data.ts $(pwd) → write state.json                    │  │
│  │  3. If no dist/: vite build                                            │  │
│  │  4. vite preview → serve on localhost:4173                             │  │
│  │  5. open browser                                                       │  │
│  │  Rule: read-only — never modify .triad/ or specs/                      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Componentes

| Componente | Responsabilidad | Ubicacion |
|---|---|---|
| `generate-data.ts` | Lee `.triad/state/` + `roadmap.md`, computa summaries, genera `state.json` consumible por la SPA | `web/scripts/` |
| `useTriadState.ts` | Hook React que lee `state.json`, provee datos a todos los componentes. Polling en build mode, import directo en dev mode | `web/src/hooks/` |
| `Dashboard.tsx` | Pagina principal: org score, epic progress bars, module state summary, activity feed reciente | `web/src/pages/` |
| `Epics.tsx` | Lista de epics como cards expandibles con cycles, tasks, EARS coverage, module breakdown | `web/src/pages/` |
| `Modules.tsx` | Tabla de modulos agrupada por package con state badge, triad score, triangle visualizer | `web/src/pages/` |
| `Graph.tsx` | D3 force-directed graph: nodos = modulos, edges = dependencias. Migrado del mockup | `web/src/pages/` |
| `EpicCard.tsx` | Componente reutilizable: nombre, status, phase, progress bar, cycle count, module breakdown | `web/src/components/` |
| `ModuleTable.tsx` | Tabla de modulos con sorting, filtering by state, grouping by package | `web/src/components/` |
| `TriadTriangle.tsx` | SVG triangle: spec (izquierda), code (derecha), tests (base). Color = completeness | `web/src/components/` |
| `StateGraph.tsx` | D3 force graph wrapper. Nodos coloreados por state, edges por relaciones | `web/src/components/` |
| `Sidebar.tsx` | Navegacion lateral: Dashboard, Epics, Modules, Graph. Dark theme, gold highlight activo | `web/src/components/` |
| `App.tsx` | Router + layout (sidebar + header + content area). State toggle o React Router | `web/src/` |
| `SKILL.md` | Spec del skill `/triad:web` para Claude Code skill runner | `skills/web/` |

---

## Modelo Funcional

### Data Flow

```
  .triad/state.json              generate-data.ts              React SPA
  .triad/state/{epic}/*.json     (Node.js script)              (Vite bundle)
  specs/epics/*/roadmap.md
         │                              │                            │
         │    1. READ                   │                            │
         │ ──────────────────────────>  │                            │
         │    - Parse epic registry     │                            │
         │    - Parse module states     │                            │
         │    - Parse roadmap markdowns │                            │
         │                              │                            │
         │                              │    2. COMPUTE              │
         │                              │    - EpicSummary[]         │
         │                              │    - ModuleSummary[]       │
         │                              │    - GraphData (nodes,     │
         │                              │      edges)                │
         │                              │                            │
         │                              │    3. WRITE                │
         │                              │ ──────────────────────>    │
         │                              │    web/src/data/state.json │
         │                              │                            │
         │                              │                            │    4. RENDER
         │                              │                            │    useTriadState()
         │                              │                            │    reads state.json
         │                              │                            │    provides to pages
```

### Dos versiones, mismos componentes

```
VERSION LOCAL (esta epic)                VERSION SAAS (epic futura)

  /triad:web                               gitgov.com/builder
       │                                        │
       ▼                                        ▼
  generate-data.ts                         tRPC API
  reads .triad/state/                      reads DB (projector)
  writes state.json                        returns EpicSummary[]
       │                                        │
       ▼                                        ▼
  useTriadState.ts                         useTriadState.ts
  import state.json                        triad.getEpics(repoId)
       │                                        │
       └──────────────┬─────────────────────────┘
                      │
                      ▼
              SHARED COMPONENTS
              EpicCard, ModuleTable,
              TriadTriangle, StateGraph,
              Sidebar, Layout...
```

Los componentes son puros (props in, JSX out). Lo unico que cambia entre local y SaaS es el hook de datos.

---

## Decisiones Arquitectonicas

### Decisiones Ya Tomadas

| ID | Decision | Resolucion | Razon |
|---|---|---|---|
| A1 | Framework frontend | Vite 6 + React 19 (no Next.js) | No necesita SSR para app local. Vite: dev server en 200ms, build en 2s. React 19: mismo framework que SaaS futuro |
| A2 | Ubicacion del codigo | `packages/claude-plugins/plugins/triad/web/` | Vive dentro del plugin de Triad. Se instala con el plugin via marketplace de Claude Code. package.json propio |
| A3 | Data layer | `generate-data.ts` como script separado (no extension de state_manager) | state_manager es para mutaciones de estado. generate-data.ts es un lector puro que materializa summaries como JSON. Separacion de responsabilidades |
| A4 | Orden de paginas | Dashboard primero, luego Epics, luego Modules, luego Graph | Valor incremental: Dashboard da vision global (Cycle 1), Epics/Modules dan detalle (Cycle 2), Graph es la mas compleja (Cycle 3) |
| A5 | Componentes migrables | Mismos componentes React para local y SaaS | Unico acople es el hook de datos. Componentes son puros (props in, JSX out). Evita reescritura cuando se lance SaaS |
| A6 | Relationship model | edges.json separado (Option B) con prefijos mod:/epic: | Extensible a gitgov: sin cambio de schema. Investigado con 5 agentes: OpenAPI, SPDX, Backstage, Terraform, GraphQL |
| A7 | Drift detection | Git-native: buildDriftSet() con 2 git calls, needsAudit por modulo | Sin checksums, sin estado extra. Funciona con PostToolUse hook + git pre-commit |
| A8 | Epic deps | Derivados de module deps cross-epic, no declarados explicitamente | Modulo es la unidad atomica. Epic→epic se computa, no se declara |
| A9 | Routing | State-based toggle (no React Router) | 4 paginas sin deep linking. State toggle es suficiente y mas simple. Auditado contra metodologia |

### Decisiones Pendientes

| ID | Decision | Opciones | Cuando decidir |
|---|---|---|---|
| P1 | Styling | Tailwind CSS 4.x (rapido, utilities) vs CSS custom/modules (match brand guide directo) | Al iniciar Cycle 1 — depende de cuanto difiere brand guide de Tailwind defaults |
| P2 | Routing | React Router (URLs reales, deep links) vs simple state toggle (como el mockup, menos deps) | Al iniciar Cycle 1 — si solo hay 3-4 paginas, state toggle es suficiente |
| P3 | dist/ strategy | Gitignored (generate on install) vs committed (funciona sin build step) | Al iniciar Cycle 1 — tradeoff: convenience vs repo size |

---

## Deliverables

| Entregable | Ubicacion | Cycle | Estado | Descripcion |
|---|---|---|---|---|
| Vite + React setup | `web/` | 1 | pending | package.json, vite.config.ts, tsconfig.json, index.html, base layout |
| generate-data.ts | `web/scripts/` | 1 | pending | Lee .triad/state/ + roadmap.md, genera state.json |
| /triad:web skill | `skills/web/SKILL.md` | 1 | pending | Skill spec: generate data, build, serve, open browser |
| Dashboard page | `web/src/pages/Dashboard.tsx` | 1 | pending | Epic progress bars, module state summary, activity feed |
| Epics page | `web/src/views/epics/EpicsView.tsx` | 2 | 🟢 done | Epic cards con roadmap cycles, tasks, EARS, modules (14 EARS, 14 tests) |
| Modules page | `web/src/views/modules/ModulesView.tsx` | 2 | 🟢 done | Module table grouped by package, triad triangle, scores (14 EARS, 15 tests) |
| Graph page | `web/src/views/graph/GraphView.tsx` | 3 | 🟢 done | D3 force graph with typed edges, legend, detail panel (19 EARS, 16 tests) |
| Git hook | `web/scripts/install-git-hook.ts` | 3 | 🟢 done | Pre-commit hook for IDE edits, installable via /triad:init (8 EARS, 8 tests) |

---

## Estado Actual

> **Fuente de verdad:** [`roadmap.md`](./roadmap.md)

- **Prerequisito:** triad_state_machine Cycle 5 completado (getEpicSummary existe)
- **Cycle 0 (inputs):** Completado — epic input document, conversation context, mockup HTML reference, screenshots
- **Cycle 1:** 🟢 Completado — Vite setup, generate-data.ts (13 EARS, 14 tests), Dashboard page (16 EARS), /triad:web skill (7 EARS), refresh_hook (7 EARS, 7 tests)
- **Cycle 2:** 🟢 Completado — Epics page (14 EARS, 14 tests), Modules page (14 EARS, 15 tests), audit + fix applied
- **Cycle 3:** 🟡 En Progreso — Graph page done (D3 + typed edges + drift + legend + detail). git_hook done. Pendiente: shared_components, routing, build optimization

---

## Referencias

- [Epic Input](./inputs/epic_input.md)
- [Conversation Context](./inputs/conversation_context.md)
- [Mockup Reference](./inputs/mockup_reference.html)
- [Brand Guide](packages/private/packages/blueprints/03_product/triad/brand_guide.md)
- [State Schema Types](packages/claude-plugins/plugins/triad/hooks/src/state_schema/types.ts)
- [triad_state_machine Epic](packages/private/packages/blueprints/03_products/epics/proposals/triad_state_machine/overview.md)

---

## Handoff

**Para empezar Cycle 1:**

1. Resolver decisiones pendientes P1 (Tailwind vs CSS), P2 (Router vs state toggle), P3 (dist/ strategy)
2. Ejecutar `/triad:new spec generate_data --type module` para crear spec de generate-data.ts
3. Ejecutar `/triad:new spec triad_web_skill --type skill` para crear spec del skill /triad:web
4. Scaffold del proyecto Vite + React en `packages/claude-plugins/plugins/triad/web/`
5. Implementar generate-data.ts primero (data layer antes de UI)
6. Dashboard page con datos reales

**Dependencias externas:**

- `getEpicSummary()` de triad_state_machine — necesario para que generate-data.ts compute summaries
- `skill_designer` — necesario para crear el SKILL.md de /triad:web
- `view_designer` — necesario para crear specs de pages

**Riesgos:**

- Brand guide existe pero no se ha testeado con Tailwind — puede requerir override extensivo
- El mockup tiene 12 paginas pero esta epic cubre 4 — hay que delimitar bien que entra en cada cycle
- D3 force graph del mockup es la pagina mas compleja — separar en Cycle 3 para no bloquear el resto

---

**Ultima actualizacion:** 2026-04-08 — Cycles 1+2 completados, Cycle 3 en progreso. 9 triadas (generate_data 17 EARS, modules_view 17, graph_view 19, git_hook 8, refresh_hook 7, dashboard_view 16, epics_view 14, web_skill 7). PR #9 creado, bloqueado por merge de triad_state_machine (listModules). 81 tests, 91KB build.
