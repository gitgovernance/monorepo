# Input: Release v1 — GitGov Audit MVP shipped (SaaS hosted + on-prem)

> Documento de input para futura epic. NO es un blueprint ni una spec — es contexto para que el `epic_designer` cree la epic formal.

**Fecha:** 2026-05-08
**Autor:** humano:camilo (founder) + agent:claude-opus-4-7 (consultoría estratégica)
**Origen:** sesión estratégica gitgov pivot — decisión "MVP de Audit shipped en gitgov.com + on-prem disponible"
**Sesión:** post-cierre conceptual de gate_product + saas_base
**Prioridad:** **Alta** (es el deliverable principal del MVP comercial)
**Relacionado con:** `gate_product_saas_base_close_input.md` (prerequisito), `pilot_validation_input.md` (siguiente bloque), `clone_migration_input.md` (decisión técnica clave referenciada), `triad_oss_launch_input.md` (paralelo independiente)
**Destino:** Epic nueva — sugerencia de nombre `release_v1`

---

## Problema (captura)

Una vez cerradas las epics gate_product y saas_base (via `audit_mvp_close`), el código de Audit MVP existe pero NO está desplegado en producción ni disponible para usuarios externos. Para poder ejecutar Bloque D (pilot_validation) necesitamos:

1. **gitgov.com vivo** con SaaS hosted funcional
2. **on-prem disponible** vía docker-compose en mac limpia
3. **Documentación pública** que un usuario externo pueda seguir
4. **Pricing público y free tier** para reducir fricción de adopción

El producto técnicamente funciona en localhost durante desarrollo, pero el salto a producción real requiere trabajo específico de DevOps, infraestructura, y empaquetado que NO se hizo en gate_product/saas_base.

**Decisiones técnicas confirmadas por usuario (2026-05-08, actualizado post-Paperclip review):**

| Decisión | Resolución |
|----------|------------|
| Hosting SaaS | Cloud Run + Postgres managed (Supabase Pro recomendado por costo, Cloud SQL OK si stack 100% GCP) |
| On-prem distribution | **`npx gitgov onboard --yes`** — un solo comando, embedded postgres, static UI, sin Docker requerido |
| On-prem runtime | Single Node.js process expone API + UI + worker en mismo puerto. Embedded Postgres como subproceso. |
| Worker on-prem usa | `LocalGitModule.clone()` + `FsFileLister` (NO `GitHubFileLister` API-only) |
| `IGitModule.clone()` | NUEVO método añadido al interface, implementado SOLO en `LocalGitModule`, throw en `GitHubGitModule` |
| CLI ↔ SaaS bridge | `gitgov login <url>` acepta localhost o gitgov.com |
| Pricing público | Free tier + $49/mo Pro. Sin Business, sin Enterprise todavía |
| KMS | NO migrar para MVP — env var con MASTER_KEY documentado como deuda |
| Compliance packs | NO incluir — `gitgov lint` (Three Gates verification) sirve como narrativa "el auditor clona el repo y verifica firmas" |
| docker-compose | **Alternativa secundaria, no primaria.** Para clientes que explícitamente quieran containers (CI/CD, prod managed). El path principal es `npx`. |
| llms.txt | Servir `gitgov.com/llms.txt` siguiendo estándar `llmstxt.org` para que LLMs (Claude, GPT, etc.) puedan dar instrucciones precisas de instalación |

**Decisión arquitectónica clave:** El path SaaS hosted SIGUE siendo API-only (`GitHubFileLister`), NO migra a clone. La cascada de PAF E2E descubierta era por fixtures sintéticos, no por límites reales. Repos típicos (200-500 archivos) escalan fine via API.

El path on-prem SÍ usa clone porque corre en infra del cliente (suya o nuestra docker-compose), tiene FS+shell disponibles, y los repos pueden ser privados sin que el cliente quiera dar acceso API a nosotros.

---

## Diagramas

### Arquitectura final del Release v1

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   PATH 1: SaaS hosted (gitgov.com)                               │
│   ────────────────────────────────                               │
│                                                                  │
│   User → gitgov.com (Next.js) → Cloud Run (saas-api)             │
│                                       │                          │
│                                       ▼                          │
│                                  Postgres                        │
│                                  (Supabase Pro                   │
│                                   o Cloud SQL)                   │
│                                                                  │
│   GitHub App → webhook → Cloud Run (saas-api) → PG queue         │
│                                                       │          │
│                                                       ▼          │
│                                       Cloud Run (saas-worker)    │
│                                       │                          │
│                                       ▼                          │
│                                       GitHubFileLister (API)     │
│                                       │                          │
│                                       ▼                          │
│                                       Scan + Findings + Records  │
│                                                                  │
│   Características:                                               │
│   - API-only scan path                                           │
│   - No clone necesario                                           │
│   - Records en `gitgov-state` branch via GitHubRecordStore       │
│   - MASTER_KEY en env var (deuda KMS)                            │
│   - Free tier público + $49/mo Pro                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   PATH 2: On-prem (npx gitgov + embedded postgres)               │
│   ───────────────────────────────────────────────                │
│                                                                  │
│   Modelo Paperclip-style. Sin Docker. Un solo comando.           │
│                                                                  │
│   $ npx gitgov onboard --yes                                     │
│   ├── Detecta OS (mac/linux/windows)                             │
│   ├── Crea ~/.gitgov/instances/default/                          │
│   ├── Genera AUTH_SECRET, MASTER_KEY automáticamente             │
│   ├── Descarga binario de Postgres (vía embedded-postgres pkg,   │
│   │   ~150MB primera vez, cacheado para siguientes)              │
│   ├── Inicializa cluster en ~/.gitgov/.../db/ (puerto random)    │
│   ├── Aplica migrations Prisma (`prisma migrate deploy`)         │
│   └── Escribe config.json con defaults locales                   │
│                                                                  │
│   $ gitgov run                                                   │
│   ├── Doctor checks (9 validaciones)                             │
│   ├── Arranca embedded postgres como subproceso                  │
│   ├── Single Node.js process:                                    │
│   │   ├── API (NestJS + tRPC)         on :3000/api               │
│   │   ├── Static UI (Next export)     on :3000                   │
│   │   └── Worker loop (in-process)                               │
│   └── Open browser → http://127.0.0.1:3000                       │
│                                                                  │
│   GitHub App webhook → API local → in-memory queue → Worker      │
│                                                       │          │
│                                                       ▼          │
│                                       LocalGitModule.clone()     │
│                                       │   (mkdtemp tmp dir)      │
│                                       ▼                          │
│                                       FsFileLister(cloneDir)     │
│                                       │                          │
│                                       ▼                          │
│                                       Scan + Findings + Records  │
│                                       │                          │
│                                       ▼                          │
│                                       Cleanup tmp dir            │
│                                                                  │
│   Características:                                               │
│   - Cero Docker, cero docker-compose                             │
│   - Embedded Postgres real (no SQLite — mismo motor que prod)    │
│   - Static UI servida por mismo proceso (no Next.js server)      │
│   - Clone-based scan path                                        │
│   - Token via env var + git credential helper inline             │
│   - Records en `gitgov-state` branch via GitHubRecordStore       │
│   - Telemetría opt-in (anonymous beacon)                         │
│   - MASTER_KEY en archivo local cifrado                          │
│   - Datos NUNCA salen del perímetro del cliente (excepto         │
│     telemetría opt-in)                                           │
│                                                                  │
│   Para usuarios que prefieren Docker:                            │
│   - docker-compose.yml SE PROVEE como alternativa secundaria     │
│   - Mismo binario, mismo runtime, distinto packaging             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Flujo de instalación on-prem que un usuario debe completar en <2 min

