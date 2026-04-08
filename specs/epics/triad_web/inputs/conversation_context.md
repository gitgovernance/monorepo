# Conversation Context: Triad Web Epic

> Fecha: 2026-04-05 a 2026-04-07
> Sesion: TRIAD (fork de sesion de diseño de triad_state_machine + dashboard)
> Participantes: Camilo + Claude Code (Opus 4.6)

---

## 1. Como surgió esta epic

Durante la sesion de diseño de `triad_state_machine`, construimos un mockup HTML
de 12 paginas (11,000+ lineas) que visualiza el estado de una organizacion completa
usando datos de .triad/ y .gitgov/. El mockup demuestra como se veria el producto
GitGov Builder (Triad) con datos reales.

El mockup incluye: LIVE (mission control), Dashboard, Epics, Modules, Provenance,
Graph (D3 force-directed), Governance (compliance packs), Audit (scans/findings/waivers),
Agents, Marketplace, Reports, Settings.

La pregunta fue: "¿como hacemos que esto funcione con datos reales, en local,
sin depender del SaaS de GitGovernance?"

## 2. Decisiones tomadas

### Tech stack
- **Vite + React** (no Next.js — no necesita SSR para local)
- Vite es build tool, no framework. Dev server en 200ms, build en 2 seg.
- Output: dist/ con HTML+JS+CSS estaticos

### Ubicacion
- **packages/claude-plugins/plugins/triad/web/** (dentro del plugin de Triad)
- Se instala con el plugin via marketplace de Claude Code
- Skill `/triad:web` levanta el server y abre el browser

### Data layer
- **generate-data.ts** lee .triad/state/ + specs/epics/*/roadmap.md
- Genera web/src/data/state.json que la SPA consume
- No modifica state_manager — es un lector separado

### Reactividad
- **Dev mode:** Vite HMR detecta cambios en state.json (PostToolUse hook regenera)
- **Build mode:** Polling cada 3 seg (tiny endpoint que re-lee state files)
- No websockets, no SSE — polling es suficiente para local

### Dos versiones, mismos componentes
- **Local (esta epic):** Lee filesystem directo, /triad:web levanta server
- **SaaS (futuro):** Mismos React components, data via tRPC + projector + DB

## 3. Schemas reales (Cycle 5 de triad_state_machine completado)

### Module State File (.triad/state/{epic}/{module}.json)

```json
{
  "module": "auth_handler",
  "epic": "saas_base",
  "state": "implemented",
  "codePath": "packages/webapps/saas/src/auth/",
  "specPath": "modules/auth_handler/",
  "cycle": 2,
  "history": [
    { "from": "no_spec", "to": "spec_draft", "trigger": "hook:detect", "ts": "2026-04-01T10:00:00Z" },
    { "from": "spec_draft", "to": "spec_ready", "trigger": "skill:audit", "ts": "2026-04-02T14:00:00Z", "score": 0.85 },
    { "from": "spec_ready", "to": "implemented", "trigger": "hook:detect", "ts": "2026-04-03T09:00:00Z" }
  ],
  "lastAudit": { "verdict": "COHERENT", "score": 0.85, "findings": 2, "ts": "2026-04-02T14:00:00Z" }
}
```

7 estados: no_spec → spec_draft → spec_ready → implemented → tested → coherent ⇄ drift

### Epic Registry (.triad/state.json)

```json
{
  "epics": {
    "saas_base": {
      "stateDir": ".triad/state/saas_base/",
      "packages": ["packages/webapps/saas/"],
      "status": "active",
      "phase": "impl",
      "activeCycle": 4,
      "history": [
        { "from": "proposal", "to": "active", "trigger": "auto:first-module-registered", "ts": "2026-03-15T10:00:00Z" }
      ]
    }
  }
}
```

5 status: proposal → active → paused → completed → discarded
phase computada: design | ready | impl | complete

### getEpicSummary() (ya existe en state_manager)

```typescript
interface EpicSummary {
  name: string;
  modules: { total: number; byState: Record<string, number> };
  lastUpdate: string | null;
}
```

### Lo que NO esta en state files (necesita parseo de markdowns)

- Cycles detail (total, completed, names) → roadmap.md
- Tasks (checkboxes checked/total) → roadmap.md
- EARS count por modulo → spec files
- Test count por modulo → test files
- Epic progress % → derivado de tasks

El script generate-data.ts combina AMBAS fuentes (state files + markdowns).

## 4. Paginas del mockup (referencia visual)

El archivo inputs/mockup_reference.html contiene las 12 paginas completas.
Cada pagina se implementa como React component incremental:

| Cycle | Paginas | Datos necesarios |
|:------|:--------|:----------------|
| 1 | Dashboard + Epics | state.json + state/*.json + roadmap.md |
| 2 | Modules + Graph | state/*.json + D3.js |
| 3 | Provenance + Reports | history[] de state files |
| 4+ | Audit, Agents, etc | Requiere .gitgov/ records |

## 5. Screenshots del Audit SaaS (referencia visual)

En inputs/:
- scan.png — Scans table + detail panel
- 222.png — Findings table + detail panel (Overview tab)
- finding_actovity.png — Finding detail (History tab)
- 444.png — Waivers table + detail panel (Details tab)
- waivers-details.png — Waiver detail (Activity tab)
- 2.png — Audit dashboard (stats + risk + repos + scans + waivers)

Estas vistas se implementan cuando la webapp soporte .gitgov/ records (Cycle 4+).

## 6. Brand guide

Seguir exactamente: `packages/private/packages/blueprints/03_product/triad/brand_guide.md`
- Dark mode (#0a0a0a), gold accent (#eab308)
- JetBrains Mono + Inter
- Sin shadows, sin gradients

## 7. Dependencias

- triad_state_machine Cycle 5 completado (getEpicSummary, /triad:init)
- skill_designer existe (para crear /triad:web skill spec)
- view_designer existe (para crear page specs)
