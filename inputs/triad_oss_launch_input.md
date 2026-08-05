# Input: Triad OSS Launch — Plugin de Claude Code en ≤7 días

> Documento de input para futura epic. NO es un blueprint ni una spec — es contexto para que el `epic_designer` cree la epic formal.

**Fecha:** 2026-05-08
**Autor:** humano:camilo (founder) + agent:claude-opus-4-7 (consultoría estratégica)
**Origen:** sesión estratégica gitgov pivot
**Sesión:** post-decisión "Triad se publica OSS y listo" + decisión "rebranding parcial: Triad separado de GitGov"
**Prioridad:** **Alta** (se ejecuta en paralelo con todo lo demás, ventana ≤7 días)
**Relacionado con:** `gate_product_saas_base_close_input.md`, `release_v1_input.md`, `pilot_validation_input.md` (Triad OSS es top of funnel para todo lo demás)
**Destino:** Epic nueva — sugerencia de nombre `triad_oss_launch`

---

## Problema (captura)

Triad existe como producto productizado dentro de `gitgovernance/triad`: tiene CLI compilado, hooks (gate_hook, detect_hook, refresh_hook, audit_reminder), state machine, pipeline de memoria con embeddings nativas (gte-small + SQLite), skills documentadas (`/triad:audit`, `/triad:new`, `/triad:impl`, `/triad:recall`, `/triad:search`, `/triad:resume`, `/triad:status`, etc.), webapp con dashboard funcional, y suite de tests E2E contra Claude real. Lleva 1 año de dogfooding interno.

Sin embargo, **Triad NO está disponible públicamente como plugin de Claude Code**. Esto es un problema porque:

1. Spec Kit (GitHub), Kiro (AWS), BMAD-METHOD, SpecStory están creciendo en adopción y construyendo audiencia ahora. Triad es técnicamente más maduro pero invisible.
2. Triad es el wedge de adopción natural de GitGov: developers que usan Triad entienden el modelo de specs+code+tests con governance, y son audiencia calificada para GitGov Provenance cuando salga.
3. Publicar Triad es **trabajo de marketing/empaquetado, no de producto** — el producto ya existe, está testeado, funciona. Lo único que queda es decir "está disponible" en público.
4. Cada semana sin publicar Triad es una semana de tracción gratuita perdida.

Estado actual del repo `gitgovernance/triad`:

```
Componentes listos:
  ✅ packages/cli/triad.ts                    (CLI compilado, dist/ committed)
  ✅ packages/hooks/                          (4 hooks activos + state machine)
  ✅ packages/pipeline/                       (indexer + memory + embeddings)
  ✅ packages/web/                            (dashboard funcional con vistas)
  ✅ skills/                                  (15 skills documentadas)
  ✅ designers/                               (7 designers + 4 presets)
  ✅ auditors/                                (9 auditors)
  ✅ extensions/                              (epic_lifecycle, pencil, tracker)
  ✅ references/                              (methodology, hooks, memory, state_machine, ears, frontend)
  ✅ AGENTS.md, README.md, LICENSE
  ✅ packages/e2e/                            (E2E real contra Claude real)

Componentes que faltan para "publicable":
  🔴 Quickstart de 5 minutos (un solo doc, copy-paste runnable)
  🔴 Sección "Roadmap público" en README con inputs futuros visibles
  🔴 Sección "Contributing" con cómo proponer skills/hooks/auditors
  🔴 Discord o GitHub Discussions habilitado
  🔴 Telemetría opt-in (con prompt al instalar)
  🔴 Anuncio público (Twitter/X)
  🔴 Dominio triad-driven.dev configurado (redirect o landing simple)
  🔴 Verificación de instalación limpia en mac fresca (sin contaminación de dotfiles del autor)
```

**Decisión clave del usuario (2026-05-08):** Triad y GitGov se mantienen separados como productos:
- `gitgovernance/triad` queda como repo independiente (nombre del repo NO cambia)
- Audiencia: developers individuales / equipos pequeños usando Claude Code
- Modelo: OSS gratis Apache 2.0
- Dominio: `triad-driven.dev`
- GitGov mantiene su propia webapp y dominio (`gitgov.com`) para producto comercial

---

## Diagramas

### Estado actual vs estado al final del Bloque 0

