# Input: Pilot Validation — 3-5 design partners reales antes del anuncio público

> Documento de input para futura epic. NO es un blueprint ni una spec — es contexto para que el `epic_designer` cree la epic formal.

**Fecha:** 2026-05-08
**Autor:** humano:camilo (founder) + agent:claude-opus-4-7 (consultoría estratégica)
**Origen:** sesión estratégica gitgov pivot — decisión "design partners reales antes del anuncio público"
**Sesión:** post-decisión "estructura del pivote a Provenance"
**Prioridad:** **Alta** (es la única forma de validar product-market fit antes de invertir 12 meses en content marketing para el pivote a Provenance)
**Relacionado con:** `release_v1_input.md` (prerequisito — necesita Audit MVP shipped), `triad_oss_launch_input.md` (paralelo, Triad community es feeder potencial de pilots), `gate_product_saas_base_close_input.md` (prerequisito indirecto)
**Destino:** Epic nueva — sugerencia de nombre `pilot_validation`

---

## Problema (captura)

Una vez que Audit MVP esté shipped (gitgov.com vivo + on-prem disponible), tenemos un producto técnicamente funcional pero sin validación de uso real. Necesitamos design partners reales que:

1. **Usen el producto en su contexto real** (no solo demos curated por Camilo)
2. **Den feedback estructurado** sobre qué funciona, qué falta, qué es confuso
3. **Validen si la propuesta de valor resuena** o si necesitamos ajustar narrativa
4. **Sirvan como research de mercado para el pivote a Provenance** — la pregunta clave embebida en cada conversación: *"¿qué hacés cuando Claude Code o Copilot escribe código en tu equipo?"*

**Estado de partida:** Camilo tiene runway de 50k de ahorros + <1k/mes de gastos vivendo en Bangkok. Software factory paga el runway. El objetivo NO es maximizar ingresos rápido; es construir algo sostenible que aporte valor.

**Restricciones autoimpuestas (decididas por usuario):**
- **NO automatización de outreach** — LinkedIn DMs, GitHub stars masivos, cold email automatizado están descartados (violan TOS y producen ruido sin señal)
- **NO marketing público antes de tener pilots reales** — anunciar producto sin tracción atrae trolls, no clientes
- **NO pilots de "AI agent provenance" todavía** — el mercado no está educado, los pilots son de Audit (gancho probado: AI-assisted coding governance)
- **NO presión por pricing** — primer batch de design partners puede ser gratis a cambio de feedback estructurado

**El reto principal del bloque:** Sin equipo de sales, sin presupuesto de marketing, sin tracción inicial. Lo que tenemos es: red personal de Camilo (~10 años en software factory), Triad como wedge de adopción top of funnel, y producto técnicamente sólido. La estrategia es **founder-led sales con conversaciones de alta calidad, no volumen**.

---

## Diagramas

### Estructura del bloque por fases

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  FASE 0: Listening (Semana 5-6)                                    │
│  ─────────────────────────────                                     │
│  - Identificar 5-10 candidatos en red personal de Camilo           │
│  - Contactar manualmente con email/DM personal                     │
│  - Conversación de 30-45 min con foco en discovery                 │
│  - Pregunta clave: "¿qué hacés cuando Claude Code/Copilot          │
│    escribe código en tu equipo?"                                   │
│  - Goal: 5 candidatos contactados, 3+ aceptan exploración          │
│                                                                    │
└─────────────────────────────┬──────────────────────────────────────┘
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  FASE 1: Frictionless Onboarding (Semana 6-7)                      │
│  ─────────────────────────────────────────                         │
│  - 3 personas externas hacen primer scan en <5 min sin ayuda       │
│  - Camilo observa silencioso (screen share o async video)          │
│  - Documenta cada fricción encontrada                              │
│  - Itera quickstart hasta que sea seguible sin asistencia          │
│  - Goal: 3 onboarding completos en <5 min cada uno                 │
│                                                                    │
└─────────────────────────────┬──────────────────────────────────────┘
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  FASE 2: Pilot 1 (Semana 7-9)                                      │
│  ─────────────────────────                                         │
│  - 1 partner usa Audit con su repo real durante 2 semanas          │
│  - Weekly sync de 30 min: qué usaron, qué bloqueó, qué falta       │
│  - Camilo investiga embebido: "¿cómo es tu flujo con Claude Code?" │
│  - Documenta findings cualitativos en research_notes.md            │
│  - Goal: 1 pilot activo + 4 weekly syncs documentados              │
│                                                                    │
└─────────────────────────────┬──────────────────────────────────────┘
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  FASE 3: Pilot Batch (Semana 9-12)                                 │
│  ──────────────────────────────                                    │
│  - 3-5 partners activos en paralelo                                │
│  - Métricas de retention: ¿siguen activos a las 4 semanas?         │
│  - Métricas de uso: scans/semana, waivers creados, flow depth      │
│  - Pregunta de Provenance integrada en cada sync                   │
│  - Algunos pueden empezar a pagar $49/mo si el valor está claro    │
│  - Goal: 3-5 partners activos + métricas de retention 4 semanas    │
│                                                                    │
└─────────────────────────────┬──────────────────────────────────────┘
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  FASE 4: Decision Gate (Semana 12)                                 │
│  ────────────────────────────────                                  │
│  - Análisis de datos cualitativos + cuantitativos                  │
│  - Decisión: anuncio público sí/no/iterar                          │
│  - Decisión paralela: pivote a Provenance está validado o no       │
│  - Producir reporte ejecutivo de 1-2 páginas con hallazgos         │
│  - Producir lista de mejoras para v1.1 basada en feedback          │
│  - Goal: decisión informada sobre próximos 6 meses                 │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Embedding de research de Provenance dentro del pilot de Audit

