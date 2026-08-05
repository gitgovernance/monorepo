# Input: Marketplace Sandbox — Aislamiento de third-party agents

> Documento de input para futura epic. APARCADO — no procesar hasta que se cumplan triggers documentados al final del documento.

**Fecha:** 2026-05-08
**Autor:** humano:camilo (founder) + agent:claude-opus-4-7 (consultoría estratégica)
**Origen:** sesión estratégica gitgov pivot — pregunta del usuario "¿qué es Sandbox para third-party agents?"
**Sesión:** post-decisión "marketplace queda como north star a 6 meses, no estrategia inmediata"
**Prioridad:** **Baja** (aparcado — solo se reactiva cuando se cumplen triggers explícitos)
**Relacionado con:** `gitgov_install_packs_input.md` (visión de marketplace original), `release_v1_input.md` (que NO incluye marketplace en MVP)
**Destino:** Epic futura — sin nombre asignado todavía, sugerencia `marketplace_sandbox` cuando se reactive

---

## Problema (captura)

Cuando GitGov tenga marketplace público de agents (`@acme/sast-scanner`, `@org/license-checker`, `@vendor/dependency-audit`, etc.), código de terceros va a correr en infraestructura del cliente o de GitGov SaaS hosted. Esto introduce un vector de ataque significativo:

```
HOY (sin marketplace):
  Solo agents oficiales corren en infra:
    - @gitgov/agent-security-audit (Camilo controla código)
    - @gitgov/agent-review-advisor (Camilo controla código)
    - @gitgov/agent-license-check (Camilo controla código)
  Riesgo: bajo. Camilo audita el código antes de release.

MAÑANA (con marketplace público):
  Cualquier agent de terceros puede correr en infra del cliente:
    - @acme/sast-scanner (Acme controla código, GitGov no audita)
    - @random_dev/cool-tool (developer aleatorio publica)
    - @malicious_actor/innocent-name (impostor publica algo malicioso)
  Riesgo: alto.
    - Si el agent es malicioso → lee MASTER_KEY, lee tokens GitHub, exfiltra código fuente
    - Si el agent tiene bug → corrompe records, salta findings, infinite loop
    - Si el agent abusa recursos → tira el worker, afecta a otros tenants
```

**Decisión clave del usuario (2026-05-08):** Marketplace queda como "north star a 6 meses, no estrategia". Este input documenta el problema técnico para que cuando se decida abrir marketplace, el sandbox NO se diseñe ad-hoc bajo presión.

**Estado actual de aislamiento:** Ninguno. Los agents corren en el mismo proceso Node.js que el worker, con acceso completo a:
- Sistema de archivos (FS)
- Variables de entorno (incluyendo MASTER_KEY si existe)
- Network (cualquier endpoint externo)
- Postgres (vía connection pool compartido)
- GitHub API tokens

Esto es seguro hoy porque solo corren agents oficiales. Cuando se abra a third-party, este modelo no es viable.

---

## Diagramas

### Modelo actual vs modelo necesario para marketplace

```
HOY: Agents oficiales en mismo proceso

┌──────────────────────────────────────────────────┐
│ saas-worker (Node.js process)                    │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ ScanModule                                  │ │
│  │  ├── @gitgov/agent-security-audit           │ │
│  │  ├── @gitgov/agent-review-advisor           │ │
│  │  └── @gitgov/agent-license-check            │ │
│  │                                             │ │
│  │  Acceso compartido a:                       │ │
│  │   - process.env (MASTER_KEY, tokens, etc.)  │ │
│  │   - FS                                      │ │
│  │   - Network                                 │ │
│  │   - Postgres pool                           │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
Riesgo: Bajo. Camilo audita todos los agents.


MAÑANA: Agents de terceros sandboxeados

┌──────────────────────────────────────────────────┐
│ saas-worker (Node.js process)                    │
│                                                  │
│  ┌─────────────────────────────────────────────┐ │
│  │ ScanModule (host)                           │ │
│  │  - Lee MASTER_KEY, tokens                   │ │
│  │  - Maneja Postgres                          │ │
│  │  - Coordina agents (NO ejecuta código de    │ │
│  │    terceros directamente)                   │ │
│  └─────────────────────────────────────────────┘ │
│                       │                          │
│                       ▼                          │
│  ┌─────────────────────────────────────────────┐ │
│  │ Sandbox runtime (gVisor / Firecracker /     │ │
│  │ WASM / Node Permission Model)               │ │
│  │                                             │ │
│  │  ┌─────────────────────────────────────────┐│ │
│  │  │ Agent process aislado                   ││ │
│  │  │  - Solo recibe input via stdin/IPC      ││ │
│  │  │  - Solo retorna output via stdout/IPC   ││ │
│  │  │  - SIN acceso a process.env del host    ││ │
│  │  │  - SIN acceso a FS fuera de su sandbox  ││ │
│  │  │  - Network restringido (si necesario)   ││ │
│  │  │  - Memory + CPU limits                  ││ │
│  │  │  - Timeout obligatorio                  ││ │
│  │  └─────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
Riesgo: Mitigado. Agent malicioso solo accede a su sandbox.
```