```
HOY (2026-05-08)                          AL FINAL DEL BLOQUE 0 (≤2026-05-15)

┌─────────────────────────┐              ┌─────────────────────────────────┐
│ gitgovernance/triad     │              │ gitgovernance/triad             │
│ (repo privado interno?) │              │ (repo público en GitHub)        │
│                         │              │                                 │
│ ✅ código completo      │              │ ✅ código completo              │
│ ✅ tests E2E            │              │ ✅ tests E2E                    │
│ ✅ skills + designers   │              │ ✅ skills + designers           │
│ ❌ no publicado         │              │ ✅ README público con CTA       │
│ ❌ sin landing          │   ────►      │ ✅ Quickstart 5min validado     │
│ ❌ sin telemetría       │              │ ✅ Telemetría opt-in PostHog OSS│
│ ❌ sin discord          │              │ ✅ GitHub Discussions activado  │
│ ❌ sin tracción         │              │ ✅ Anunciado en X (1 post)      │
│ ❌ sin dominio          │              │ ✅ triad-driven.dev → landing   │
└─────────────────────────┘              └─────────────────────────────────┘
```

### Flujo de instalación que un usuario externo debe poder completar

```
Developer escucha sobre Triad (X, GitHub, conversación)
          │
          ▼
Visita triad-driven.dev (o github.com/gitgovernance/triad)
          │
          ▼
Lee README — entiende qué es en ≤30 segundos
          │
          ▼
Copia comando de instalación:
  /plugin marketplace add gitgovernance/claude-plugins
  /plugin install triad@gitgovernance
          │
          ▼
Claude Code prompt: "Triad collects anonymous usage telemetry. Help us understand how it's used? [Y/n]"
          │
          ▼
Ejecuta: /triad:init
  ├── Crea .triad/ structure
  ├── Genera .triad/config.json
  ├── Inicializa state machine
  └── Compila pipeline si necesario
          │
          ▼
Sigue el quickstart:
  1. /triad:new epic my_first_epic
  2. /triad:new spec my_module --type module
  3. /triad:audit my_module
  4. /triad:impl my_module
  5. /triad:audit my_module
          │
          ▼
✅ Primer spec implementado con governance en <5 minutos
```

### Posicionamiento producto-vs-producto

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   TRIAD                          GITGOV                             │
│   ─────                          ──────                             │
│   triad-driven.dev               gitgov.com                         │
│   gitgovernance/triad            gitgovernance/gitgov               │
│                                                                     │
│   Audiencia:                     Audiencia:                         │
│   - Developer individual         - CTO / VP Engineering             │
│   - Equipos chicos (1-10 devs)   - Security Lead / CISO             │
│   - Open source maintainers      - Compliance officer               │
│                                                                     │
│   Modelo:                        Modelo:                            │
│   - OSS gratis Apache 2.0        - Free tier + $49/mo Pro           │
│   - Plugin Claude Code           - SaaS hosted + on-prem            │
│   - Sin cuenta requerida         - Auth GitHub + cuenta             │
│                                                                     │
│   Mensaje:                       Mensaje:                           │
│   "Spec-driven development       "Cryptographic governance for      │
│    for AI-assisted code"          AI-assisted code"                 │
│                                                                     │
│   Distribución:                  Distribución:                      │
│   - GitHub stars                 - Outbound founder-led             │
│   - Twitter/X dev community      - Content marketing                │
│   - Word of mouth                - Pilots con design partners       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Relación: Triad es top of funnel. Devs adoptan Triad → entienden la
metodología → cuando llega el momento de auditoría/governance enterprise
→ migran a GitGov (que extiende Triad con la capa cryptográfica).
```

---

## Propuesta

Producir el lanzamiento OSS de Triad como plugin de Claude Code en ≤7 días, con scope cerrado y sin sobre-ingeniería. **Foco: hacer público lo que ya existe**, no construir features nuevas.

El bloque produce 7 entregables:

### Entregable 1 — Repo público con README publicable

Convertir el README actual del repo en un README orientado a usuario externo con secciones: Why Triad, Install, Quickstart, Skills, Hooks, Designers & Auditors, Roadmap (community-driven), Contributing, License Apache 2.0.

### Entregable 2 — Quickstart validado en mac limpia

Documento `QUICKSTART.md` que un developer externo siga sin contexto previo. Validación: ejecutar el quickstart en una mac/linux limpia (VM o container fresh) por alguien NO Camilo. **Si requiere ayuda de Camilo en algún paso, ese paso falla y debe re-escribirse.**

Contenido del quickstart (10 pasos):

```
1. Pre-requisitos (Node 20+, Claude Code instalado)
2. Install plugin
3. cd a un proyecto existente o crear uno nuevo
4. /triad:init
5. /triad:new epic my_first_epic
6. /triad:new spec hello_world --type module
7. /triad:audit hello_world (verás que falla — sin código)
8. /triad:impl hello_world
9. /triad:audit hello_world (verás que pasa)
10. Abrir webapp local: cd .triad/web && npm run dev
```

### Entregable 3 — Telemetría opt-in minimalista

Implementar telemetría con prompt explícito al primer arranque. Modelo PostHog OSS / Sentry.

**Datos recolectados (si opt-in):**
- Versión de Triad
- OS (mac/linux/windows)
- Comando ejecutado (skill name, sin args)
- Errores anonimizados (stack trace sin paths absolutos)
- Conteo diario: scans, audits, specs creados

**Datos NO recolectados:**
- Contenido de specs, código, o findings
- Paths de archivos (solo nombres relativos sin user paths)
- Identificadores personales o de proyecto
- Variables de entorno

**Implementación:**
- UUID anónimo por instalación, no por usuario
- Endpoint propio (PostHog self-hosted o servicio similar)
- Código del módulo de telemetría visible y comentado en el repo (`packages/cli/src/telemetry.ts`)
- Comando `triad telemetry status` para ver qué se manda
- Comando `triad telemetry off` para desactivar después del opt-in

**Prompt al primer arranque:**
```
Triad collects anonymous usage telemetry to help us understand how it's used
and prioritize improvements. We collect: version, OS, command names, error
counts. We never collect: code content, file paths, or identifiable data.