```
Conversación típica de pilot sync (30 min):

00:00 - 05:00  Saludo + check-in informal
05:00 - 15:00  ¿Qué usaste esta semana? (scans, findings, waivers)
                ¿Qué te bloqueó? ¿Qué fue confuso?
                ¿Qué te hubiera gustado tener?

15:00 - 20:00  ESPACIO DE RESEARCH DE PROVENANCE:
                "Una pregunta paralela:
                ¿qué hacés cuando Claude Code o Copilot escribe
                código en tu equipo? ¿Cómo lo tracean?
                ¿Hay alguna política sobre PRs creados con AI?
                ¿Te preocupa que un día tu cliente pregunte
                'cómo sé que esto fue revisado por un humano'?"

                → Camilo escucha. NO ofrece producto. Solo escucha.
                → Documenta en research_notes.md después del sync.

20:00 - 30:00  Próximos pasos, agenda siguiente sync
```

**Razón estratégica:** El pilot de Audit es el gancho probado (AI-assisted coding governance es problema reconocido). El research de Provenance es la pregunta del próximo producto disfrazado de curiosidad genuina. Cuando un design partner diga "carajo, no sé qué hacemos cuando Copilot escribe código", esa es la voz del cliente futuro de Provenance — sin necesidad de venderle nada todavía.

---

## Propuesta

Crear epic `pilot_validation` con estructura de 5 fases secuenciales (NO modelar con EARS técnicas — es trabajo de fundador, no de código). El bloque se ejecuta en ~7 semanas (semana 5-12 del roadmap global), corriendo en paralelo a Bloque C (release_v1) desde la semana 5.

### Fase 0 — Listening (Semana 5-6)

**Objetivo:** Identificar 5-10 candidatos en red personal de Camilo y contactar manualmente.

**Trabajo:**

1. **Lista de candidatos** (Camilo construye)
   - Ex-clientes del software factory que usan Claude Code/Copilot/Cursor
   - Founders técnicos en su red de Bangkok / Barcelona / España
   - CTOs en empresas medium-sized (10-50 devs) que conoce
   - Maintainers de proyectos OSS donde Camilo tiene relación previa
   - Filtro: NO frío, NO automatizado. Solo gente con quien Camilo puede iniciar conversación legítima.

2. **Mensaje inicial** (no template, personalizado para cada uno)
   - Por email o DM personal (NO LinkedIn message en frío)
   - 3-4 párrafos máximo:
     - "Estoy construyendo X. Sé que tenés Y problema. ¿Te interesa una conversación de 30 min?"
     - Sin enlace al producto en el primer mensaje
     - Sin pitch. Solo conversación.

3. **Conversación de discovery** (30-45 min cada una)
   - Estructura sugerida:
     - 5 min: contexto personal, qué hace su empresa
     - 15 min: ¿cómo gestionan AI-assisted coding hoy?
     - 10 min: ¿qué te preocupa de governance/compliance?
     - **5-10 min: la pregunta de Provenance**: "¿qué hacés cuando Claude Code o Copilot escribe código en tu equipo? ¿Hay políticas? ¿Tracean?"
     - 5 min: si veo fit → "tengo algo que podría servir, ¿te muestro?"

4. **Documentación post-conversación**
   - `research_notes.md` con sección por candidato
   - Quotes textuales (sin atribución pública)
   - Pain points identificados
   - Indicador de fit (alto/medio/bajo)
   - Si fit alto: invitar a Fase 1

**Definition of Done Fase 0:**
- 5+ candidatos contactados manualmente
- 5+ conversaciones de discovery completadas
- 3+ candidatos identificados como fit alto
- Notas estructuradas en `research_notes.md`

### Fase 1 — Frictionless Onboarding (Semana 6-7)

**Objetivo:** 3 personas externas completan su primer scan en <5 min sin ayuda.

**Trabajo:**

1. **Setup del experiment**
   - Camilo invita a 3 candidatos identificados en Fase 0
   - Modalidad A (preferida): screen share síncrona, Camilo silencioso, observa
   - Modalidad B: candidato graba video de pantalla durante onboarding async
   - Promesa: "Si te queda atascado, no te ayudo durante el video. Vamos a ver dónde se atasca el quickstart."

2. **Métricas a capturar**
   - Tiempo total desde "abro gitgov.com" hasta "veo primer scan"
   - Número de momentos de fricción (cada vez que el usuario pausa, lee algo dos veces, retrocede)
   - Quotes textuales: "qué confuso es esto", "no entiendo qué tengo que hacer", "ah ok ya entendí"
   - Si abandonan: ¿en qué paso?