```
1. Cliente abre terminal en mac/linux/windows
2. Ejecuta:    npx gitgov onboard --yes
   ├── Detecta OS, descarga embedded postgres binary (~150MB primera vez)
   ├── Genera secrets (AUTH_SECRET, MASTER_KEY) automáticamente
   ├── Crea ~/.gitgov/instances/default/ con config + db + secrets
   ├── Aplica migrations Prisma
   └── Termina con: "Run: gitgov run"
3. Ejecuta:    gitgov run
   ├── Doctor checks (9 validaciones)
   ├── Arranca embedded postgres
   ├── Arranca server en :3000
   └── Abre browser automáticamente en http://127.0.0.1:3000
4. OAuth con GitHub (en browser, mismo flow que SaaS hosted)
5. Configura GitHub App credentials en UI:
   GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_CLIENT_ID/SECRET, GITHUB_WEBHOOK_SECRET
   (single page, valores se guardan cifrados en ~/.gitgov/.../secrets/)
6. Instala GitHub App en su org
7. Conecta primer repo
8. Ve primer scan ejecutar y producir findings
9. ✅ Onboarding completo en <2 min (excluyendo descarga inicial)

Para usuarios que prefieren Docker:
$ docker run -p 3000:3000 -v gitgov-data:/data gitgov/gitgov
   (mismo binario, distinto packaging — alternativa, no primaria)
```

### Flujo de despliegue SaaS hosted en Cloud Run

```
GCP Project (gitgov-prod):
├── Cloud Run service: saas-api
│   ├── 8Gi memoria, gen2, concurrency=1
│   ├── Imagen: gcr.io/gitgov-prod/saas-api:latest
│   └── Env via Secret Manager
├── Cloud Run service: saas-web
│   ├── 4Gi memoria, gen2
│   └── Imagen: gcr.io/gitgov-prod/saas-web:latest
├── Cloud Run service: saas-worker
│   ├── 8Gi memoria, gen2, concurrency=1
│   └── Imagen: gcr.io/gitgov-prod/saas-worker:latest
├── Postgres: Supabase Pro (recomendado) o Cloud SQL
├── Secret Manager:
│   ├── github-app-private-key
│   ├── auth-secret
│   ├── master-key
│   ├── database-url
│   └── webhook-secret
└── Cloud DNS:
    ├── gitgov.com → saas-web
    ├── api.gitgov.com → saas-api
    └── *.gitgov.com → saas-web (wildcard)
```

---

## Propuesta

Crear epic `release_v1` con 3 sub-bloques + documentación + smoke testing en producción real. La epic se ejecuta secuencialmente con dependencias claras, en ~4-6 semanas.

### Sub-bloque C.1 — SaaS hosted (semanas 1-3)

Producir despliegue funcional en `gitgov.com`.

**Trabajo:**

1. **Dockerfiles producción** para los 4 servicios (saas-api, saas-web, saas-worker, postgres si aplica)
   - Multi-stage builds para minimizar tamaño
   - User non-root
   - Healthchecks
   - Tests de imagen pre-deploy

2. **Cloud Run config**
   - 8Gi memoria, gen2, concurrency=1 para saas-api y saas-worker
   - 4Gi memoria, gen2 para saas-web
   - Min instances: 0 (saas-worker), 1 (saas-api, saas-web)
   - Max instances: 10 (start), escalable

3. **Postgres managed**
   - **Recomendado:** Supabase Pro (~$25/mo, includes connection pooling, backups, realtime no usado pero disponible)
   - **Alternativa 100% GCP:** Cloud SQL ($40-50/mo)
   - **NO Neon:** problemas con prepared statements + Prisma reportados, requiere transaction mode pooler

4. **Secrets en GCP Secret Manager**
   - `github-app-private-key`
   - `github-client-id`
   - `github-client-secret`
   - `github-webhook-secret`
   - `auth-secret`
   - `master-key` (con nota de deuda — KMS migration en input separado)
   - `database-url`

5. **DNS + TLS**
   - Comprar/configurar `gitgov.com` (si no existe ya)
   - Configurar Cloud DNS o Cloudflare
   - TLS via Cloud Run (managed certificates)
   - Subdominios: `api.gitgov.com`, `app.gitgov.com` (opcional)

6. **CI/CD pipeline**
   - GitHub Actions para build + push imagen
   - Deploy automático a Cloud Run en push a `main`
   - Staging environment opcional (`staging.gitgov.com`)

7. **Smoke test E2E en producción real**
   - Camilo registra cuenta nueva en `gitgov.com`
   - Instala GitHub App en su monorepo gitgovernance
   - Conecta repo, ve scan ejecutar
   - Crea waiver, verifica que se commitea via gitgov_writer
   - CLI local hace `gitgov pull`, recibe el waiver

8. **Landing simple en gitgov.com**
   - Hero: "Cryptographic governance for your codebase"
   - Subhero: "Sign every finding, every waiver, every audit decision"
   - CTA principal: "Install GitHub App"
   - Secondary CTA: "Run on your own infra" → docs/on-prem
   - Bloque de pricing: Free tier + $49/mo Pro
   - Footer con link a docs

**Definition of Done C.1:**
- [ ] `gitgov.com` responde con landing funcional
- [ ] OAuth con GitHub funciona end-to-end
- [ ] GitHub App se instala y registra webhooks
- [ ] Primer scan en repo nuevo completa exitosamente
- [ ] Camilo audita su propio monorepo en producción real
- [ ] Health endpoints responden (saas-api/health, saas-worker/health)
- [ ] Logs en Cloud Logging consultables
- [ ] Métricas básicas en Cloud Monitoring (latency, error rate, CPU/memory)

### Sub-bloque C.2 — On-prem distribuible vía npm (semanas 3-5)

Producir un CLI distribuible vía `npx gitgov` que arranca el stack completo (API + UI + Worker + Postgres) en un solo proceso, sin Docker requerido. Modelo Paperclip (`paperclipai`).

**Componentes técnicos clave:**

| Componente | Tech | Notas |
|-----------|------|-------|
| Distribución | npm package `gitgov` (o `gitgovai` si `gitgov` está tomado) | Verificar disponibilidad temprano. Reservar nombre. |
| Embedded Postgres | `embedded-postgres` (Rocket Software, npm) | Descarga binario real de Postgres por OS/arch (~150MB primera vez). Cachea en `~/.gitgov/.../db/`. NO es emulador. |
| CLI prompts | `@clack/prompts` | Misma lib que Paperclip. Estética pulida con `┌`, `◇`, `◆`. |
| Migrations | Prisma Migrate (`prisma migrate deploy`) | Migrations shippeadas con el package npm. Se aplican al onboard si hay pendientes. |
| Static UI | Next.js con `output: 'export'` | Genera HTML/JS estático en build. Servido por mismo proceso Node desde `/dist/web/`. |
| API + Worker | NestJS embedded en mismo proceso | API en `/api`, worker como interval/job en mismo Node process. |
| Server | Express o Fastify wrapping NestJS | Sirve API + static UI en mismo puerto. |
| Secrets local | Archivo cifrado en `~/.gitgov/.../secrets/master.key` | Cifrado con `crypto.randomBytes(32)` generado al onboard. |
| Doctor checks | Función con array de validaciones | 9 checks: config, ports, dirs writable, db ready, secrets, etc. |

**Trabajo:**

1. **Añadir `clone()` a `IGitModule`** — única deuda de clone que entra al MVP

   Implementación (igual que estaba en plan original):
   - `IGitModule.clone(remoteUrl, targetDir, options): Promise<void>` añadido a interface en `packages/core/src/git/types.ts`
   - `LocalGitModule.clone()` implementado:
     - Usa `git clone` via `execCommand`
     - Token via env var + git credential helper inline (NO en URL ni argv)
     - Soporta shallow clone (`--depth=1`) para optimizar
     - Cleanup automático en error
   - `GitHubGitModule.clone()` throws `OperationNotSupportedError`
   - Tests unitarios + integración con repo real