### Comparación de opciones de sandbox

```
┌─────────────────┬──────────┬──────────┬──────────┬──────────────────────┐
│                 │ Aislamiento│ Performance│ Setup    │ Compatibilidad     │
├─────────────────┼──────────┼──────────┼──────────┼──────────────────────┤
│ gVisor          │ Alto     │ Medio    │ Medio    │ Linux, container-based│
│                 │          │          │          │ Google-maintained    │
├─────────────────┼──────────┼──────────┼──────────┼──────────────────────┤
│ Firecracker     │ Muy alto │ Bueno    │ Alto     │ Linux KVM           │
│                 │ (microVM)│          │          │ AWS Lambda usa esto  │
├─────────────────┼──────────┼──────────┼──────────┼──────────────────────┤
│ WASM (Wasmtime) │ Alto     │ Excelente│ Bajo     │ Cross-platform       │
│                 │          │          │          │ Pero agents deben    │
│                 │          │          │          │ compilarse a WASM    │
├─────────────────┼──────────┼──────────┼──────────┼──────────────────────┤
│ Node Permission │ Bajo-    │ Excelente│ Muy bajo │ Solo Node 20+        │
│ Model           │ Medio    │          │          │ No aísla CPU/memory  │
│                 │          │          │          │ Solo FS/network      │
├─────────────────┼──────────┼──────────┼──────────┼──────────────────────┤
│ Container       │ Medio    │ Bueno    │ Bajo     │ Docker disponible    │
│ por-agent       │          │          │          │ Overhead alto si     │
│                 │          │          │          │ muchos agents        │
└─────────────────┴──────────┴──────────┴──────────┴──────────────────────┘
```

---

## Propuesta

**Esta es propuesta APARCADA.** No se ejecuta hasta que triggers documentados al final se cumplan. La propuesta detalla los caminos posibles para que cuando llegue el momento, la decisión sea informada y no ad-hoc.

### Camino 1 (recomendado para fase inicial de marketplace) — WASM con Wasmtime

**Características:**
- Aislamiento alto via WebAssembly sandbox
- Performance excelente (overhead <10%)
- Cross-platform (mac, linux, windows)
- Setup simple (Wasmtime tiene Node bindings)
- Limitación: agents deben compilarse a WASM (Rust, AssemblyScript, Go con tinygo, C++)

**Cuándo conviene:**
- Marketplace inicial con N agents oficiales convertidos a WASM
- Agents simples (analizar código, no necesitan acceso a FS amplio)
- Latency crítica (WASM es muy rápido)

**Limitaciones:**
- Agents en Python/Ruby/JS no nativamente soportados (requieren porting)
- WASI maduro pero no todos los syscalls disponibles
- Network desde WASM requiere configuración explícita

### Camino 2 (recomendado para marketplace maduro) — gVisor o Firecracker

**Características:**
- Aislamiento muy alto (kernel separado)
- Compatibilidad total con código existente (cualquier lenguaje)
- Performance bueno (microVM o kernel intercept)
- Setup complejo (Linux KVM, container orchestration)