3. **Iteración del quickstart**
   - Después de cada onboarding, Camilo identifica fricciones
   - Edita docs/quickstart.md o landing copy
   - Re-valida con siguiente candidato

4. **Casos de uso a probar**
   - Path SaaS hosted: registro → install GitHub App → primer scan en gitgov.com
   - Path on-prem: docker-compose → setup → primer scan local
   - Idealmente al menos 1 candidato prueba cada path

**Definition of Done Fase 1:**
- 3+ candidatos completan onboarding hosted en <5 min sin ayuda
- 1+ candidato completa onboarding on-prem en <10 min sin ayuda
- Quickstart iterado 2+ veces basado en feedback
- Lista documentada de fricciones residuales (no críticas)

### Fase 2 — Pilot 1 (Semana 7-9)

**Objetivo:** 1 partner usa Audit con su repo real durante 2 semanas, con weekly syncs.

**Trabajo:**

1. **Selección del primer pilot**
   - De los 3+ que pasaron Fase 1, elegir el de mayor fit + mayor disposición
   - Acuerdo verbal o email: "vamos a usar GitGov Audit en TU repo durante 2 semanas, con sync semanal de 30 min"
   - Modelo: gratis durante el pilot, con compromiso de feedback estructurado

2. **Onboarding white-glove**
   - Setup inicial junto con Camilo (1 hora)
   - Configuración de GitHub App, primer scan, exploración del dashboard
   - Identificación de top 3-5 use cases para el pilot

3. **Weekly syncs (4 syncs de 30 min)**
   - Estructura del diagrama anterior (15 min uso, 5 min Provenance, 10 min planning)
   - Documentación post-sync en `pilot_1_notes.md`
   - Quotes textuales preservadas (con permiso de uso anonimizado)

4. **Métricas a trackear**
   - Frecuencia de uso: scans/semana, waivers creados, sesiones de webapp
   - Use cases ejercitados: PR scan, manual scan, audit de findings, etc.
   - Bugs encontrados (cada uno como input file separado, NO arreglar inline)
   - Feature requests (priorizar para Fase 4 decision gate)

5. **Research de Provenance integrado**
   - Cada sync tiene 5-10 min de research de Provenance
   - Camilo escucha, NO vende
   - Documenta voz del cliente para próximo producto

**Definition of Done Fase 2:**
- 1 partner activo durante 2 semanas
- 4 weekly syncs completados con notas
- Bugs encontrados documentados como inputs
- Feature requests priorizadas
- 4 conversaciones de research de Provenance documentadas

### Fase 3 — Pilot Batch (Semana 9-12)

**Objetivo:** 3-5 partners activos en paralelo + métricas de retention a 4 semanas.

**Trabajo:**

1. **Expansión del batch**
   - Pilot 1 sigue activo (transition a "established user")
   - Onboarding de 2-4 partners adicionales en semanas 9-10
   - Cada partner tiene weekly sync (puede ser bi-weekly si Camilo está saturado)

2. **Métricas cuantitativas**
   - Retention 4 semanas: ¿cuántos siguen activos al final del bloque?
   - Frecuencia de uso: scans/semana por partner
   - Profundidad de uso: ¿solo scans automáticos vía PR, o también manual scans, waivers, audits?
   - Time-to-first-value: ¿en cuánto tiempo cada partner llegó a "esto me sirve"?

3. **Métricas cualitativas**
   - "¿Recomendarías esto a un colega?" (NPS-style pregunta directa, no score)
   - "¿Pagarías $49/mo por esto en su estado actual?"
   - "¿Qué falta para que esto sea must-have?"

4. **Conversión a paying customers (opcional, no goal)**
   - Si algún partner dice "esto me sirve, ¿cómo pago?", ofrecer $49/mo Pro tier
   - Stripe link manual (sin billing automatizado todavía)
   - **NO presionar conversión.** El goal es validation, no revenue.

5. **Research de Provenance acumulado**
   - Por cada partner, 4-6 conversaciones de Provenance integradas
   - Patrones cross-partner: ¿qué dolor aparece en TODOS los pilots?
   - Esos patrones son la base del Provenance product brief

**Definition of Done Fase 3:**
- 3-5 partners activos al final de semana 12
- Retention 4 semanas medida y documentada
- 1+ partner pagando $49/mo (opcional, bonus)
- 12+ conversaciones de research de Provenance documentadas
- Patrones cross-partner identificados

### Fase 4 — Decision Gate (Semana 12)

**Objetivo:** Datos para "anuncio público sí/no/iterar" + brief inicial de Provenance.

**Trabajo:**

1. **Análisis de datos**
   - Compilar métricas cuantitativas de Fase 3
   - Compilar quotes y patterns de Fases 0-3
   - Identificar:
     - Top 3 use cases que funcionan
     - Top 3 fricciones residuales
     - Top 3 quotes que validan propuesta de valor
     - Top 3 quotes que ponen en duda propuesta de valor