2. **Crear paquete CLI `gitgov` empaquetable como `npx`**

   Estructura del package:
   ```
   packages/cli-onprem/
   ├── package.json (name: "gitgov", bin: { "gitgov": "./dist/cli.js" })
   ├── src/
   │   ├── cli.ts                  (entry point con commander/yargs)
   │   ├── commands/
   │   │   ├── onboard.ts          (interactive setup con @clack)
   │   │   ├── run.ts              (arranca todo el stack)
   │   │   ├── doctor.ts           (validaciones)
   │   │   ├── configure.ts        (re-configurar después)
   │   │   └── login.ts            (CLI ↔ SaaS bridge, ya existe)
   │   ├── embedded/
   │   │   ├── postgres.ts         (wrapper sobre embedded-postgres)
   │   │   ├── migrations.ts       (apply Prisma migrations)
   │   │   └── server.ts           (arranca NestJS + Static UI)
   │   ├── config/
   │   │   ├── home.ts             (~/.gitgov/instances/default)
   │   │   ├── secrets.ts          (genera + cifra secrets)
   │   │   └── doctor.ts           (9 checks)
   │   └── ui/
   │       └── (Next.js static export pre-built, copiado en build)
   └── migrations/
       └── (Prisma migrations copiadas en build)
   ```

3. **Comando `gitgov onboard`**
   - Interactive (sin `--yes`) o non-interactive (con `--yes`)
   - Detecta OS/arch, valida pre-requisitos (Node 20+)
   - Crea `~/.gitgov/instances/default/`:
     - `config.json` con defaults locales
     - `db/` directorio para postgres data
     - `secrets/master.key` cifrada con random 32 bytes
     - `.env` con `AUTH_SECRET`, `MASTER_KEY` reference
   - Descarga Postgres binary via `embedded-postgres` (cacheado entre runs)
   - Inicializa cluster postgres
   - Aplica migrations Prisma (`prisma migrate deploy`)
   - Output final: "Run: `gitgov run`"

4. **Comando `gitgov run`**
   - Doctor checks pre-flight (9 validaciones)
   - Arranca embedded postgres como subproceso (puerto random `5432X`)
   - Arranca single Node.js process:
     - Express/Fastify server en :3000
     - NestJS app en `/api`
     - Static UI servida desde `/dist/web/` en `/`
     - Worker loop interno (in-process, no proceso separado)
   - Abre browser en `http://127.0.0.1:3000`
   - Ctrl+C: graceful shutdown (worker drain → close db → exit)

5. **Comando `gitgov doctor`**
   - 9 checks (modelados directo del log de Paperclip):
     1. Config file existe y es válido
     2. Deployment mode coherente con bind address
     3. Auth JWT secret configurado
     4. Secrets adapter funcional (puede leer master.key)
     5. Storage writable (`~/.gitgov/.../data/`)
     6. Database ready (postgres responde a SELECT 1)
     7. LLM provider configurado (opcional, no falla)
     8. Log directory writable
     9. Server port disponible

6. **Comando `gitgov configure`**
   - Re-correr el wizard interactivo después de onboard
   - Permite cambiar config sin perder data

7. **Worker on-prem path (in-process)**
   - **Diferencia con plan original**: NO es servicio separado. Corre en mismo proceso que API.
   - Worker tick interval (configurable, default 5s)
   - Lee `scan_jobs` table (mismo modelo de queue que prod, `FOR UPDATE SKIP LOCKED`)
   - Para cada job:
     - `mkdtemp()` → tmp dir
     - `gitModule.clone()` → cloneDir
     - `new FsFileLister(cloneDir)` → fileLister
     - Pipeline scan estándar
     - `finally { rm -rf cloneDir }`
   - Tmp dir bajo `~/.gitgov/.../tmp/scan-{uuid}/`

8. **README on-prem (`docs/on-prem.md`)**
   - Pre-requisitos: Node 20+, GitHub App pre-creada
   - **One-line install**: `npx gitgov onboard --yes && gitgov run`
   - Configuración de GitHub App (UI form, no env vars)
   - Variables opcionales para customization
   - Troubleshooting: puerto en uso, disco lleno, permisos
   - Sección "Docker alternative" para usuarios que prefieran containers

9. **docker-compose.yml (alternativa secundaria)**
   - **Provisto pero no primario**. Para clientes que explícitamente quieran containers.
   - Mismo binario corriendo dentro de Docker:
     - postgres oficial container (no embedded)
     - gitgov container (CLI corriendo en `gitgov run` mode)
   - Documentado como "alternative" en docs, no como path principal.

10. **Telemetría opt-in on-prem**
    - Beacon anónimo opt-in al primer arranque (ver `triad_oss_launch_input.md` para modelo)
    - Datos: scans/día, version, errors anonimizados, OS
    - Endpoint propio (mismo que Triad si práctico)
    - Comando `gitgov telemetry status/off`

11. **E2E smoke test on-prem**
    - Mac limpia (VM o container fresh, NO container con Docker pre-instalado)
    - `npx gitgov onboard --yes`
    - `gitgov run`
    - Configurar GitHub App via UI
    - Conectar repo
    - Ver primer scan
    - Total: <2 minutos cronometrados (excluyendo descarga inicial de postgres binary)

**Definition of Done C.2:**
- [ ] `IGitModule.clone()` añadido a interface
- [ ] `LocalGitModule.clone()` implementado y testeado
- [ ] `GitHubGitModule.clone()` throws apropiado
- [ ] Package npm `gitgov` (o nombre alternativo) publicable
- [ ] `npx gitgov onboard --yes` funciona en mac/linux/windows fresh
- [ ] `gitgov run` arranca stack completo en un proceso
- [ ] On-prem scan completa exitosamente con clone path
- [ ] README on-prem es seguible sin asistencia
- [ ] Smoke test E2E <2 min validado por usuario externo
- [ ] Telemetría opt-in implementada y testeada
- [ ] docker-compose.yml provisto como alternativa secundaria
- [ ] Doctor command funcional con 9 checks
- [ ] Migrations Prisma se aplican automáticamente al onboard

### Sub-bloque C.3 — Documentación (semanas 5-6)

Producir documentación pública para usuarios externos.

**Trabajo:**

1. **Quickstart hosted** (`docs/quickstart.md` o `gitgov.com/docs/start`)
   - 5 minutos: registro → install → primer scan
   - Screenshots o GIFs cortos
   - Troubleshooting básico

2. **Quickstart on-prem** (`docs/on-prem.md`)
   - **One-line install**: `npx gitgov onboard --yes && gitgov run`
   - 2 minutos cronometrados (excluyendo descarga postgres binary)
   - Diferencias vs hosted
   - Sección "Docker alternative" para clientes que prefieran containers
   - Troubleshooting on-prem específico

3. **Reference docs** (`docs/reference/`)
   - **Protocol overview:** qué es .gitgov/, qué records hay (TaskRecord, FindingRecord, WaiverRecord, ExecutionRecord, FeedbackRecord), Three Gates verification
   - **Agent model:** Two-Tier Actor Model (G21), product agents vs specialist agents, identity registry
   - **Three Gates verification:** checksum + schema + signature, cómo `gitgov lint` los valida offline
   - **CLI reference:** comandos principales (`scan`, `lint`, `push`, `pull`, `login`, `whoami`, `audit`, `onboard`, `run`, `doctor`, `configure`)
   - **Webapp tour:** screenshots de Dashboard, Scans, Findings, Waivers, Governance views

4. **FAQ pública** (`docs/faq.md`)
   - "¿Mi código sale de mi infra?" (No en on-prem; metadata sí en hosted)
   - "¿Qué encripta GitGov?" (records están firmados Ed25519, MASTER_KEY en env var)
   - "¿Funciona con repos privados?" (Sí, vía GitHub App permissions)
   - "¿GitLab/Bitbucket?" (No por ahora — fuera de scope MVP)
   - "¿Puedo migrar a otro vendor después?" (Sí, los records son JSON en tu git)
   - "¿Compliance SOC 2/PCI/GDPR?" (Hoy no hay reportes pre-empaquetados; `gitgov lint` verifica firmas para auditor externo manual)
   - "¿Necesito Docker?" (No para on-prem — `npx gitgov` arranca todo. Docker es alternativa.)
   - "¿Por qué embedded postgres y no SQLite?" (Mismo motor que producción → mismo comportamiento, mismas optimizaciones, sin diferencias entre dev/prod)