**Cuándo conviene:**
- Marketplace con cientos/miles de agents en lenguajes diversos
- Agents que requieren FS, network, o syscalls amplios
- Modelo de suscripción enterprise (justifica overhead de infra)

**Limitaciones:**
- Solo Linux (no on-prem en Mac/Windows nativo)
- Setup operacional alto
- Costo de infra mayor

### Camino 3 (descartado) — Node Permission Model

**Características:**
- Built-in en Node 20+
- Aislamiento limitado: FS y network, pero NO memory/CPU
- Solo aplica a Node, no a agents en otros lenguajes

**Cuándo conviene:**
- NO conviene como solución principal de marketplace
- Puede ser DEFENSE IN DEPTH adicional dentro de gVisor/WASM, pero no reemplaza

**Por qué descartado como solución principal:**
- No aísla CPU (un agent malicioso puede hacer infinite loop y tirar el worker)
- No aísla memory (puede consumir toda la RAM)
- Solo soporta Node — limita el marketplace a agents JavaScript

### Camino 4 (intermedio) — Container por-agent

**Características:**
- Cada agent corre en su propio Docker container
- Aislamiento medio (kernel compartido pero namespaces separados)
- Compatibilidad total con código existente
- Setup simple (Docker es ubicuo)

**Cuándo conviene:**
- Marketplace mid-scale (10-100 agents)
- On-prem deployments (Docker disponible siempre)
- Bajo riesgo de tenant cruzado (cada cliente tiene su propio worker)

**Limitaciones:**
- Overhead de spawn de container (latency en cold start)
- Si muchos agents corren paralelos, overhead acumulado alto
- Aislamiento menor que microVM (kernel compartido)

### Recomendación condicional (cuando se reactive)

**Si marketplace inicial:** Camino 1 (WASM con Wasmtime). Razón: arrancar con N agents oficiales convertidos a WASM, validar adopción, expandir.

**Si marketplace maduro o enterprise on-prem:** Camino 2 (gVisor para SaaS hosted, Firecracker si latency crítica).

**Si urgencia y on-prem prioritario:** Camino 4 (container por-agent) como bridge mientras se evalúa Camino 1 o 2.

**NUNCA:** Camino 3 (Node Permission Model) como solución única.

---

## Archivos clave (cuando se reactive)

| Área | Path probable | Qué contendría |
|------|---------------|----------------|
| Agent runtime interface | `packages/core/src/agent/runtime.ts` | NUEVO — interface IAgentRuntime con métodos execute, validate, terminate |
| WASM runtime adapter | `packages/agent-runtime-wasm/` | NUEVO package — implementación con Wasmtime |
| gVisor runtime adapter | `packages/agent-runtime-gvisor/` | NUEVO package — implementación con runsc |
| Container runtime adapter | `packages/agent-runtime-docker/` | NUEVO package — implementación con dockerode |
| Agent metadata schema | `packages/core/src/agent/metadata.ts` | NUEVO — schema de manifest.json del agent (similar a package.json) |
| Agent signing | `packages/core/src/agent/signing.ts` | NUEVO — firma Ed25519 del agent + verificación |
| Marketplace registry | TBD | NUEVO — registry público de agents (puede ser GitHub-based o servicio dedicado) |

**Archivos que NO se tocan en este input:** ninguno todavía, porque el input está aparcado. Cuando se reactive, los EARS específicos se escribirán como Brief completo.

---

## Plan paso a paso (cuando se reactive)

**Este plan NO se ejecuta hoy.** Es plantilla de cuando se cumplan triggers.

**Fase 0 — Decisión de camino (1 sesión)**

1. Revisar este input y los triggers cumplidos
2. Decidir Camino 1, 2, o 4 basado en estado del marketplace y prioridades
3. Si Camino 2 elegido: validar disponibilidad de Linux KVM en infra (Cloud Run usa gVisor automáticamente; Firecracker requiere setup)
4. Documentar decisión en epic acta

**Fase 1 — Interface y abstracción (~1 semana)**

5. Definir `IAgentRuntime` interface con métodos: `loadAgent()`, `execute()`, `terminate()`
6. Implementar `LocalAgentRuntime` (no sandbox, para tests)
7. Implementar runtime elegido (WASM, gVisor, container)
8. Tests unitarios + integración