2. **Reporte ejecutivo**
   - 1-2 páginas máximo
   - Executive summary
   - Hallazgos cuantitativos
   - Hallazgos cualitativos
   - Recomendación: anuncio público SÍ / NO / ITERAR (con justificación)

3. **Decisión sobre Provenance pivot**
   - ¿Apareció dolor real cross-partner sobre AI agent governance?
   - Si sí: Bloque E (provenance_pivot) tiene base sólida, arrancar
   - Si no: Audit MVP sigue como producto principal, Provenance se aparca o se reformula

4. **Plan v1.1**
   - Lista priorizada de mejoras basadas en feedback
   - Bugs documentados como inputs durante el bloque → backlog
   - Features requests → backlog

5. **Comunicación con design partners**
   - Email de cierre de pilot agradeciendo participación
   - Si producto sigue: invitación a beta program o early adopter
   - Si producto pivota: aviso honesto + opción de seguir como design partner del nuevo producto

**Definition of Done Fase 4:**
- Reporte ejecutivo de 1-2 páginas generado
- Decisión sobre anuncio público tomada (con justificación)
- Decisión sobre pivote a Provenance tomada (con justificación)
- Plan v1.1 con backlog priorizado
- Emails de cierre enviados a design partners

---

## Archivos clave

### Archivos de research y tracking (NUEVOS)

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| research_notes.md | privado / no en repo OSS | Notas de Fase 0 (discovery conversations) | `~/private/gitgov/research_notes.md` o repo privado |
| pilot_1_notes.md | privado | Notas del primer pilot | `~/private/gitgov/pilot_1_notes.md` |
| pilot_batch_notes.md | privado | Notas de pilots 2-5 | `~/private/gitgov/pilot_batch_notes.md` |
| provenance_research.md | privado | Quotes y patterns sobre AI agent governance | `~/private/gitgov/provenance_research.md` |
| decision_gate_report.md | privado | Reporte ejecutivo final | `~/private/gitgov/decision_gate_report.md` |
| metrics.csv | privado | Métricas cuantitativas semanales | `~/private/gitgov/metrics.csv` |

**Nota sobre privacidad:** Todos los notes y datos de pilots son CONFIDENCIALES. NO van al repo OSS. NO se comparten sin permiso explícito. Los quotes públicos (si los hay en el reporte ejecutivo) requieren permiso del partner. Camilo es responsable de mantener confidencialidad.

### Archivos de proceso (templates ligeros, NUEVOS)

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| pilot_intake_template.md | privado | Template para nuevo pilot | template para copiar |
| weekly_sync_template.md | privado | Template para weekly syncs | template para copiar |
| feedback_form.md | privado | Formulario async para partners no disponibles para sync | template |

### Archivos de producto (modificaciones probables durante el bloque)

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| docs/quickstart.md | gitgovernance/gitgov | Iteraciones basadas en fricciones de Fase 1 | `docs/quickstart.md` |
| docs/on-prem.md | gitgovernance/gitgov | Iteraciones basadas en fricciones | `docs/on-prem.md` |
| Landing copy | gitgovernance/gitgov | Iteraciones de copy si fricciones tempranas | `packages/saas-web/src/app/page.tsx` |
| Bugs como inputs | gitgovernance/gitgov | Cada bug encontrado durante pilots | `specs/epics/inputs/*_bug_input.md` |
| Feature requests como inputs | gitgovernance/gitgov | Cada feature request priorizada | `specs/epics/inputs/*_feature_input.md` |

### Archivos que NO se tocan (anti-objetivos)

| Archivo o paquete | Razón |
|-------------------|-------|
| Core scan engine | NO refactorear durante pilots — estabilidad >> features |
| Adapter pattern | NO modificar — ya está estable |
| EARS de gate_product / saas_base | Ya cerrados en `audit_mvp_close` |
| Marketing automation tools | NO usar (anti-objetivo explícito) |
| LinkedIn API / outreach automation | NO usar (anti-objetivo explícito) |

---

## Plan paso a paso

### Semana 5 — Setup de Fase 0 (Listening)

1. Camilo lista 10 candidatos potenciales en su red personal
2. Para cada uno: nota breve sobre por qué podría ser fit (rol, stack, problema observable)
3. Filtra a 5-7 con mayor fit y mayor probabilidad de respuesta
4. Redacta mensajes iniciales personalizados (NO template) — uno por candidato
5. Envía mensajes manualmente (email o DM personal directo)
6. Espera respuestas durante semana

### Semana 6 — Conversaciones de discovery (Fase 0)

7. Calendariza conversaciones de 30-45 min con cada candidato que respondió
8. Para cada conversación:
   - Sigue estructura: contexto personal → AI-assisted coding → governance/compliance → pregunta de Provenance → fit check
   - Toma notas en tiempo real (con permiso) o post-conversación
9. Después de cada conversación, actualiza `research_notes.md` con:
   - Quotes textuales relevantes
   - Pain points identificados
   - Indicador de fit (alto/medio/bajo)
10. Identifica 3+ candidatos de fit alto para Fase 1