The telemetry code is open source — see packages/cli/src/telemetry.ts.

Enable telemetry? [Y/n]:
```

### Entregable 4 — GitHub Discussions habilitado + plantillas

Habilitar GitHub Discussions en el repo con 4 categorías:
- **Announcements** — releases, breaking changes (read-only para users)
- **Ideas** — propuestas de skills, hooks, auditors
- **Q&A** — preguntas técnicas
- **Show and tell** — proyectos construidos con Triad

Plantillas de issue:
- Bug report
- Feature request
- Skill proposal (template específico siguiendo formato `skill_designer.md`)

### Entregable 5 — Dominio triad-driven.dev configurado

**Decisión del usuario:** dominio `triad-driven.dev`.

**Recomendación operativa:** Página estática única en `triad-driven.dev` con:
- Hero: "Spec-driven development for AI-assisted coding"
- 1 párrafo de explicación
- Bloque de código de instalación
- Link "View on GitHub" → repo
- Link "Read the docs" → README
- Footer con licencia y créditos

**Lo que NO hace la landing:**
- NO marketing copy extensivo
- NO features list larga
- NO pricing (Triad es gratis)
- NO email signup
- NO comparación con competidores
- NO testimonios

Tiempo estimado: 2-3 horas con HTML estático + Vercel/Netlify.

### Entregable 6 — Anuncio público en X

Un (1) post técnico anunciando el launch. Sin hilo largo, sin marketing.

Estructura sugerida:
```
After 1 year of dogfooding, releasing Triad — a Claude Code plugin for
spec-driven development.

It enforces specs before code, audits coherence, and maintains living
memory across sessions.

15 skills, 4 hooks, full E2E tested.

Apache 2.0. https://triad-driven.dev
```

Sin más posts ese día. Si alguien comenta, responder. Si nadie comenta, igual el repo público vive y los siguientes posts construyen audiencia.

### Entregable 7 — `triad-driven.dev/llms.txt` (estándar llmstxt.org)

Servir un archivo `llms.txt` en el root del dominio: `https://triad-driven.dev/llms.txt`.