**Fase 2 — Agent metadata y signing (~1 semana)**

9. Definir schema de manifest.json (capabilities required, signature, version)
10. Implementar firma Ed25519 del agent
11. Implementar verificación al cargar agent
12. Validación: agent malicioso con manifest manipulado falla verificación

**Fase 3 — Resource limits y monitoring (~1 semana)**

13. Implementar memory limits (configurables por tier)
14. Implementar CPU limits / timeout
15. Implementar network policy (allowed domains list)
16. Implementar logging estructurado de cada execution

**Fase 4 — Marketplace registry MVP (~2 semanas)**

17. Decidir hosting: GitHub-based vs servicio dedicado
18. Implementar publish flow para developers (`gitgov agent publish`)
19. Implementar discovery (`gitgov agent search`, `gitgov agent install`)
20. Implementar review process (manual al inicio, automated después)

**Fase 5 — Pilot con agents externos (~2-4 semanas)**

21. Invitar 3-5 partners para crear agents externos
22. Ejecutar pilots con sus agents en sandbox
23. Iterar sobre fricciones encontradas
24. Documentar guidelines para agent developers

**Total estimado:** 7-10 semanas si todo va bien.

---

## Verificación (cuando se reactive)

Comandos de verificación dependen del camino elegido. Plantilla:

```bash
# 1. Agent runtime instalado
gitgov agent runtime status
# Debe mostrar: runtime activo (wasm/gvisor/docker)

# 2. Agent malicioso es detectado
# Test: agent que intenta leer process.env.MASTER_KEY
gitgov agent run @test/malicious-env-reader
# Debe retornar: error "permission denied" o similar

# 3. Resource limits funcionan
# Test: agent con infinite loop
gitgov agent run @test/infinite-loop --timeout=5s
# Debe terminar en 5s con error

# 4. Memory limit funciona
# Test: agent que consume 10GB
gitgov agent run @test/memory-bomb --memory=512MB
# Debe terminar con OOM

# 5. Firma del agent verificada
# Test: agent con firma manipulada
gitgov agent run @test/forged-signature
# Debe retornar: error "signature verification failed"

# 6. Network policy aplicada
# Test: agent que intenta exfiltrar a evil.com
gitgov agent run @test/exfiltrator
# Debe retornar: error "network access denied"
```

---

## Preguntas de comprensión

### Comprensión (must-pass — cuando se reactive)

**[1] ¿Por qué el marketplace requiere sandbox y no puede simplemente "confiar en el código de terceros"?**
hint: Sección "Problema". El código de terceros corre en infra del cliente con acceso a MASTER_KEY, tokens GitHub, FS, network. Sin sandbox, un agent malicioso (intencional o por bug) puede exfiltrar datos críticos, corromper records, o tirar el worker.

**[2] ¿Cuál es el trigger para empezar a trabajar en este input?**
hint: Sección "Triggers para reactivar". El input está aparcado hasta que se cumpla AL MENOS UNO de los triggers documentados. Sin trigger, NO hacer trabajo proactivo de sandbox.

**[3] ¿Qué se TOCA y qué NO se toca cuando se reactive?**
hint: Sección "Archivos clave". SE TOCA: nuevos packages para agent-runtime, schema de manifest, signing. NO SE TOCA: agents existentes oficiales (siguen funcionando como hoy), arquitectura de saas-worker actual (sandbox se añade como capa adicional).

### Profundización (weighted — entender el diseño)

**[4] ¿Por qué Node Permission Model está descartado como solución principal?**
hint: Sección "Camino 3 (descartado)". No aísla CPU ni memory (un infinite loop tira el worker). Solo soporta Node — limita marketplace a JavaScript. Puede ser defense in depth adicional pero no reemplaza sandbox real.

**[5] ¿Qué diferencia hay entre WASM, gVisor, y Firecracker en términos de aislamiento?**
hint: Sección "Comparación de opciones". WASM: sandbox de bytecode (alto aislamiento, pero agents deben compilarse a WASM). gVisor: kernel intercept (alto aislamiento, compatibilidad amplia). Firecracker: microVM (muy alto aislamiento, kernel separado, mejor para multi-tenant).