### Semana 6-7 — Frictionless onboarding (Fase 1)

11. Invita a 3 candidatos de fit alto al experimento de onboarding
12. Para cada uno:
    - Modalidad A: screen share síncrona donde Camilo observa silencioso
    - Modalidad B: candidato graba video async durante onboarding
13. Documenta:
    - Tiempo total
    - Cada momento de fricción (con timestamp del video)
    - Quotes textuales
14. Después de cada onboarding:
    - Identifica top 2-3 fricciones críticas
    - Edita `docs/quickstart.md` o landing copy
    - Re-valida con siguiente candidato

### Semana 7 — Selección del primer pilot (Fase 2)

15. Elige al candidato de mayor fit + mayor disposición de los 3+ de Fase 1
16. Acuerdo verbal o email: 2 semanas de pilot con weekly sync
17. Onboarding white-glove (1 hora con Camilo)
18. Identificación de top 3-5 use cases para el pilot

### Semana 7-9 — Pilot 1 activo (Fase 2)

19. Sync semanal de 30 min (4 syncs total durante el pilot)
20. Para cada sync:
    - 15 min uso (qué hicieron, qué bloqueó)
    - 5 min research de Provenance (pregunta clave)
    - 10 min planning + agenda siguiente sync
21. Documentación post-sync en `pilot_1_notes.md`
22. Bugs encontrados → input files separados
23. Feature requests → backlog para Fase 4

### Semana 9-10 — Expansión a batch (Fase 3)

24. Pilot 1 transitiona a "established user" (mantiene sync bi-weekly)
25. Onboarding de 2-4 partners adicionales:
    - Mismo proceso que Pilot 1 pero más eficiente (Camilo ya iteró)
    - Sync semanal o bi-weekly según disponibilidad
26. Empieza a trackear métricas cuantitativas:
    - `metrics.csv` con: partner_id, semana, scans, waivers, sessions, retention_status
27. Continua research de Provenance integrado

### Semana 10-12 — Operación del batch (Fase 3)

28. Para cada partner activo, sync semanal o bi-weekly
29. Trackea retention: ¿quién dejó de usar? ¿por qué?
30. Si algún partner dice "¿cómo pago?": ofrecer Stripe link Pro $49/mo
31. Acumula research de Provenance: ¿qué dolor aparece cross-partner?
32. Identifica patterns para Fase 4

### Semana 12 — Decision Gate (Fase 4)

33. Compila métricas cuantitativas de `metrics.csv`
34. Compila quotes y patterns de research notes
35. Genera `decision_gate_report.md` (1-2 páginas máximo):
    - Executive summary
    - Hallazgos cuantitativos
    - Hallazgos cualitativos
    - Recomendación: anuncio público SÍ / NO / ITERAR
36. Decisión sobre pivote a Provenance:
    - ¿Apareció dolor real cross-partner?
    - Si sí: Bloque E arranca con base sólida
    - Si no: revaluar
37. Plan v1.1 con backlog priorizado
38. Emails de cierre a design partners (agradecimiento + siguiente paso)
39. Si decisión = anuncio público: planear announcement post-decision-gate
40. Si decisión = iterar: arrancar v1.1 con feedback del bloque

---

## Verificación

Esta epic NO se valida con tests automatizados — son criterios cualitativos + cuantitativos verificados manualmente.

### Verificación Fase 0

```
- [ ] Lista de 5+ candidatos contactados existe y es real
- [ ] 5+ conversaciones de discovery completadas (calendario + notas)
- [ ] 3+ candidatos identificados como fit alto
- [ ] research_notes.md tiene sección estructurada por candidato
- [ ] Cada sección tiene: quotes, pain points, indicador de fit
```

### Verificación Fase 1

```bash
# Métricas a verificar manualmente
- [ ] 3+ candidatos completan onboarding hosted en <5 min sin ayuda
- [ ] 1+ candidato completa onboarding on-prem en <10 min sin ayuda
- [ ] Cada onboarding tiene métricas: tiempo total, momentos de fricción, quotes
- [ ] Quickstart iterado 2+ veces basado en feedback
- [ ] docs/quickstart.md y landing copy reflejan iteraciones
```

### Verificación Fase 2

```
- [ ] 1 partner activo durante 2 semanas
- [ ] 4 weekly syncs completados (calendario + notas)
- [ ] pilot_1_notes.md tiene 4 secciones (una por sync)
- [ ] Bugs encontrados documentados como inputs en specs/epics/inputs/
- [ ] Feature requests priorizadas
- [ ] 4+ conversaciones de research de Provenance documentadas en provenance_research.md
```

### Verificación Fase 3

```
- [ ] 3-5 partners activos al final de semana 12
- [ ] metrics.csv contiene datos semanales por partner
- [ ] Retention 4 semanas medida (% de partners que siguen activos)
- [ ] 12+ conversaciones de research de Provenance acumuladas
- [ ] Patterns cross-partner identificados en provenance_research.md
- [ ] (Bonus) 1+ partner pagando $49/mo via Stripe link
```

### Verificación Fase 4