**Por qué importa:**
- Es un estándar emergente propuesto por Jeremy Howard (`https://llmstxt.org/`).
- Cuando un developer le pide a Claude/ChatGPT/Cursor "instalá Triad", el LLM puede fetchear `llms.txt` y dar instrucciones precisas en lugar de inventar pasos.
- Paperclip ya lo implementa en `paperclip.ing/llms.txt` — los usuarios lo descubren porque cuando le piden a Claude "instalá Paperclip", Claude los guía correctamente.
- Para audiencia developer-Claude-native (objetivo target de Triad), esto es alto leverage por casi cero esfuerzo.

**Formato (siguiendo llmstxt.org):**
```markdown
# Triad

> Spec-driven development for AI-assisted coding. A Claude Code plugin.

[1 párrafo de descripción extendida]

## Getting Started

GitHub: https://github.com/gitgovernance/triad

[Bloque de código de instalación copy-paste]

[Más párrafos según secciones del estándar]

## Key Features

- **Spec-driven enforcement**: ...
- **Coherence auditing**: ...
- ...

## Skills Available

- `/triad:init` — ...
- `/triad:new` — ...
- ...

## Source Code

...

## Links

- Website: https://triad-driven.dev
- GitHub: https://github.com/gitgovernance/triad
```

**Contenido archivo entregable proveído como referencia:** ver `llms_triad.txt` adjunto en este input.

**Esfuerzo:** ~30 minutos de redacción + 5 minutos de subir a la landing.

**Validación:** después de publicar, abrir Claude o ChatGPT y pedir "ayudame a instalar Triad". El LLM debe fetchear el `llms.txt` automáticamente y guiar instalación correcta. Si no lo hace, revisar formato del archivo.

---

## Archivos clave

Triad ya existe. Estos son los archivos que se TOCAN durante el bloque:

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| README.md | gitgovernance/triad | README actual interno → reescribir para usuarios externos | `README.md` |
| QUICKSTART.md | gitgovernance/triad | NUEVO — copy-paste runnable de 5 min | `QUICKSTART.md` |
| CONTRIBUTING.md | gitgovernance/triad | NUEVO — cómo proponer skills/hooks/auditors | `CONTRIBUTING.md` |
| LICENSE | gitgovernance/triad | Apache 2.0 (ya existe, validar) | `LICENSE` |
| telemetry.ts | gitgovernance/triad | NUEVO — módulo de telemetría opt-in | `packages/cli/src/telemetry.ts` |
| triad.ts | gitgovernance/triad | Hook al telemetry en startup + prompt opt-in | `packages/cli/triad.ts` |
| .github/DISCUSSION_TEMPLATE/ | gitgovernance/triad | NUEVO — plantillas de discussions | `.github/DISCUSSION_TEMPLATE/*.yml` |
| .github/ISSUE_TEMPLATE/ | gitgovernance/triad | NUEVO o existente — bug + feature + skill_proposal | `.github/ISSUE_TEMPLATE/*.yml` |
| landing | repo nuevo o subdir | Landing estática para triad-driven.dev | (nuevo repo `triad-driven-web` o subcarpeta) |
| llms.txt | landing repo | NUEVO — para `triad-driven.dev/llms.txt` siguiendo estándar llmstxt.org | `public/llms.txt` o equivalente |

**Archivos que NO se tocan (anti-objetivos):**

| Archivo | Razón |
|---------|-------|
| `packages/cli/triad.ts` (lógica core) | NO añadir features. Solo hook de telemetry. |
| `skills/*/SKILL.md` | NO modificar skills. Ya están en producción. |
| `designers/*.md` | NO modificar designers. Ya están en producción. |
| `auditors/*.md` | NO modificar auditors. Ya están en producción. |
| `packages/hooks/src/` | NO modificar hooks. Ya están en producción. |
| `packages/pipeline/` | NO modificar pipeline. RAG funciona, dejar quieto. |

---

## Plan paso a paso

**Día 1 — Preparación de repo (Camilo)**

1. Validar que el repo `gitgovernance/triad` puede hacerse público sin secrets ni paths personales en el código.
2. Correr `git log` y revisar commit messages — si hay "fix: TODO Camilo's bug" o similar, considerar squash o aceptar.
3. Validar que `dist/` committeado funciona en mac fresca con `npm install -g .`
4. Confirmar LICENSE Apache 2.0 está en root.
5. Confirmar que `.gitignore` excluye `.triad/generated/`, `node_modules/`, `dist/` de paquetes locales (pero NO el `dist/` del CLI compilado que va committed).

