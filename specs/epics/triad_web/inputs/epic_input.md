# Epic Input: Triad Web — Dashboard Local para Triad

> Fecha: 2026-04-06
> Status: Input document
> Prerequisito: `triad_state_machine` Cycle 5 completado (getEpicSummary, /triad:init)
> Vinculado a: `epics/proposals/triad_state_machine/` (depende de state files + getEpicSummary)
> Vinculado a: `epics/proposals/triad_protocol_bridge_input.md` (version SaaS futura)
> Ubicacion del codigo: `packages/claude-plugins/plugins/triad/web/`

---

## 1. Problema

El state machine de Triad genera datos ricos sobre el estado de epics, modulos, cycles,
EARS coverage, triad scores, y transiciones. Pero toda esa informacion solo es accesible via:

- Archivos JSON en `.triad/state/` (hay que leerlos manualmente)
- `/triad:status` (texto en terminal, limitado)
- `/triad:resume` (texto en terminal, una epic a la vez)

No hay forma visual de ver el estado del proyecto. El index.html mockup que creamos
(11,000 lineas, 12 paginas) demuestra como se veria, pero usa datos hardcoded.

## 2. Solucion

Una SPA (Single Page Application) con Vite + React que:

1. Lee `.triad/state/` directamente del filesystem
2. Muestra las mismas vistas del mockup pero con datos reales
3. Se levanta con `/triad:web` (skill de Claude Code)
4. Se actualiza automaticamente cuando los state files cambian (HMR en dev)

### Dos versiones, mismos componentes

```
VERSION 1: LOCAL (esta epic)
  /triad:web → genera data.json → vite preview → abre browser
  Lee .triad/state/ del filesystem
  No necesita internet, no necesita DB, no necesita server externo
  Un dev con Claude Code ve su progreso al instante

VERSION 2: SAAS (epic futura, triad_protocol_bridge)
  gitgov.com/builder → mismos React components
  Lee via projector + DB (como Audit)
  Multi-repo, multi-org, historical
  Producto de pago ($99/mo)
```

La clave: los componentes React son los mismos. Lo que cambia es el data layer.

```
React Components (compartidos)
  EpicCard, ModuleTable, TriadTriangle, StateGraph...
       │
       ├── Local: import data from './data/state.json'
       │   Generado por script desde .triad/state/
       │
       └── SaaS: triad.getEpics(repoId) via tRPC
           Projector + DB + GitHub API
```

---

## 3. Arquitectura

### Ubicacion en el plugin

```
packages/claude-plugins/plugins/triad/
├── skills/
│   └── web/
│       └── SKILL.md              ← /triad:web skill spec
├── hooks/                         ← state machine (ya existe)
├── designers/                     ← designers (ya existe)
├── web/                           ← NUEVO: Vite + React app
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html                 ← entry point de Vite
│   ├── scripts/
│   │   └── generate-data.ts       ← lee .triad/state/, genera data.json
│   ├── src/
│   │   ├── main.tsx               ← React entry
│   │   ├── App.tsx                ← router + layout
│   │   ├── data/
│   │   │   └── state.json         ← generado, gitignored
│   │   ├── hooks/
│   │   │   └── useTriadState.ts   ← lee state.json, polling en build mode
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── EpicCard.tsx
│   │   │   ├── ModuleTable.tsx
│   │   │   ├── TriadTriangle.tsx
│   │   │   ├── StateGraph.tsx     ← D3 graph (migrado de index.html)
│   │   │   └── ...
│   │   └── pages/
│   │       ├── Dashboard.tsx
│   │       ├── Epics.tsx
│   │       ├── Modules.tsx
│   │       ├── Graph.tsx
│   │       └── ...
│   └── dist/                      ← output build (gitignored)
└── index.html                     ← mockup actual (referencia de diseño)
```

### Flujo del skill /triad:web

```
Usuario escribe: /triad:web

Skill ejecuta:
  1. node web/scripts/generate-data.ts $(pwd)
     → Lee .triad/state.json (indice global)
     → Lee .triad/state/{epic}/*.json (modulos)
     → Lee specs/epics/*/roadmap.md (cycles, tasks, EARS)
     → Genera web/src/data/state.json

  2. cd web && npx vite preview
     → Sirve dist/ en localhost:4173
     (o npx vite dev para modo desarrollo con HMR)

  3. open http://localhost:4173
     → Abre el browser
```