```
- [ ] decision_gate_report.md de 1-2 páginas generado
- [ ] Reporte contiene: executive summary, hallazgos cuant + cualit, recomendación
- [ ] Decisión sobre anuncio público tomada (sí/no/iterar) con justificación
- [ ] Decisión sobre pivote a Provenance tomada con justificación
- [ ] Plan v1.1 con backlog priorizado existe
- [ ] Emails de cierre enviados a partners
```

**Criterios de éxito (Definition of Done global):**

- [ ] 5+ conversaciones de discovery completadas
- [ ] 3+ partners completan onboarding sin ayuda
- [ ] 3-5 partners activos al final de semana 12
- [ ] Retention 4 semanas medida (sin meta numérica — el dato es lo importante)
- [ ] 12+ conversaciones de research de Provenance integradas
- [ ] Patterns cross-partner identificados
- [ ] Reporte ejecutivo generado
- [ ] Decisión sobre anuncio público tomada
- [ ] Decisión sobre pivote a Provenance tomada
- [ ] Plan v1.1 con backlog priorizado
- [ ] Sin automatización de outreach usada
- [ ] Sin marketing público durante el bloque

---

## Preguntas de comprensión

### Comprensión (must-pass — sin estas no puede empezar)

**[1] ¿Cuál es el objetivo principal del bloque y qué NO es objetivo?**
hint: Sección "Problema (captura)" + "Anti-objetivos". OBJETIVO: 3-5 design partners reales usando Audit MVP en su contexto, con feedback estructurado, antes del anuncio público + research embebido para Provenance pivot. NO ES OBJETIVO: maximizar revenue, automatizar outreach, anunciar producto al público antes de validación, vender Provenance.

**[2] ¿Por qué la pregunta de Provenance está embebida dentro de pilots de Audit en vez de ser su propio bloque?**
hint: Sección "Embedding de research de Provenance" + "Razón estratégica". El mercado no está educado sobre AI agent governance todavía. Vender Provenance directamente requiere educación 12 meses. Pero el dolor existe. La pregunta embebida en cada sync de Audit captura voz del cliente sin necesidad de venderle Provenance. Cuando llegue el momento del pivote (Bloque E), ya tienes 12+ conversaciones documentadas como evidencia.

**[3] ¿Cuál es el rol de Camilo en este bloque vs el rol de los agentes técnicos?**
hint: Esta epic NO es trabajo de agente técnico. Es founder-led sales + research. Los agentes pueden ayudar con: (a) generar templates de email/sync, (b) compilar métricas en metrics.csv, (c) generar reporte ejecutivo desde notas. Pero el trabajo central — conversaciones de 30-45 min, escuchar, construir relación, integrar pregunta de Provenance — solo Camilo lo puede hacer.

### Profundización (weighted — entender el diseño)

**[4] ¿Por qué NO automatizar outreach con LinkedIn / email tools / GitHub stars masivos?**
hint: Sección "Restricciones autoimpuestas". Razones: (a) violan TOS de plataformas, riesgo de account ban, (b) producen ruido sin señal — la conversación calificada requiere personalización, (c) la audiencia objetivo (CTOs, security leads) detecta automation y la filtra agresivamente, (d) la red personal de Camilo + Triad community como feeder es feed cualitativo más alto que cualquier cold outreach automatizado.

**[5] ¿Cómo se mide "frictionless onboarding" si no es un test automatizado?**
hint: Sección "Fase 1 → Trabajo → 2. Métricas a capturar". Métricas observacionales: tiempo desde "abro gitgov.com" hasta "veo primer scan" cronometrado, número de momentos de fricción (pausas, retrocesos, lecturas múltiples), quotes textuales del usuario expresando confusión, abandono temprano. Si <5 min y 0-1 fricciones críticas: éxito. Si >10 min o abandono: iterar.

**[6] ¿Por qué primer batch de design partners puede ser gratis?**
hint: Sección "Restricciones autoimpuestas → NO presión por pricing". Razones: (a) reducir fricción de adopción al máximo, (b) el activo es feedback estructurado, no revenue, (c) en MVP no hay billing automatizado, manual presure por dinero produce churn temprano, (d) cuando el partner llegue a "esto me sirve, ¿cómo pago?", la conversión es natural. Forzar pricing antes mata el pilot.

**[7] ¿Qué pasa si Decision Gate (Fase 4) sugiere que el producto NO está listo para anuncio público?**
hint: Sección "Fase 4 → Decisión". Tres opciones: (a) ITERAR — v1.1 con feedback del bloque, otro batch de pilots en 2-3 meses, (b) PIVOTE TEMPRANO — si dolor real está en Provenance no en Audit, mover narrativa antes, (c) NO — si producto no resuena, replantar. Las tres son válidas. Lo importante: decisión basada en datos, no en miedo o esperanza.

**[8] ¿Cómo se maneja la confidencialidad de los notes de pilots?**
hint: Sección "Archivos clave → Nota sobre privacidad". Notes son CONFIDENCIALES. NO van al repo OSS. NO se comparten sin permiso. Quotes públicos requieren permiso del partner. Camilo es responsable. Razón: trust con design partners es fundación de toda la operación. Si un partner descubre su quote en un blog post sin permiso, perdés ese partner y reputación.