**[6] ¿Por qué WASM es recomendado para marketplace inicial pero no maduro?**
hint: Sección "Recomendación condicional". WASM tiene excelente aislamiento + performance, pero limita agents a lenguajes que compilan a WASM (Rust, AssemblyScript, Go con tinygo). Para marketplace maduro con cientos de agents en Python/Ruby/etc, gVisor o Firecracker es necesario.

### Verificación (bonus — confirmar scope)

**[7] ¿Qué pasa si un developer publica un agent con signing manipulado?**
hint: Sección "Plan paso a paso → Fase 2". Cada agent tiene firma Ed25519 sobre su manifest + bundle. Verificación falla si signing manipulado. Agent NO se carga, error retornado al usuario.

**[8] ¿Qué pasa si un agent legítimo tiene un bug que consume mucha memoria?**
hint: Sección "Plan paso a paso → Fase 3". Resource limits aplicados (memory, CPU, timeout). Bug causa OOM dentro del sandbox, NO afecta al worker host. Logging captura el evento, agent puede ser reportado o suspendido.

---

## EARS estimados (preliminares — pueden cambiar al reactivar)

| ID | Requisito |
|----|-----------|
| MS-A1 | WHEN third-party agent loaded, THE SYSTEM SHALL execute it in isolated runtime (WASM/gVisor/container) |
| MS-A2 | WHEN agent attempts to read process.env, THE SANDBOX SHALL block and return permission denied |
| MS-A3 | WHEN agent attempts FS access outside its sandbox, THE SANDBOX SHALL block and return permission denied |
| MS-A4 | WHEN agent attempts network access to non-allowlisted domain, THE SANDBOX SHALL block |
| MS-A5 | WHEN agent execution exceeds timeout, THE SANDBOX SHALL terminate it gracefully |
| MS-A6 | WHEN agent execution exceeds memory limit, THE SANDBOX SHALL terminate with OOM error |
| MS-B1 | WHEN agent loaded, THE SYSTEM SHALL verify Ed25519 signature against publisher's public key |
| MS-B2 | WHEN signature verification fails, THE SYSTEM SHALL refuse to load agent |
| MS-B3 | WHEN agent manifest invalid, THE SYSTEM SHALL refuse to load |
| MS-C1 | WHEN agent published to marketplace, THE registry SHALL store: bundle, manifest, signature, version |
| MS-C2 | WHEN user installs agent, THE SYSTEM SHALL fetch from registry, verify signature, register locally |
| MS-D1 | WHEN agent execution completes, THE SYSTEM SHALL log structured: agent_id, version, duration, resource_usage, exit_code |
| MS-D2 | WHEN agent crashes, THE SYSTEM SHALL capture stack trace and report to monitoring |

---

## Scope estimado (cuando se reactive)

**Packages afectados (NUEVOS):**
- `packages/agent-runtime-wasm/` (Camino 1)
- `packages/agent-runtime-gvisor/` (Camino 2)
- `packages/agent-runtime-docker/` (Camino 4)
- Modificaciones a `packages/saas-worker/` para integrar runtime

**Trabajo nuevo:**
- Interface IAgentRuntime + 1-3 implementaciones (camino elegido)
- Schema de manifest + validación
- Firma + verificación Ed25519
- Resource limits (memory, CPU, timeout, network policy)
- Logging y monitoring de agent execution
- Marketplace registry MVP (GitHub-based o servicio dedicado)
- CLI commands: `gitgov agent publish`, `search`, `install`, `run`
- Tests unitarios + integración + adversariales (agents maliciosos)

**Riesgo:** **Alto** (security-critical work).

Riesgos identificados (cuando se reactive):
1. **Sandbox escape:** un agent malicioso encuentra vulnerabilidad y escapa al host. Mitigación: defense in depth, regular security audits, bug bounty.
2. **Performance overhead:** sandbox añade latency suficiente para empeorar UX. Mitigación: benchmarking continuo, elegir camino con balance overhead/aislamiento.
3. **Compatibilidad limitada:** developers no pueden compilar sus agents al runtime elegido. Mitigación: documentación clara, ejemplos, build tools.
4. **Falsos positivos en signature verification:** agents legítimos rechazados por bugs en verifier. Mitigación: tests exhaustivos, monitoring.