5. **API reference** (auto-generada vía tRPC introspection)
   - Endpoints principales: scans, findings, waivers, repos, orgs
   - Auth: GitHub OAuth + JWT

6. **`gitgov.com/llms.txt`** (NUEVO entregable basado en estándar `llmstxt.org`)
   - Archivo en root del dominio: `https://gitgov.com/llms.txt`
   - Sigue formato propuesto por Jeremy Howard (llmstxt.org)
   - Contiene: nombre, descripción una línea, getting started, key features, links a docs
   - Razón: cuando un developer le pregunte a Claude/GPT "cómo instalo gitgov", el LLM puede fetchear `llms.txt` y dar instrucciones precisas (incluyendo `npx gitgov onboard --yes`)
   - Ejemplo de uso real: Paperclip tiene `paperclip.ing/llms.txt` y cuando un user le pide a Claude "instalá paperclip", Claude lo guía paso a paso correctamente
   - Esfuerzo: ~30 minutos de redacción, alto leverage para distribución LLM-mediada

**Definition of Done C.3:**
- [ ] Quickstart hosted publicado en gitgov.com/docs
- [ ] Quickstart on-prem publicado en gitgov.com/docs (con `npx gitgov` como path primario)
- [ ] Reference docs publicados (al menos: protocol, agents, three gates, CLI)
- [ ] FAQ pública publicada
- [ ] `gitgov.com/llms.txt` accesible y bien formateado
- [ ] Un usuario externo puede instalar y completar primer scan siguiendo solo docs

---

## Archivos clave

### Archivos de infraestructura SaaS hosted (NUEVOS)

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| Dockerfile (saas-api) | gitgovernance/gitgov | Imagen producción de saas-api para Cloud Run | `packages/saas-api/Dockerfile` |
| Dockerfile (saas-web) | gitgovernance/gitgov | Imagen producción de saas-web para Cloud Run | `packages/saas-web/Dockerfile` |
| Dockerfile (saas-worker) | gitgovernance/gitgov | Imagen producción de saas-worker para Cloud Run | `packages/saas-worker/Dockerfile` |
| Cloud Run YAML | gitgovernance/gitgov | Config de servicios Cloud Run | `infra/cloudrun/*.yaml` |
| GitHub Actions CI | gitgovernance/gitgov | Pipeline de build + deploy | `.github/workflows/deploy.yml` |

### Archivos de distribución on-prem (NUEVOS — paquete `gitgov` para `npx`)

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| package.json | gitgovernance/gitgov | name="gitgov", bin="./dist/cli.js", publish a npm | `packages/cli-onprem/package.json` |
| cli.ts | gitgovernance/gitgov | Entry point con commander/yargs | `packages/cli-onprem/src/cli.ts` |
| onboard command | gitgovernance/gitgov | Wizard interactivo con @clack/prompts | `packages/cli-onprem/src/commands/onboard.ts` |
| run command | gitgovernance/gitgov | Arranca stack completo (postgres + server + worker) | `packages/cli-onprem/src/commands/run.ts` |
| doctor command | gitgovernance/gitgov | 9 validaciones | `packages/cli-onprem/src/commands/doctor.ts` |
| configure command | gitgovernance/gitgov | Re-correr wizard | `packages/cli-onprem/src/commands/configure.ts` |
| postgres wrapper | gitgovernance/gitgov | Wrapper sobre `embedded-postgres` package | `packages/cli-onprem/src/embedded/postgres.ts` |
| migrations runner | gitgovernance/gitgov | Aplica Prisma migrations en cluster local | `packages/cli-onprem/src/embedded/migrations.ts` |
| server starter | gitgovernance/gitgov | Arranca NestJS + Static UI en mismo proceso | `packages/cli-onprem/src/embedded/server.ts` |
| home dir manager | gitgovernance/gitgov | Crea/lee `~/.gitgov/instances/default/` | `packages/cli-onprem/src/config/home.ts` |
| secrets manager | gitgovernance/gitgov | Genera + cifra secrets en archivo local | `packages/cli-onprem/src/config/secrets.ts` |
| docker-compose.yml | gitgovernance/gitgov | **Alternativa secundaria**, no path primario | `docker-compose.yml` |

### Archivos de código a tocar (NUEVOS o MODIFICADOS)

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| `IGitModule` interface | gitgovernance/gitgov | Añadir `clone()` method | `packages/core/src/git/types.ts` |
| local_git_module.ts | gitgovernance/gitgov | Implementar `clone()` | `packages/core/src/git/local_git_module.ts` |
| github_git_module.ts | gitgovernance/gitgov | Throw `OperationNotSupportedError` en `clone()` | `packages/core/src/git/github_git_module.ts` |
| local_git_module.test.ts | gitgovernance/gitgov | Tests para `clone()` | `packages/core/src/git/local_git_module.test.ts` |
| OnPremScanWorker | gitgovernance/gitgov | NUEVO o flag en `ScanWorker` (in-process, no servicio separado) | `packages/saas-worker/src/scan/on_prem_scan_worker.ts` |
| telemetry.ts (saas-worker) | gitgovernance/gitgov | NUEVO — telemetría opt-in | `packages/saas-worker/src/telemetry.ts` |
| login.ts (CLI) | gitgovernance/gitgov | Aceptar `gitgov login <url>` con localhost o gitgov.com | `packages/cli/src/login.ts` |
| llms.txt | gitgovernance/gitgov | NUEVO — para gitgov.com/llms.txt | `packages/saas-web/public/llms.txt` |

### Archivos de documentación (NUEVOS)

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| README.md (root) | gitgovernance/gitgov | README público para repo OSS | `README.md` |
| docs/quickstart.md | gitgovernance/gitgov | Quickstart SaaS hosted | `docs/quickstart.md` |
| docs/on-prem.md | gitgovernance/gitgov | Quickstart on-prem | `docs/on-prem.md` |
| docs/protocol.md | gitgovernance/gitgov | Protocol overview | `docs/reference/protocol.md` |
| docs/agents.md | gitgovernance/gitgov | Two-Tier Actor Model | `docs/reference/agents.md` |
| docs/three-gates.md | gitgovernance/gitgov | Three Gates verification | `docs/reference/three-gates.md` |
| docs/cli.md | gitgovernance/gitgov | CLI reference | `docs/reference/cli.md` |
| docs/faq.md | gitgovernance/gitgov | FAQ pública | `docs/faq.md` |

### Landing de gitgov.com

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| Landing page (hero, pricing, CTA) | gitgovernance/gitgov | Next.js page o subdir | `packages/saas-web/src/app/page.tsx` |
| Pricing component | gitgovernance/gitgov | Tabla Free + $49/mo Pro | `packages/saas-web/src/components/pricing.tsx` |

### Archivos que NO se tocan (anti-objetivos)

| Archivo o paquete | Razón |
|-------------------|-------|
| `packages/saas-api/src/projects/` | Cycle 5 saas_base — POSPUESTO |
| `packages/saas-api/src/compliance/` | Cycle 6 saas_base — POSPUESTO |
| `packages/core/src/file_lister/github_file_lister.ts` | NO migrar SaaS hosted a clone — sigue API-only |
| KMS adapter | Aparcado a `kms_migration_input.md` |
| Marketplace de packs | Aparcado a `marketplace_sandbox_input.md` |
| GitLab adapter | Fuera de scope MVP |
| SSO/SAML | Fuera de scope MVP |
| Stripe / billing real | Fuera de scope MVP (Free + Pro pricing público pero sin pagos automatizados todavía — manual via Stripe link) |

---

## Plan paso a paso

### Semana 1 — Dockerfiles + Cloud Run setup

1. Escribir `Dockerfile` para `saas-api` con multi-stage build (builder → runtime)
2. Escribir `Dockerfile` para `saas-web` con Next.js standalone output
3. Escribir `Dockerfile` para `saas-worker` análogo a saas-api
4. Build local de las 3 imágenes, validar arranque
5. Crear proyecto GCP `gitgov-prod`
6. Configurar Cloud Run services (saas-api, saas-web, saas-worker)
7. Configurar Secret Manager con todos los secrets
8. Deploy manual de las 3 imágenes a Cloud Run, validar arranque