**Día 2 — README + QUICKSTART**

6. Reescribir `README.md` para audiencia externa siguiendo estructura del Entregable 1.
7. Crear `QUICKSTART.md` con los 10 pasos copy-paste del Entregable 2.
8. Validar QUICKSTART en VM/container limpio. Si falla algún paso, corregir.
9. Crear `CONTRIBUTING.md` con guías para proponer skills/hooks/auditors.

**Día 3 — Telemetría**

10. Implementar `packages/cli/src/telemetry.ts` con prompt opt-in al primer arranque.
11. Configurar endpoint (PostHog self-hosted o servicio similar).
12. Tests del módulo de telemetría: opt-in, opt-out, persistencia de decisión, anonimización.
13. Documentar en README sección "Privacy & Telemetry".

**Día 4 — Discussions + Issue templates**

14. Habilitar GitHub Discussions en el repo.
15. Configurar 4 categorías (Announcements, Ideas, Q&A, Show and tell).
16. Crear plantillas en `.github/DISCUSSION_TEMPLATE/` y `.github/ISSUE_TEMPLATE/`.
17. Hacer post inicial en Announcements: "Triad is now public — welcome".

**Día 5 — Landing triad-driven.dev**

18. Comprar/configurar dominio `triad-driven.dev` (Cloudflare/Namecheap).
19. Crear landing estática (HTML+CSS, sin frameworks) o usar Astro/Next mínimo.
20. Deploy a Vercel/Netlify con CI desde GitHub.
21. Configurar redirect 301 desde `triad.engineering` (si existe) a `triad-driven.dev`.
22. Crear `public/llms.txt` con contenido siguiendo estándar llmstxt.org (referencia: archivo `llms_triad.txt` proveído junto a este input). Verificar accesible vía `curl https://triad-driven.dev/llms.txt`.

**Día 6 — Validación final**

23. Ejecutar QUICKSTART end-to-end en mac/linux/windows fresh.
24. Pedir a alguien externo (no Camilo) que siga el QUICKSTART sin ayuda. Documentar fricciones.
25. Corregir fricciones encontradas.
26. Test del llms.txt: en Claude o ChatGPT, pedir "ayudame a instalar Triad". El LLM debe fetchear el llms.txt y guiar instalación correcta.
27. Hacer release tag `v0.1.0` en GitHub con changelog.

**Día 7 — Anuncio**

28. Hacer público el repo (cambiar de privado a público).
29. Publicar post en X siguiendo template del Entregable 6.
30. Cross-post en HackerNews "Show HN: Triad — spec-driven development plugin for Claude Code".
31. Cross-post en r/ClaudeAI, r/programming si aplica.
32. Responder comentarios. NO automatizar. NO cross-postear más de 3 veces.

---

## Verificación

Comandos exactos para validar Definition of Done:

```bash
# 1. Validar instalación limpia en mac fresca (en VM o container)
git clone https://github.com/gitgovernance/triad.git /tmp/triad-test
cd /tmp/triad-test
npm install
npm run build
# Verificar que dist/ funciona sin error

# 2. Validar quickstart end-to-end (asumiendo Claude Code + plugin)
mkdir /tmp/triad-quickstart && cd /tmp/triad-quickstart
git init
# En Claude Code session ejecutar 10 pasos del quickstart
# Verificar que cada paso completa sin error humano fuera del prompt

# 3. Validar telemetry opt-in
node dist/cli/triad.js telemetry status
# Debe mostrar: "Telemetry: <opt-in|opt-out>" según configuración del usuario

# 4. Validar landing accesible
curl -I https://triad-driven.dev
# Debe retornar 200 o 301 a github.com/gitgovernance/triad

# 5. Validar que el repo es público
gh repo view gitgovernance/triad --json isPrivate
# Debe retornar: { "isPrivate": false }

# 6. Validar Discussions habilitado
gh api repos/gitgovernance/triad --jq '.has_discussions'
# Debe retornar: true

# 7. Tests existentes siguen pasando
cd packages && npm test
# Todos los tests E2E deben pasar (no deben romperse por cambios de README)

# 8. Smoke test del telemetry endpoint
node dist/cli/triad.js telemetry test
# Debe enviar evento de prueba al endpoint y retornar 200

# 9. Validar llms.txt accesible y bien formateado
curl https://triad-driven.dev/llms.txt
# Debe retornar el archivo siguiendo formato llmstxt.org
# Verificar: comienza con "# Triad", luego "> descripción", luego secciones markdown

# 10. Test con LLM real (manual)
# En Claude Code o ChatGPT, pedir: "ayudame a instalar Triad para Claude Code"
# El LLM debe fetchear llms.txt automáticamente y guiar instalación correcta
# Esperado: instrucciones que mencionen `/plugin marketplace add gitgovernance/claude-plugins`
```