**Esfuerzo:** **7-10 semanas** dedicadas.

**Dependencias:** marketplace registry decidido + arquitectura validada.

---

## Prioridad

**Baja** — APARCADO. Razones:

1. **No hay marketplace todavía.** Sin marketplace, no hay third-party agents corriendo. Sin third-party agents, no hay vector de ataque que mitigar.
2. **MVP de Audit no incluye marketplace.** Bloque C (release_v1) explícitamente lo excluye.
3. **Trabajo significativo (7-10 semanas) requiere justificación de mercado.** Construir sandbox sin marketplace usuarios es over-engineering.
4. **Decisiones técnicas no urgentes.** WASM, gVisor, Firecracker maduran constantemente — esperar es ventaja, no costo.

**Triggers para reactivar (al menos UNO debe cumplirse):**

🟢 **Trigger 1 — Decisión estratégica de abrir marketplace:**
- Usuario decide explícitamente "vamos a abrir marketplace de third-party agents en próximos N meses"
- Plan de marketplace tiene fecha de launch definida
- Pre-requisito de marketplace launch es sandbox

🟢 **Trigger 2 — Cliente de pilot pide ejecutar su propio agent:**
- Pilot partner dice "queremos correr nuestro propio agent dentro de GitGov"
- Decisión: aceptar (requiere sandbox) o rechazar (mantener marketplace cerrado)
- Si se acepta, sandbox se vuelve prerequisito

🟢 **Trigger 3 — Vulnerabilidad descubierta en agents oficiales:**
- Auditoría de seguridad descubre que MASTER_KEY o tokens son legibles desde agent process
- Aunque agents oficiales sean confiables, defense in depth justifica sandbox
- Trigger raro pero posible

🟢 **Trigger 4 — Cliente enterprise pide aislamiento:**
- Compliance requirement explícito: "los workloads deben estar aislados"
- Cliente dispuesto a pagar por feature
- ROI justifica trabajo

🟢 **Trigger 5 — Architectural review periódico decide reactivar:**
- Revisión cuatrimestral del backlog evalúa: ¿el costo de NO tener sandbox supera el costo de implementarlo?
- Si la respuesta es sí → reactivar

**Anti-objetivos explícitos (no hacer mientras esté aparcado):**

- ❌ NO diseñar `IAgentRuntime` proactivamente (over-engineering sin caso de uso)
- ❌ NO migrar agents oficiales a WASM proactivamente (no hay benefit hoy, son confiables)
- ❌ NO construir marketplace registry hasta tener sandbox decidido
- ❌ NO aceptar third-party agents sin sandbox solo porque "el cliente confía"
- ❌ NO procesar este input para ejecución mientras esté en estado "aparcado"
- ❌ NO mezclar este trabajo con Bloque C (release_v1) — son completamente independientes

---

**Notas para el `epic_designer` que procese este input (cuando se reactive):**

1. Esta epic es de **alto riesgo de seguridad** — requiere security review formal antes de ship.
2. Modelar como 5 fases (decisión, interface, signing, limits, marketplace, pilot) NO cycles.
3. EARS deben incluir tests adversariales explícitos (agents maliciosos intentando escape, exfiltration, DoS).
4. El input vive en `specs/epics/inputs/` con label "aparcado" hasta que triggers se cumplan.
5. Cada 4 semanas, durante el architectural review, evaluar si triggers se cumplieron.
6. Si triggers se cumplen: actualizar el input con evidencia del trigger, cambiar label a "active", y entonces SÍ crear epic con el plan documentado.
7. Cuando se reactive, decidir camino (WASM/gVisor/Firecracker/container) ANTES de empezar implementación. Cambiar de camino mid-flight es muy costoso.
8. NO procesar este input para ejecución mientras esté aparcado. Si un agente sugiere "hacer un POC de WASM para flexibilidad futura", parar — eso es over-engineering sin justificación.