### Verificación (bonus — confirmar scope)

**[9] ¿Cómo se relaciona este bloque con Triad OSS Launch?**
hint: Triad OSS launch corre en paralelo desde Semana 0. Triad community puede ser feeder de design partners en Fase 0 (developers que adoptan Triad y mencionan necesidad de governance). Pero Triad community NO es target principal — los design partners de Audit son orgs con compliance/governance, no developers individuales. Triad community feed es bonus, no fuente principal.

**[10] ¿Qué se hace con bugs encontrados durante pilots?**
hint: Sección "Plan paso a paso → Sesión 2-3 + Reglas globales del proyecto". Cada bug encontrado durante un pilot que NO bloquea el uso del partner se documenta como input file separado en `specs/epics/inputs/*_bug_input.md`. NO se arregla inline durante el pilot. Excepción: bug crítico que bloquea uso del partner. Razón: scope creep mata pilots, hay que mantener producto estable durante validation, fixes esperan a v1.1.

**[11] ¿Qué pasa si solo se logran 1-2 partners activos en vez de 3-5?**
hint: Sección "Definition of Done global". El número (3-5) es target, no acceptance criteria duro. Si solo hay 1-2 partners pero el feedback es alto signal, suficientes datos para decision gate. Si hay 0 partners, problema serio — replantar approach o producto. La calidad de feedback >> cantidad de partners.

**[12] ¿Por qué NO hacer marketing público antes de Fase 4?**
hint: Sección "Restricciones autoimpuestas". Razones: (a) producto sin tracción atrae trolls y haters más que clientes calificados, (b) feedback ruidoso de público general contamina el feedback estructurado de design partners, (c) si producto necesita iterar, el daño reputacional de "lanzaron y nadie lo usa" persiste, (d) el momento óptimo de marketing público es post-validation con 3-5 testimonios reales de design partners.

---

## EARS estimados

Esta epic NO se modela con EARS técnicas porque es trabajo de fundador (sales + research), no de código. Sin embargo, hay criterios de aceptación verificables por fase:

| ID | Criterio |
|----|----------|
| PV-F0-A1 | Lista de 5+ candidatos contactados manualmente existe |
| PV-F0-A2 | 5+ conversaciones de discovery completadas con notas |
| PV-F0-A3 | 3+ candidatos identificados como fit alto |
| PV-F0-A4 | Cada conversación tiene 5-10 min dedicados a pregunta de Provenance |
| PV-F1-A1 | 3+ candidatos completan onboarding hosted sin ayuda |
| PV-F1-A2 | Cada onboarding cronometrado: <5 min para hosted, <10 min para on-prem |
| PV-F1-A3 | Quickstart iterado 2+ veces basado en fricciones |
| PV-F1-A4 | Métricas observacionales documentadas (tiempo, fricciones, quotes) |
| PV-F2-A1 | 1 partner activo durante 2 semanas |
| PV-F2-A2 | 4 weekly syncs completados con notas estructuradas |
| PV-F2-A3 | Bugs encontrados documentados como inputs separados |
| PV-F2-A4 | 4+ conversaciones de research de Provenance documentadas |
| PV-F3-A1 | 3-5 partners activos al final de semana 12 |
| PV-F3-A2 | Métricas semanales en metrics.csv (scans, waivers, sessions, retention) |
| PV-F3-A3 | Retention 4 semanas medida (sin meta — el dato es lo importante) |
| PV-F3-A4 | 12+ conversaciones de research de Provenance acumuladas |
| PV-F3-A5 | Patterns cross-partner identificados |
| PV-F4-A1 | Reporte ejecutivo de 1-2 páginas generado |
| PV-F4-A2 | Decisión sobre anuncio público tomada con justificación |
| PV-F4-A3 | Decisión sobre pivote a Provenance tomada con justificación |
| PV-F4-A4 | Plan v1.1 con backlog priorizado |
| PV-F4-A5 | Emails de cierre enviados a design partners |
| PV-G-A1 | NO automatización de outreach usada (LinkedIn DMs, GitHub auto-stars, cold email automatizado) |
| PV-G-A2 | NO marketing público antes de Fase 4 |
| PV-G-A3 | NO pivote a Provenance product brief antes de Fase 4 |
| PV-G-A4 | Confidencialidad de pilot notes mantenida (privado, no en repo OSS) |

---

## Scope estimado

**Trabajo nuevo:**
- Lista de candidatos + mensajes personalizados
- 5+ conversaciones de discovery (~5h total + prep)
- 3 onboarding observados (~3h total + post-mortem)
- 1 pilot activo durante 2 semanas con 4 syncs (~2h total syncs + prep + notes)
- 2-4 partners adicionales con onboarding white-glove + syncs (~6h total)
- Tracking de métricas semanales (~30 min/semana × 7 semanas = 3.5h)
- Reporte ejecutivo (~4h)

**Total esfuerzo:** ~30-40 horas durante 7 semanas (~5 horas/semana de trabajo focalizado de Camilo).