**Criterios de éxito (Definition of Done):**

- [ ] Repo `gitgovernance/triad` es público en GitHub
- [ ] README publicable sin vergüenza (sin TODOs, sin paths personales, sin código comentado pendiente)
- [ ] QUICKSTART validado por alguien NO Camilo en mac/linux limpia
- [ ] Telemetría opt-in funcional con prompt al primer arranque
- [ ] GitHub Discussions habilitado con 4 categorías
- [ ] Plantillas de issues funcionales
- [ ] `triad-driven.dev` accesible (sea redirect o landing simple)
- [ ] **`triad-driven.dev/llms.txt` accesible y bien formateado**
- [ ] **LLM real (Claude/ChatGPT) puede dar instrucciones correctas vía fetch del llms.txt**
- [ ] 1 post en X publicado
- [ ] Release tag v0.1.0 creado en GitHub
- [ ] Tests existentes pasan al 100%

---

## Preguntas de comprensión

### Comprensión (must-pass — sin estas no puede empezar)

**[1] ¿Qué es Triad y para qué sirve un developer externo?**
hint: Leer el README actual del repo `gitgovernance/triad` y los archivos `references/methodology.md`, `references/state_machine.md`. Triad es un plugin de Claude Code que enforce specs antes de código, mediante hooks (gate_hook) y skills (`/triad:new`, `/triad:impl`, `/triad:audit`). El value prop es "spec-driven development con governance metodológica para AI-assisted coding".

**[2] ¿Qué se TOCA y qué NO se toca en este bloque?**
hint: Sección "Archivos clave" + tabla de anti-objetivos. SE TOCA: README, QUICKSTART, CONTRIBUTING, telemetry.ts (nuevo), .github/templates. NO SE TOCA: skills/, designers/, auditors/, hooks/, pipeline/. El producto ya existe — este bloque es empaquetado, no construcción.

**[3] ¿Por qué Triad y GitGov van separados como productos?**
hint: Sección "Diagramas → Posicionamiento producto-vs-producto". Triad es OSS para developers individuales con audiencia diferente a GitGov enterprise. Si se mezclan bajo `gitgov.com` se contaminan los mensajes (developer ve "GitGov Audit + GitGov Triad + GitGov Marketplace" y se confunde). Mantenemos repos y dominios separados.

### Profundización (weighted — entender el diseño)

**[4] ¿Cómo funciona la telemetría opt-in y por qué importa que el código sea visible?**
hint: Sección "Entregable 3" y revisar implementación de PostHog OSS y Sentry. La telemetría es opt-in con prompt explícito al primer arranque, recolecta solo metadatos (no contenido), y el código está en `packages/cli/src/telemetry.ts` para auditoría pública. Importa visible porque la narrativa de Triad/GitGov es "tu data es tuya" — telemetría opaca contradice esa narrativa.

**[5] ¿Cómo se mide "QUICKSTART validado" y por qué requiere alguien externo?**
hint: Sección "Plan paso a paso → Día 6". Validación: alguien NO Camilo sigue el QUICKSTART en mac/linux limpia (VM o container) sin ayuda. Si en algún paso necesita preguntar a Camilo, ese paso falla y debe reescribirse. Razón: Camilo conoce todo el contexto implícito y no puede detectar las fricciones que un usuario externo encuentra.

**[6] ¿Cuál es la relación entre Triad OSS Launch y los otros bloques (gate_product close, release_v1, pilot_validation)?**
hint: Triad OSS corre EN PARALELO a todo lo demás desde Día 1. NO bloquea ni depende de ningún otro bloque. La razón estratégica: cada semana sin Triad público es tracción gratuita perdida, y Triad funciona como top of funnel para GitGov en 6-12 meses (developers que adoptan Triad → audiencia calificada para Provenance enterprise).