### Semana 2 — Postgres + DNS + Smoke local

9. Decidir Postgres: Supabase Pro vs Cloud SQL. Recomendación: Supabase Pro por costo + connection pooling out of the box.
10. Aprovisionar Postgres con schema base
11. Run migrations Prisma contra Postgres prod
12. Configurar Cloud DNS para `gitgov.com` y `api.gitgov.com`
13. Configurar TLS managed certificates en Cloud Run
14. Configurar GitHub Actions workflow `.github/workflows/deploy.yml`
15. Push a `main` → deploy automático funciona

### Semana 3 — Smoke test producción + Landing

16. Camilo registra cuenta en gitgov.com (OAuth GitHub)
17. Instala GitHub App en su monorepo
18. Conecta repo
19. Ve primer scan ejecutar en producción real
20. Crea waiver, verifica que se commitea
21. CLI local hace `gitgov pull`, recibe el waiver
22. Si todo verde: smoke test completo
23. Implementar landing en `packages/saas-web/src/app/page.tsx`
24. Implementar componente de pricing
25. Deploy landing y validar visualmente

### Semana 4 — `IGitModule.clone()` + on-prem worker in-process

26. Añadir `clone()` a `IGitModule` interface en `packages/core/src/git/types.ts`
27. Implementar `LocalGitModule.clone()`:
    - Usa `git clone` via `execCommand`
    - Token via env var + git credential helper
    - Shallow clone con `--depth=1`
    - Cleanup en error
28. Tests unitarios `local_git_module.test.ts`:
    - Clone de repo público
    - Clone de repo privado con token
    - Clone fallido (URL inválida)
    - Cleanup en error
29. `GitHubGitModule.clone()` throws `OperationNotSupportedError`
30. `OnPremScanWorker` o flag en `ScanWorker` — in-process worker:
    - Worker tick interval (5s default, configurable)
    - Lee jobs de queue con `FOR UPDATE SKIP LOCKED`
    - Por job: mkdtemp → gitModule.clone() → FsFileLister → scan → cleanup

### Semana 5 — Package `gitgov` distribuible vía npx

31. Crear `packages/cli-onprem/` con estructura del paquete
32. Reservar nombre `gitgov` en npm (verificar disponibilidad). Si tomado: `gitgovai`, `gitgovernance`, `gitgov-cli`.
33. Implementar `gitgov onboard` con `@clack/prompts`:
    - Detección OS/arch
    - Crear `~/.gitgov/instances/default/`
    - Generar secrets (AUTH_SECRET, MASTER_KEY) con `crypto.randomBytes(32)`
    - Cifrar master.key
    - Escribir config.json
    - Descargar postgres binary via `embedded-postgres`
    - Inicializar cluster
    - Aplicar migrations Prisma (`prisma migrate deploy`)
34. Implementar `gitgov run`:
    - Doctor checks (9 validaciones)
    - Arrancar embedded postgres como subproceso
    - Bootstrap NestJS app + Express/Fastify wrapper
    - Servir static UI desde `dist/web/` en `/`
    - API en `/api`
    - Worker loop in-process
    - Abrir browser auto en `http://127.0.0.1:3000`
35. Implementar `gitgov doctor` con 9 validaciones (modelado de Paperclip log)
36. Implementar `gitgov configure` para re-correr wizard
37. Build process: copy static UI build + Prisma migrations al package antes de publicar
38. Publish a npm: `npm publish` (primera versión `0.1.0` o `1.0.0-beta`)
39. Validación: `npx gitgov onboard --yes && gitgov run` en mac/linux/windows fresh
40. docker-compose.yml como alternativa secundaria documentada
41. Implementar telemetría opt-in
42. Validación: usuario externo (NO Camilo) instala on-prem en <2 min

### Semana 6 — Documentación pública + smoke E2E

43. Escribir `README.md` público de gitgovernance/gitgov
44. Escribir `docs/quickstart.md` (hosted)
45. Escribir `docs/on-prem.md` con `npx gitgov` como path primario + sección Docker alternative
46. Escribir `docs/reference/protocol.md`, `agents.md`, `three-gates.md`, `cli.md`
47. Escribir `docs/faq.md`
48. Escribir y publicar `gitgov.com/llms.txt` siguiendo estándar llmstxt.org
49. Validación final: usuario externo completa onboarding hosted siguiendo solo docs
50. Validación final: usuario externo completa onboarding on-prem (`npx gitgov`) siguiendo solo docs
51. Smoke test E2E completo en producción + on-prem
52. Tag release `v1.0.0` en GitHub
53. Anuncio en X (un solo post, similar a Triad launch)
54. Test del llms.txt: pedir a Claude/ChatGPT "instalá gitgov" — verificar que el LLM da instrucciones correctas vía fetch del llms.txt

---

## Verificación

Comandos exactos para validar Definition of Done:

### Verificación C.1 (SaaS hosted)

```bash
# Landing accesible
curl -I https://gitgov.com
# Debe retornar 200

# API health
curl https://api.gitgov.com/health
# Debe retornar 200 con {"status":"ok"}

# OAuth flow
# Manual: ir a gitgov.com, click "Install GitHub App", completar OAuth

# Smoke E2E producción
# Manual: registrar, instalar app, conectar repo, ver scan, crear waiver, verificar via CLI

# Cloud Run services running
gcloud run services list --project=gitgov-prod --region=us-central1
# Debe mostrar 3 servicios: saas-api, saas-web, saas-worker

# Postgres conectividad
psql $DATABASE_URL -c "SELECT count(*) FROM users"
# Debe retornar count >= 1 (al menos Camilo)

# Logs de scan en producción
gcloud logging read "resource.type=cloud_run_revision AND severity=INFO AND textPayload:scan_completed" \
  --project=gitgov-prod --limit=10
# Debe mostrar al menos 1 scan completado
```

### Verificación C.2 (on-prem)

```bash
# Clone interface implementado
grep "clone" packages/core/src/git/types.ts
# Debe mostrar method signature

# LocalGitModule.clone() funcional
cd packages/core && npm test local_git_module
# Tests de clone deben pasar

# Package gitgov publicable
cd packages/cli-onprem && npm pack
# Debe producir gitgov-X.Y.Z.tgz sin errores

# Validación end-to-end en mac/linux/windows fresh
# (idealmente VM o container limpio sin Node ni Docker pre-instalados)
npx gitgov onboard --yes
# Debe completar sin error humano
# Debe crear ~/.gitgov/instances/default/

# Doctor check
gitgov doctor
# Debe mostrar 9 checks pasados

# Run smoke
gitgov run &
sleep 10
# Verificar UI accesible
curl -I http://127.0.0.1:3000
# Debe retornar 200
# Verificar API
curl http://127.0.0.1:3000/api/health
# Debe retornar {"status":"ok"}

# Smoke test on-prem completo
# Manual: en mac limpia, ejecutar:
#   npx gitgov onboard --yes && gitgov run
# Cronometrar tiempo total. Target: <2 min (excluyendo descarga inicial postgres)
# Configurar GitHub App via UI
# Conectar repo
# Ver primer scan completar

# Telemetría opt-in
gitgov telemetry status
# Debe mostrar status actual

# docker-compose alternative funciona (secundario)
docker compose up -d
sleep 30
curl -I http://localhost:3000
# Debe retornar 200
```

### Verificación C.3 (documentación)

```bash
# Docs accesibles
curl -I https://gitgov.com/docs/quickstart
curl -I https://gitgov.com/docs/on-prem
curl -I https://gitgov.com/docs/reference/protocol
# Todos deben retornar 200

# llms.txt accesible y bien formateado
curl https://gitgov.com/llms.txt
# Debe retornar archivo siguiendo formato llmstxt.org
# Debe contener: # GitGov, > description, ## sections

# Test del llms.txt con LLM real
# Manual: en Claude/ChatGPT, pedir "instalá gitgov en mi mac"
# El LLM debe fetchear llms.txt automáticamente y dar instrucciones correctas
# Esperado: "Run npx gitgov onboard --yes" como primera instrucción

# Validación con usuario externo
# Manual: pedir a alguien NO Camilo seguir docs/quickstart, medir tiempo y fricciones
# Pedir a alguien NO Camilo seguir docs/on-prem (vía npx), medir tiempo y fricciones
```