**Trabajo que NO se hace (anti-objetivos):**
- 0 automatización de outreach
- 0 marketing público
- 0 pivote a Provenance product brief
- 0 features nuevas durante pilots (solo bug fixes críticos)
- 0 venta de Provenance a design partners de Audit
- 0 presión por conversión a paying customers

**Riesgo:** **Medio**.

Riesgos identificados:
1. **Pocos candidatos en red personal de Camilo dispuestos a piloter.** Mitigación: Triad community como feeder secundario, expansión gradual a red de Bangkok / Barcelona, paciencia.
2. **Pilots abandonan por bugs o fricciones críticas.** Mitigación: estabilidad >> features durante el bloque, fix inline bugs críticos, documentar otros como inputs.
3. **Research de Provenance no produce señal clara.** Mitigación: sin meta numérica de pivote — si no hay dolor cross-partner, Provenance se aparca o se reformula. Decisión data-driven.
4. **Camilo se queda sin energía para 5h/semana de sales work durante 7 semanas.** Mitigación: ritmo sostenible, pilots batch en paralelo donde es posible, weekly syncs eficientes (30 min, no 1 hora).
5. **Conflicto de interés entre Audit MVP iteration y Provenance research.** Mitigación: estructura del sync (15 min uso, 5 min Provenance, 10 min planning) mantiene Audit como foco principal.

**Esfuerzo:** **7 semanas** (semana 5-12 del roadmap global), corriendo en paralelo a Bloque C (release_v1) desde semana 5.

**Dependencias externas:**
- Audit MVP shipped (Bloque C C.1 hosted + C.2 on-prem) — prerequisito duro
- Camilo disponible 5h/semana durante 7 semanas
- Red personal de Camilo (no se construye durante el bloque, ya existe)

---

## Prioridad

**Alta** — es la única forma de validar product-market fit antes de invertir 12 meses en content marketing para el pivote a Provenance.

Razones:

1. **Sin pilots reales, el pivote a Provenance es especulativo.** El research embebido en este bloque es lo que valida o invalida la tesis "AI agent governance es problema real con dolor pagable".
2. **Sin Audit MVP probado en producción real, no se puede vender.** Demos curated por Camilo no son evidencia. Pilots reales sí.
3. **Trabajo de bajo costo monetario, alto retorno informacional.** No requiere presupuesto (red personal existente). Requiere tiempo (5h/semana × 7 semanas). El retorno es decisión informada sobre próximos 6 meses.
4. **Window de oportunidad limitada.** EU AI Act drives demand en 12-18 meses. Empezar pilots ahora deja tiempo para iterar antes de la ola.

**Anti-objetivos explícitos (no hacer durante este bloque):**

- ❌ NO automatizar outreach (LinkedIn DMs, GitHub auto-stars, cold email automatizado, scraping)
- ❌ NO usar herramientas como Phantombuster, Apollo, Lemlist, etc. para pipeline
- ❌ NO marketing público antes de Fase 4 (no posts en HackerNews, no anuncios en X además del de Triad OSS launch)
- ❌ NO vender Provenance a design partners de Audit — Provenance research es escucha, no pitch
- ❌ NO presionar conversión a paying customers — primer batch puede ser gratis
- ❌ NO añadir features nuevas durante pilots — estabilidad >> velocity de iteración
- ❌ NO arreglar bugs cross-cutting inline — documentar como inputs (excepción: bugs críticos que bloquean uso del partner)
- ❌ NO compartir quotes o datos de partners sin permiso explícito
- ❌ NO publicar en blog/X cuántos pilots tenés durante el bloque (puede contaminar selección de Fase 4)
- ❌ NO usar este bloque para vender Triad — Triad es paralelo, su funnel es OSS community
- ❌ NO contratar SDR / sales person — founder-led sales por diseño
- ❌ NO armar deck de inversores durante este bloque — deal flow es post-Decision Gate si aplica

---

**Notas para el `epic_designer` que procese este input:**

1. Esta epic NO es técnica. Modelarla con fases secuenciales (5 fases) y criterios cualitativos + cuantitativos verificables, NO con EARS formales.
2. La epic NO genera código nuevo significativo. Las modificaciones a `docs/quickstart.md` y landing copy son micro-iteraciones, no specs nuevas.
3. La epic genera DATOS y DECISIONES, no código. Los entregables principales son: research notes, métricas, reporte ejecutivo, decisión informada.
4. El roadmap debe ser de 7 semanas (semana 5-12 del global), corriendo en paralelo a release_v1.
5. El `dependency_auditor` debe validar que Audit MVP (release_v1) está shipped antes de empezar Fase 1 (no se pueden hacer onboardings de un producto que no existe en producción).
6. Los bugs y feature requests encontrados durante pilots deben generar inputs separados en `specs/epics/inputs/` para procesamiento posterior — NO se procesan inline durante este bloque.
7. La confidencialidad de los datos de pilots es responsabilidad del usuario (Camilo), NO del agente. El agente NO debe procesar ni leer los archivos privados de pilots a menos que Camilo explícitamente lo pida.