### Verificación (bonus — confirmar scope)

**[7] ¿Qué pasa si el QUICKSTART falla en mac fresca?**
hint: Sección "Plan paso a paso → Día 6, paso 24". Documentar la fricción, corregirla, re-validar. NO es razón para retrasar el launch más de 1-2 días. Si la fricción es estructural (ej: hooks rompen por incompatibilidad con Claude Code update reciente), priorizar el fix. Si es cosmética (ej: typo en doc), corregir y seguir.

**[8] ¿Qué se entrega como release v0.1.0 vs qué se aparca para v0.2.0?**
hint: v0.1.0 incluye los 6 entregables del bloque (README, QUICKSTART, telemetry, Discussions, landing, anuncio). v0.2.0+ depende de input del usuario externo durante Bloque D (pilot_validation) y del input `session_reasoning_capture` que ya existe aparcado. NO meter features nuevas en v0.1.0 aunque el equipo las quiera.

**[9] ¿Qué hacemos con `gitgov.com` durante este bloque?**
hint: NADA. `gitgov.com` queda como está (o redirige a un placeholder de "coming soon"). El messaging de gitgov.com se ajusta DESPUÉS, en Bloque C (release_v1) cuando Audit MVP esté listo. Mezclar Triad y GitGov ahora produce confusión.

---

## EARS estimados

Esta epic NO se modela con EARS técnicas porque es trabajo de marketing/empaquetado, no de código nuevo. Sin embargo, los entregables tienen criterios de aceptación verificables:

| ID | Criterio |
|----|----------|
| TOL-A1 | Repo `gitgovernance/triad` es público en GitHub |
| TOL-A2 | README contiene sección "Install" con bloque de código copy-paste |
| TOL-A3 | README contiene sección "Quickstart" o link a QUICKSTART.md |
| TOL-A4 | README contiene sección "Skills" con tabla de las 15 skills |
| TOL-A5 | README contiene sección "Hooks" con tabla de los 4 hooks |
| TOL-A6 | README contiene sección "Roadmap" con 3+ inputs futuros visibles |
| TOL-A7 | README contiene sección "Contributing" con link a Discussions |
| TOL-A8 | LICENSE Apache 2.0 presente en root |
| TOL-B1 | QUICKSTART.md ejecutable end-to-end en mac fresca por usuario externo |
| TOL-B2 | QUICKSTART completa en ≤5 minutos cronometrados |
| TOL-B3 | QUICKSTART produce 1 spec implementado y auditado al final |
| TOL-C1 | Primer arranque del CLI muestra prompt de telemetría opt-in |
| TOL-C2 | Si user dice "n", telemetría queda OFF y no envía nada |
| TOL-C3 | Si user dice "y", telemetría envía: versión, OS, comando, errores anonimizados |
| TOL-C4 | Comando `triad telemetry status` muestra estado actual |
| TOL-C5 | Comando `triad telemetry off` desactiva después del opt-in |
| TOL-C6 | Código de telemetry visible en `packages/cli/src/telemetry.ts` |
| TOL-C7 | Telemetría NUNCA recolecta: contenido de specs/código/findings, paths absolutos, identificadores personales |
| TOL-D1 | GitHub Discussions habilitado con categorías Announcements, Ideas, Q&A, Show and tell |
| TOL-D2 | Plantillas de issue: bug_report, feature_request, skill_proposal |
| TOL-E1 | `triad-driven.dev` accesible y resuelve a landing o redirect |
| TOL-E2 | Landing (si existe) muestra: hero, install code block, link a GitHub |
| TOL-E3 | Landing NO contiene: pricing, email signup, marketing copy extensivo |
| TOL-F1 | 1 post en X publicado anunciando launch |
| TOL-F2 | Release tag v0.1.0 creado en GitHub con changelog |
| TOL-G1 | Tests existentes (`packages/e2e/`, hooks tests, skill E2E tests) pasan al 100% post-cambios |
| TOL-H1 | `triad-driven.dev/llms.txt` accesible vía HTTPS y bien formateado siguiendo estándar llmstxt.org |
| TOL-H2 | LLM real (Claude/ChatGPT) puede fetchear llms.txt y dar instrucciones de instalación correctas |
| TOL-H3 | llms.txt contiene secciones: nombre, descripción, getting started, key features, links a GitHub y docs |