### Reactividad

**En dev mode (vite dev):**
- PostToolUse hook de Claude Code detecta write a .triad/state/
- Re-ejecuta generate-data.ts
- Vite HMR detecta cambio en state.json
- Browser se actualiza automaticamente
- Zero latency

**En build mode (vite preview):**
- Polling cada 3 segundos desde el browser
- Tiny endpoint Express que re-lee state files
- O: re-run generate-data.ts y refresh manual

---

## 4. Paginas (incrementales)

Referencia visual: `packages/claude-plugins/plugins/triad/index.html` (mockup 12 paginas)

Construir incrementalmente, una pagina por cycle:

### Cycle 1: Dashboard + Epics

| Pagina | Datos necesarios | Fuente |
|:-------|:----------------|:-------|
| Dashboard | Org score, epic progress, module states | .triad/state.json + state/*.json |
| Epics | Lista de epics, cycles, tasks, progress | .triad/state.json + roadmap.md parsing |

### Cycle 2: Modules + Graph

| Pagina | Datos necesarios | Fuente |
|:-------|:----------------|:-------|
| Modules | Lista de modulos, state, EARS, score | .triad/state/{module}.json |
| Graph | Nodos + edges de records | .triad/state/*.json + relaciones |

### Cycle 3: Provenance + Reports

| Pagina | Datos necesarios | Fuente |
|:-------|:----------------|:-------|
| Provenance | Transiciones firmadas, history | .triad/state/{module}.json → history[] |
| Reports | Generacion de reportes | Compuesto de todo lo anterior |

### Cycle 4+: Audit, Agents, Marketplace, Settings

Estas paginas dependen de datos que van mas alla de .triad/:
- Audit necesita .gitgov/ records (scans, findings, waivers)
- Agents necesita ActorRecords
- Marketplace es contenido estatico por ahora

Se implementan cuando la version SaaS los requiera.

---

## 5. Data Layer: generate-data.ts

El script que lee .triad/ y genera el JSON que la webapp consume:

```typescript
// web/scripts/generate-data.ts

interface TriadWebData {
  generatedAt: string;
  org: {
    name: string;
    score: number;
  };
  epics: EpicSummary[];
  modules: ModuleSummary[];
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
}

interface EpicSummary {
  name: string;
  status: string;
  phase: string;
  cycles: { total: number; completed: number; detail: CycleSummary[] };
  tasks: { total: number; completed: number; percent: number };
  ears: { total: number; implemented: number };
  modules: { total: number; byState: Record<string, number> };
  score: number | null;
  lastActivity: string;
  packages: string[];
}

interface ModuleSummary {
  name: string;
  epic: string;
  state: string;
  ears: number;
  tests: number;
  score: number | null;
  package: string;
  lastTransition: string;
  history: TransitionEntry[];
}
```

Este es esencialmente `getEpicSummary()` del Cycle 5 de triad_state_machine,
pero materializado como JSON file en vez de retornado on-demand.

---

## 6. Relacion con triad_state_machine

```
triad_state_machine (epic existente)
│
├── Cycles 1-4: COMPLETADOS
│   State machine funcional, hooks, enforcement
│
├── Cycle 5: Developer Experience (PROPUESTA)
│   ├── Task 5.1: /triad:init
│   ├── Task 5.2: Build pipeline
│   ├── Task 5.3: Audit reminder
│   └── Task 5.4: getEpicSummary()  ← PREREQUISITO para triad_web
│
└── Dependencia:
    triad_web necesita que getEpicSummary() exista
    para que generate-data.ts pueda computar los resumenes

triad_web (esta epic, NUEVA)
│
├── Prerequisito: triad_state_machine Cycle 5 completado
│   (especificamente Task 5.4: getEpicSummary)
│
├── Cycle 1: Setup + Dashboard + Epics
├── Cycle 2: Modules + Graph
├── Cycle 3: Provenance + Reports
└── Cycle 4+: Audit integration (requiere .gitgov/)
```

---

## 7. Tech Stack

| Herramienta | Version | Proposito |
|:------------|:--------|:----------|
| Vite | 6.x | Build tool (dev server + bundler) |
| React | 19.x | UI framework |
| TypeScript | 5.8 | Type safety |
| D3.js | 7.x | Graph visualization (migrado del mockup) |
| Tailwind CSS | 4.x | Styling (o CSS custom siguiendo brand guide) |

**Sin:** Next.js, SSR, backend server, base de datos, websockets.

**Dependencias minimas:** El plugin de Triad ya se instala via marketplace.
`web/` es un subdirectorio con su propio package.json. `npm install` en web/
instala solo las dependencias del frontend.

---

## 8. Brand Guide

Seguir exactamente el brand guide de Triad (`03_product/triad/brand_guide.md`):

- Dark mode primary (#0a0a0a)
- Gold accent (#eab308)
- JetBrains Mono + Inter
- Sin shadows, sin gradients
- El mockup index.html ES la referencia visual

Los componentes React replican pixel-by-pixel lo que el mockup muestra,
pero con datos reales y codigo mantenible (componentes, no 11k lineas de HTML).

---

## 9. Skill: /triad:web

El skill se crea usando el skill_designer:

```
/triad:new spec triad_web --type skill
```

El SKILL.md define:
- Paso 1: Verificar que .triad/ existe (sino, sugerir /triad:init)
- Paso 2: Ejecutar generate-data.ts
- Paso 3: Compilar si dist/ no existe (vite build)
- Paso 4: Servir y abrir browser
- Regla: no modificar archivos, solo leer + servir

---

## 10. Migracion a SaaS (futuro)

Cuando se implemente triad_protocol_bridge (Fase 2):

```
LOCAL (esta epic)                    SAAS (futuro)
web/src/hooks/useTriadState.ts       saas-web/src/hooks/useTriadState.ts
  reads: state.json (filesystem)       reads: triad.getEpics() (tRPC)

web/src/components/EpicCard.tsx  →   saas-web/src/components/EpicCard.tsx
  (copiar tal cual)                    (mismo componente, diferente data source)
```

Los componentes se copian de `triad/web/` a `saas-web/`. Solo cambia el hook
de datos. El data layer es el unico acople — los componentes son puros.

---

## 11. Decisiones Pendientes

| # | Decision | Opciones | Cuando decidir |
|:--|:---------|:---------|:---------------|
| 1 | ¿Tailwind o CSS custom? | Tailwind (rapido, utilities) vs CSS modules (mas control, match brand guide) | Al iniciar Cycle 1 |
| 2 | ¿Router? | React Router vs simple state toggle (como el mockup) | Al iniciar Cycle 1 |
| 3 | ¿El build se commitea o se genera? | dist/ en .gitignore (generate on install) vs commiteado | Al iniciar Cycle 1 |
| 4 | ¿generate-data.ts es TS o bash? | TS (type-safe, reutiliza tipos de state_schema) vs bash (simple, sin build) | Al diseñar el spec |
| 5 | ¿Polling interval en build mode? | 3s (responsive) vs 10s (menos load) vs manual refresh | Al implementar |

---

## 12. No Hacer Ahora

- No implementar version SaaS (eso es triad_protocol_bridge)
- No agregar websockets (polling es suficiente para local)
- No crear binario `triad` (el skill es suficiente por ahora)
- No implementar Audit/Agents/Marketplace pages (dependen de .gitgov/)
- No migrar el mockup index.html (queda como referencia de diseño)

---

## 13. Orden de Implementacion

```
1. triad_state_machine Cycle 5 → Task 5.4 getEpicSummary()
   (prerequisito: el data layer necesita esta funcion)

2. triad_web Cycle 1 → Setup Vite + Dashboard + Epics
   (primera pagina funcional con datos reales)

3. triad_web Cycle 2 → Modules + Graph
   (las dos paginas mas valiosas para el dev dia a dia)

4. triad_web Cycle 3+ → incrementalmente
```

**Siguiente paso inmediato:** Completar triad_state_machine Cycle 5 (al menos Task 5.4).
**Siguiente paso de esta epic:** Crear el spec con /triad:new spec usando skill_designer para /triad:web, luego view_designer para las paginas.