**Criterios de éxito (Definition of Done global):**

- [ ] gitgov.com vivo y funcional
- [ ] OAuth + GitHub App + scan + waiver flow completo en producción
- [ ] **`npx gitgov onboard --yes && gitgov run`** funciona en mac/linux/windows fresh
- [ ] Onboarding on-prem cronometrado <2 min (excluyendo descarga postgres binary)
- [ ] Package `gitgov` (o nombre alternativo) publicado en npm
- [ ] `IGitModule.clone()` implementado y testeado
- [ ] Doctor command con 9 checks funcional
- [ ] docker-compose.yml provisto como alternativa secundaria documentada
- [ ] Documentación pública completa (quickstart hosted + on-prem + reference + FAQ)
- [ ] **`gitgov.com/llms.txt`** accesible y bien formateado siguiendo estándar
- [ ] LLM real (Claude/ChatGPT) puede dar instrucciones correctas vía fetch del llms.txt
- [ ] Usuario externo completa onboarding hosted siguiendo solo docs
- [ ] Usuario externo completa onboarding on-prem siguiendo solo docs
- [ ] Telemetría opt-in implementada (hosted automático, on-prem con prompt)
- [ ] CI/CD funcional (push → deploy)
- [ ] Logs y métricas básicas en Cloud Logging/Monitoring
- [ ] Tag release v1.0.0 creado
- [ ] Anuncio público en X publicado

---

## Preguntas de comprensión

### Comprensión (must-pass — sin estas no puede empezar)

**[1] ¿Cuáles son los dos paths del Release v1 y qué los diferencia?**
hint: Sección "Diagramas → Arquitectura final". Path 1: SaaS hosted en gitgov.com con Cloud Run + Postgres managed, scan via API-only (`GitHubFileLister`). Path 2: On-prem via `npx gitgov onboard --yes && gitgov run` con embedded postgres + single Node.js process + scan via clone-based (`LocalGitModule.clone()` + `FsFileLister`). El SaaS hosted NO migra a clone — sigue API. El on-prem SÍ usa clone porque corre en infra del cliente. **No hay Docker requerido en el path on-prem primario** — sigue el modelo Paperclip (`paperclipai`).

**[2] ¿Qué se TOCA y qué NO se toca en este bloque?**
hint: Sección "Archivos clave". SE TOCA: Dockerfiles para Cloud Run (saas-api/web/worker), package nuevo `cli-onprem` para distribución vía npx, `IGitModule.clone()` (NUEVO), `LocalGitModule.clone()` (NUEVO), worker on-prem in-process, telemetría, documentación pública, llms.txt. NO SE TOCA: Cycle 5/6 saas_base, KMS, marketplace, GitLab, SSO, Stripe billing, ni el path SaaS hosted (sigue API-only).

**[3] ¿Por qué `clone()` solo se implementa en `LocalGitModule` y no en `GitHubGitModule`?**
hint: Sección "Decisiones técnicas confirmadas". `LocalGitModule` corre donde hay FS+shell disponibles (cualquier contenedor con git instalado). `GitHubGitModule` es para path SaaS hosted que sigue API-only (sin FS persistente para repos clonados). El interface tiene el método para soporte on-prem; el GitHub adapter throws porque no aplica en su contexto.

### Profundización (weighted — entender el diseño)

**[4] ¿Por qué Supabase Pro recomendado vs Cloud SQL vs Neon?**
hint: Sección "Sub-bloque C.1 → 3. Postgres managed". Supabase Pro: ~$25/mo, connection pooling out of the box (importante para Cloud Run con concurrency=1), backups managed, dashboard SQL incluido. Cloud SQL: $40-50/mo, requiere VPC connector, más complejo de configurar pero stack 100% GCP. Neon: descartado por problemas reportados con prepared statements + Prisma que requieren transaction mode pooler.

**[5] ¿Cómo se maneja el token de GitHub durante el clone on-prem para que no quede en URL ni argv?**
hint: Sección "Sub-bloque C.2 → 1. Añadir clone() a IGitModule". El token se pasa via env var (`GITHUB_TOKEN`) + git credential helper inline (configurado dinámicamente para esa invocación de clone). El URL del repo en argv NO contiene el token. Esto evita que el token aparezca en `ps aux`, `~/.bash_history`, o logs de git internos.

**[6] ¿Por qué el worker on-prem es in-process y usa tmp dir efímero con cleanup automático?**
hint: Sección "Diagrama Path 2" + "Sub-bloque C.2 → 7. Worker on-prem path". El worker corre en el mismo proceso Node.js que API + UI (modelo Paperclip — single process arquitectura). Los repos clonados pueden contener código sensible del cliente. El tmp dir bajo `~/.gitgov/.../tmp/scan-{uuid}/` es efímero — `mkdtemp` crea, scan usa, `finally` borra. Defensa en profundidad: si el proceso crashea mid-scan, próximo arranque limpia tmp dirs huérfanos. NO se persisten clones a disco entre runs.

**[6.5] ¿Por qué embedded postgres en lugar de SQLite para on-prem?**
hint: Sección "Componentes técnicos clave" + nota sobre Paperclip. El package `embedded-postgres` (Rocket Software) descarga binarios reales de Postgres por OS/arch. Es el mismo motor que producción (Cloud SQL/Supabase). Razones: (a) paridad dev/prod — mismas queries, mismos comportamientos, mismas optimizaciones, (b) features Postgres específicas que usamos (`FOR UPDATE SKIP LOCKED` para job queue, JSONB, pgcrypto si necesario), (c) migrations Prisma idénticas en ambos entornos, (d) facilita migrar de on-prem a SaaS hosted para clientes que escalen. Cero diferencias de motor entre desarrollo, on-prem, y producción.

**[7] ¿Por qué la migración a clone para SaaS hosted NO entra al MVP aunque haya cascada de fallos en PAF?**
hint: Referencia a `clone_migration_input.md` y la decisión arquitectónica. La cascada era por fixtures sintéticos (e2e-test-repo con 2766 critical findings), NO por límites reales del API-only. Repos típicos de clientes: 200-500 archivos. Migración a clone para SaaS hosted: 3-4 semanas + cambio de Cloudflare Workers (no FS) a Cloud Run (sí FS). El trade-off: 3-4 semanas de trabajo vs $40/mes ahorro hipotético en API calls. Mejor: API-only ahora, migrar cuando haya dolor real medible (cliente con repo 5000+ archivos quejándose).

**[8] ¿Qué es `gitgov lint` y por qué sirve como narrativa de "compliance" sin compliance packs?**
hint: Sección "Decisiones técnicas confirmadas → Compliance packs". `gitgov lint` ya existe y verifica offline las Three Gates (checksum + schema + signature) de todos los records en `.gitgov/`. Esto significa que un auditor externo puede clonar el repo y ejecutar `gitgov lint` para verificar que TODOS los findings y waivers están firmados y no han sido manipulados. No es un reporte SOC2/PCI/GDPR pre-empaquetado, pero es evidencia auditable. Para MVP es suficiente narrativa: "el auditor verifica con un comando, los datos son tuyos en tu git".

### Verificación (bonus — confirmar scope)

**[9] ¿Qué pasa si el smoke test en producción descubre bugs?**
hint: Implícito en el plan. Si bug es crítico (rompe onboarding, scan no completa, datos corruptos), priorizar fix antes de continuar. Si bug es menor (UI quirk, edge case raro), documentar como input y seguir. Regla: smoke test debe ser exitoso end-to-end, fixes mayores bloquean release tag.

**[10] ¿Qué pasa con KMS migration y marketplace si un usuario potencial los pide?**
hint: Inputs aparcados específicos. Para KMS: "está en roadmap, hoy MASTER_KEY en env var con seguridad estándar de Cloud Run/Secret Manager. Cuando tengas requisito de compliance que lo requiera, podemos priorizar". Para marketplace: "no hay marketplace todavía, los agents disponibles son los oficiales (gitgov-audit, security-audit, review-advisor)". Honestidad sobre el estado actual sin prometer fechas.