---

## Scope estimado

**Packages afectados:** Solo `packages/cli/` (telemetry module nuevo). Resto del codebase NO cambia.

**Trabajo nuevo:**
- `packages/cli/src/telemetry.ts` (~200 líneas)
- `packages/cli/src/telemetry.test.ts` (~150 líneas)
- `README.md` reescritura (~300 líneas)
- `QUICKSTART.md` (~150 líneas)
- `CONTRIBUTING.md` (~200 líneas)
- Landing estática (~100 líneas HTML+CSS)
- **`llms.txt` para landing (~150 líneas, ya redactado en archivo proveído `llms_triad.txt`)**
- Plantillas Discussions/Issues (~50 líneas YAML cada una)

**Trabajo de configuración (no código):**
- Comprar dominio `triad-driven.dev`
- Configurar DNS y Vercel/Netlify
- Habilitar GitHub Discussions
- Cambiar repo a público
- Crear release tag

**Riesgo:** **Bajo**. El producto ya existe y está testeado. Riesgo principal es:
1. Descubrir bugs en `dist/` committeado al validar en mac fresca → fix y re-commit
2. Telemetry endpoint no listo a tiempo → diferir telemetry a v0.2.0, lanzar sin
3. QUICKSTART falla por incompatibilidad con Claude Code update reciente → reescribir paso fallido

**Esfuerzo:** **5-7 días** de trabajo focalizado, asumiendo Camilo dedicado. Si Camilo trabaja en paralelo en gate_product close (Bloque A), puede tomar 7-10 días.

**Dependencias externas:**
- GitHub (repo público, Discussions, Issue templates) — disponible
- Claude Code (plugin marketplace) — disponible
- Vercel/Netlify (landing) — disponible
- PostHog OSS o servicio similar (telemetry endpoint) — requiere setup

---

## Prioridad

**Alta** — se ejecuta en paralelo con todo lo demás. Razones:

1. **Tracción gratuita perdida cada semana sin publicar.** Spec Kit, Kiro, BMAD están construyendo audiencia ahora.
2. **Top of funnel para GitGov.** Cada developer que adopta Triad es audiencia calificada para Provenance en 12-18 meses.
3. **Trabajo barato relativo al impacto.** 5-7 días de empaquetado vs 12 meses de content marketing para construir la misma audiencia desde cero.
4. **Producto ya existe.** No hay riesgo técnico de scope creep — el bloque es marketing, no construcción.
5. **Dogfood validado.** 1 año de uso interno con métricas de E2E real es testimonio fuerte que no aplica si el repo sigue privado.

**Anti-objetivos explícitos (no hacer durante este bloque):**

- ❌ NO añadir features nuevas a Triad
- ❌ NO refactorear skills, designers, auditors o hooks existentes
- ❌ NO mover el repo a otra organización
- ❌ NO cambiar el nombre del repo
- ❌ NO mezclar Triad con GitGov en el mismo dominio
- ❌ NO automatizar outreach (LinkedIn, GitHub stars, DMs)
- ❌ NO crear marketplace de skills durante el launch
- ❌ NO prometer features futuras como roadmap committed (son "ideas exploradas")
- ❌ NO hacer landing page extensa con marketing copy
- ❌ NO publicar más de 1 post en X durante el día del launch
- ❌ NO crear cuenta empresa @triad o @triaddriven en X (usar la cuenta personal de Camilo o @gitgovernance si existe)
- ❌ NO esperar a tener "todo perfecto" para publicar — perfeccionismo es enemigo del launch

---

**Notas para el `epic_designer` que procese este input:**

1. Esta epic es **non-EARS-driven**. Modelarla con criterios de aceptación verificables, no con requisitos formales SHALL.
2. La epic NO consume specs nuevos — todos los componentes ya existen. Modelarla como "release engineering epic" similar a deployment epics.
3. El roadmap debe ser de 7 días con días numerados, no cycles tradicionales.
4. NO incluir validación cruzada con `cross_spec_auditor` ni `dependency_auditor` — no aplica.
5. El `epic_lifecycle/operator_apply` puede aplicar para mover este input a `specs/epics/triad_oss_launch/inputs/` cuando la epic se cree.