**[11] ¿Cómo se maneja el pricing si no hay billing automatizado?**
hint: Sección "Sub-bloque C.1 → 8. Landing simple". Pricing público en landing: Free tier (sin login required para scans públicos quizás, o con login limitado a 1 repo) + $49/mo Pro (manual via Stripe link). Para MVP: free tier es default, Pro requiere contacto manual con Camilo. Cuando haya 5-10 clientes, automatizar billing con Stripe checkout. Antes de eso, fricción manual es OK.

**[12] ¿Qué hacemos si el deploy a Cloud Run falla recurrentemente?**
hint: Implícito en plan + GCP best practices. Logs en Cloud Logging para debug. Healthchecks robustos en Dockerfiles. Rollback strategy: Cloud Run mantiene revisiones, rollback con un comando. Si falla en CI/CD, deploy manual desde laptop. Si Cloud Run es problemático, considerar Fly.io o Render como alternativas (mismo modelo container-based).

**[13] ¿Qué es `llms.txt` y por qué importa para distribución del producto?**
hint: Sección "Sub-bloque C.3 → 6. gitgov.com/llms.txt". Es un estándar emergente propuesto por Jeremy Howard (`llmstxt.org`). Vive en `https://gitgov.com/llms.txt` con formato fijo (H1 + blockquote + secciones markdown). Importa porque developers cada vez más le piden a LLMs (Claude, ChatGPT, Cursor) instalación de herramientas. Sin `llms.txt`, el LLM puede inventar instrucciones erróneas. Con `llms.txt`, el LLM lo fetchea automáticamente y guía al usuario correctamente con `npx gitgov onboard --yes`. Esfuerzo: ~30 min. Leverage: alto. Paperclip ya lo hace en `paperclip.ing/llms.txt`.

**[14] ¿Por qué `npx gitgov` en lugar de Docker como path primario on-prem?**
hint: Sección "Decisiones técnicas confirmadas → On-prem distribution". Ventajas de `npx`: (a) zero pre-requisitos más allá de Node 20+, (b) no requiere Docker instalado (mac users muchas veces no tienen Docker Desktop), (c) embedded postgres elimina necesidad de container postgres separado, (d) DX dramáticamente mejor — un solo comando vs descargar yaml + configurar .env + esperar healthchecks, (e) modelo validado por Paperclip que tiene buena tracción developer. Docker queda como alternativa documentada para clientes que explícitamente lo quieran (CI/CD, prod managed con K8s, etc.). NO eliminamos Docker — bajamos su prioridad de path primario a alternativa.

---

## EARS estimados

Esta epic NO se modela primariamente con EARS técnicas — es trabajo de DevOps + documentación + integración. Sin embargo, hay EARS específicas para el método nuevo `clone()`:

| ID | Requisito |
|----|-----------|
| GIT-CLONE-A1 | WHEN clone called with valid public repo URL, THE LocalGitModule SHALL clone to target directory |
| GIT-CLONE-A2 | WHEN clone called with private repo + valid token, THE LocalGitModule SHALL authenticate via credential helper without leaking token |
| GIT-CLONE-A3 | WHEN clone called on GitHubGitModule, THE SYSTEM SHALL throw OperationNotSupportedError |
| GIT-CLONE-A4 | WHEN clone fails mid-execution, THE LocalGitModule SHALL cleanup partial directory |
| GIT-CLONE-B1 | WHEN clone option `depth=1` set, THE LocalGitModule SHALL perform shallow clone |
| GIT-CLONE-B2 | WHEN clone completes, THE LocalGitModule SHALL return without storing token in any file |
| ONPREM-A1 | WHEN `npx gitgov onboard --yes` ejecutado en mac/linux/windows fresh, THE SYSTEM SHALL completar setup sin intervención humana adicional |
| ONPREM-A2 | WHEN `gitgov run` ejecutado, THE SYSTEM SHALL arrancar embedded postgres + API + UI + worker en mismo proceso Node.js |
| ONPREM-A3 | WHEN scan triggered on-prem, THE OnPremScanWorker SHALL use LocalGitModule.clone() not API |
| ONPREM-A4 | WHEN scan completes on-prem, THE worker SHALL cleanup temp clone directory |
| ONPREM-A5 | WHEN telemetry prompt shown, IF user declines, THE worker SHALL never send beacons |
| NPX-A1 | WHEN onboard ejecutado primera vez, THE SYSTEM SHALL descargar postgres binary via embedded-postgres package y cachear |
| NPX-A2 | WHEN onboard ejecutado segunda vez (re-onboard), THE SYSTEM SHALL detectar cluster existente y NO re-inicializar |
| NPX-A3 | WHEN onboard finished, THE SYSTEM SHALL haber generado: AUTH_SECRET, MASTER_KEY, config.json, db cluster, applied migrations |
| NPX-A4 | WHEN run ejecutado pre-onboard, THE SYSTEM SHALL fallar con mensaje claro sugiriendo `gitgov onboard --yes` |
| NPX-A5 | WHEN doctor ejecutado, THE SYSTEM SHALL ejecutar 9 checks y mostrar pass/fail por cada uno |
| NPX-A6 | WHEN run starts, THE SYSTEM SHALL aplicar migrations Prisma pendientes con confirmación user (o `--yes`) |
| NPX-A7 | WHEN Ctrl+C recibido, THE SYSTEM SHALL graceful shutdown (worker drain, db close, exit 0) |
| NPX-A8 | WHEN package publish to npm, THE binary `gitgov` SHALL ser ejecutable via `npx gitgov` sin install global |
| TELEM-A1 | WHEN telemetry enabled, THE beacon SHALL contain ONLY: version, OS, scan_count, error_count_anonymized |
| TELEM-A2 | WHEN telemetry beacon sent, THE payload SHALL NOT contain code content, file paths, or identifiable data |
| LANDING-A1 | WHEN gitgov.com loaded, THE landing SHALL display: hero, install CTA, pricing (Free + $49/mo), docs link |
| LANDING-A2 | WHEN install CTA clicked, THE flow SHALL initiate GitHub App installation |
| LLMS-TXT-A1 | WHEN GET https://gitgov.com/llms.txt, THE SYSTEM SHALL servir archivo siguiendo formato llmstxt.org |
| LLMS-TXT-A2 | WHEN LLM (Claude/ChatGPT) consume llms.txt, THE LLM SHALL ser capaz de instruir instalación correcta vía `npx gitgov onboard --yes` |
| DEPLOY-A1 | WHEN push to main, THE GitHub Actions SHALL build images and deploy to Cloud Run |
| DEPLOY-A2 | WHEN deploy fails, THE Cloud Run SHALL maintain previous revision with traffic |
| CLI-LOGIN-A1 | WHEN `gitgov login http://localhost:3000`, THE CLI SHALL authenticate against local on-prem instance |
| CLI-LOGIN-A2 | WHEN `gitgov login https://gitgov.com`, THE CLI SHALL authenticate against hosted SaaS |

---

## Scope estimado

**Packages afectados:**
- `packages/core/` (clone interface + LocalGitModule)
- `packages/saas-worker/` (on-prem worker in-process, telemetría)
- `packages/saas-web/` (landing, pricing component, llms.txt en `public/`)
- `packages/cli/` (login URL flexibility)
- `packages/cli-onprem/` (NUEVO — distribución vía npx)
- Repo root (Dockerfiles, docker-compose como alt, infra, docs)

**Trabajo nuevo:**
- 3 Dockerfiles para Cloud Run (saas-api, saas-web, saas-worker)
- 1 docker-compose.yml + .env.example (alternativa secundaria)
- Cloud Run config (3 servicios) + Secret Manager + DNS + TLS
- GitHub Actions deploy workflow
- `IGitModule.clone()` interface + LocalGitModule implementation + tests
- OnPremScanWorker in-process (o flag en ScanWorker existente)
- Telemetría on-prem (saas-worker)
- **Package nuevo `cli-onprem`** con comandos: onboard, run, doctor, configure
- **Wrapper sobre `embedded-postgres` package**
- **Migrations runner Prisma para on-prem**
- **Static UI export integration**
- **Single-process bootstrap (NestJS + Express/Fastify + worker loop)**
- Landing en `packages/saas-web/src/app/page.tsx`
- Componente de pricing
- ~6 docs (quickstart hosted, on-prem, protocol, agents, three-gates, CLI, FAQ)
- **`gitgov.com/llms.txt`** siguiendo estándar llmstxt.org
- Tests E2E para path on-prem (`npx gitgov` flow)

**Trabajo que NO se hace (anti-objetivos):**
- 0 trabajo en Cycle 5 saas_base — POSPUESTO
- 0 trabajo en Cycle 6 saas_base — POSPUESTO
- 0 trabajo en KMS — APARCADO
- 0 trabajo en marketplace — APARCADO
- 0 trabajo en GitLab — Fuera de scope
- 0 trabajo en SSO/SAML — Fuera de scope
- 0 trabajo en Stripe billing automatizado — Fuera de scope MVP
- 0 migración del path SaaS hosted a clone-based — Decisión arquitectónica

**Riesgo:** **Medio-Alto**.

Riesgos identificados:
1. **Cloud Run config errors causan downtime durante setup.** Mitigación: staging environment, gradual rollout.
2. **`IGitModule.clone()` introduce regresiones en LocalGitModule existente.** Mitigación: tests exhaustivos, no modificar otros métodos existentes.
3. **`embedded-postgres` package tiene bugs en algún OS específico (Windows ARM, exotic linux).** Mitigación: validar en mac/linux/windows fresh antes de docs publicar. Si Windows ARM falla, documentar limitación.
4. **`npx gitgov` colisión de nombres en npm registry.** Mitigación: verificar disponibilidad temprano (Día 1). Alternativas: `gitgovai`, `gitgovernance`, `gitgov-cli`.
5. **Static UI export de Next.js no soporta features dinámicas que usamos.** Mitigación: review temprano de qué features de Next requieren server-side. Si conflicto, usar Next standalone output mode (server.js auto-contenido).
6. **Embedded postgres no arranca en mac M1/M2 por incompatibilidad ARM.** Mitigación: verificar binarios disponibles en npm package. `embedded-postgres` soporta arm64 desde v17.x.
7. **Smoke test descubre bugs cross-cutting.** Mitigación: scope limit, fixes mayores bloquean release tag pero menores se documentan como inputs.
8. **DNS + TLS issues con gitgov.com.** Mitigación: comprar dominio temprano, configurar Cloudflare DNS con propagación rápida.
9. **Postgres connection issues con Cloud Run concurrency (path SaaS hosted).** Mitigación: connection pooling vía Supabase Pro o PgBouncer.

**Esfuerzo:** **4-6 semanas de trabajo focalizado**:
- Semana 1: Dockerfiles + Cloud Run setup
- Semana 2: Postgres + DNS + Smoke local
- Semana 3: Smoke producción + Landing
- Semana 4: `IGitModule.clone()` + on-prem worker
- Semana 5: docker-compose + README on-prem
- Semana 6: Documentación pública + smoke E2E final

Si surgen problemas de infraestructura (DNS, TLS, Cloud Run errors), +1-2 semanas.

**Dependencias externas:**
- GCP project con billing habilitado
- Dominio `gitgov.com` (comprar si no existe)
- Postgres managed (Supabase Pro o Cloud SQL)
- Cloud DNS o Cloudflare configurado
- GitHub App pre-configurada (production credentials)
- Tokens válidos para CI/CD (GCP service account, GitHub Actions secrets)

---

## Prioridad

**Alta** — es el deliverable principal del MVP comercial. Sin Release v1 shipped, no hay producto que vender ni que pilotear. Bloque D (pilot_validation) depende directamente de este.

Razones:

1. **Sin gitgov.com vivo, no hay producto comercial.** Tracking interno con localhost no escala a usuarios externos.
2. **On-prem desbloquea segmento enterprise futuro.** Aunque el MVP no es enterprise, tener docker-compose disponible significa que cuando un cliente regulado pregunte "¿on-prem?", la respuesta es "sí, instalalo en 5 min".
3. **Documentación pública es prerequisito de tracción.** Sin docs seguibles, cada usuario externo requiere asistencia de Camilo, lo que no escala.
4. **Smoke test producción valida producto end-to-end.** Si Camilo no puede usar su propio producto en producción real, no se puede vender.
5. **Trabajo conocido y delimitado.** Aunque tiene riesgo de DevOps, no hay incertidumbre de scope — todas las decisiones técnicas están tomadas.

**Anti-objetivos explícitos (no hacer durante este bloque):**

- ❌ NO migrar SaaS hosted a clone-based (sigue API-only)
- ❌ NO añadir KMS — env var documentado como deuda
- ❌ NO crear marketplace de packs
- ❌ NO añadir GitLab support
- ❌ NO añadir SSO/SAML
- ❌ NO automatizar billing con Stripe (manual via link OK)
- ❌ NO abrir Cycle 5 saas_base (Project Creation from SaaS)
- ❌ NO abrir Cycle 6 saas_base (compliance packs)
- ❌ NO crear reportes pre-empaquetados PCI/SOC2/GDPR (`gitgov lint` sirve)
- ❌ NO modificar adapter pattern existente (LocalGitModule, GitHubGitModule, FsRecordStore, GitHubRecordStore) más allá de añadir clone()
- ❌ NO añadir features no documentadas en este input
- ❌ NO automatizar outreach durante Release v1 (eso es Bloque D)
- ❌ NO esperar a tener todo "perfecto" para lanzar — primer cliente pagando puede llegar antes que el último doc esté pulido
- ❌ NO hacer del path docker-compose el primario para on-prem — el primario es `npx gitgov`
- ❌ NO eliminar docker-compose.yml — se mantiene como alternativa secundaria documentada
- ❌ NO usar SQLite en lugar de embedded postgres — mismo motor que prod es decisión arquitectónica
- ❌ NO requerir Docker como pre-requisito para path on-prem primario

---

**Notas para el `epic_designer` que procese este input:**

1. Esta epic tiene 3 sub-bloques (C.1 SaaS hosted, C.2 on-prem vía npx, C.3 docs). Modelar como 3 cycles del epic `release_v1`.
2. C.1 y C.2 pueden parcialmente paralelizarse (C.2 requiere `clone()` que es independiente del deploy de C.1), pero la integración final (smoke test) requiere ambos.
3. EARS técnicas (GIT-CLONE-A*, ONPREM-A*, NPX-A*, TELEM-A*, LLMS-TXT-A*, etc.) sí deben modelarse formalmente porque hay código nuevo a implementar.
4. EARS de DevOps (DEPLOY-A*, LANDING-A*) son acceptance criteria, no requirements técnicos formales.
5. La epic depende explícitamente del cierre de `audit_mvp_close` (gate_product + saas_base). El `dependency_auditor` debe validar que esa epic está cerrada antes de empezar.
6. Las decisiones arquitectónicas (Supabase vs Cloud SQL, Cloud Run config, **`npx gitgov` como path primario on-prem siguiendo modelo Paperclip**, embedded postgres vs SQLite, etc.) ya están tomadas — el `epic_designer` NO debe re-abrir esas decisiones, solo materializarlas.
7. **Referencia técnica clave**: el patrón de distribución es modelado de Paperclip (`paperclipai`, https://paperclip.ing). Stack equivalente: `embedded-postgres` package (Rocket Software), `@clack/prompts` para wizard, Prisma migrate deploy para migrations, Next.js export para static UI, single Node.js process para todo. Estudiar el log de `npx paperclipai onboard` y `paperclipai run` para entender DX target.
8. **Referencia adicional**: el formato `llms.txt` está documentado en https://llmstxt.org. Ejemplo real en `https://paperclip.ing/llms.txt`.
