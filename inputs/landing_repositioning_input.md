# Input: Repositioning del README/landing alrededor del PR audit flow

> Documento de input para futura epic.

**Fecha:** 2026-05-05
**Autor:** humano:camilo + agent:claude (deep review session)
**Origen:** Critical review session / respuesta #44 del agente
**Sesión:** recall_20_2026-05-04_rldx-e1-runner-puro-cli-l1
**Prioridad:** 🟡 Importante — pero **DESPUÉS de PR capture y AORCH ship**
**Relacionado con:**
  - `README.md` (root) — el doc principal a reescribir
  - `gitgov-hero.html` (artifact) — hero animation
  - `gitgov-concepts.html` (artifact) — propuestas de visualización
  - `04_go_to_market/brand_copy.md` — copy oficial
  - `04_go_to_market/posts/` — posts derivados
**Destino:** Pendiente — coordinar con `pr_review_capture_input.md` (dependencia upstream)

---

## Problema (captura)

El README actual posiciona GitGov como un **"cryptographic governance protocol"** abstracto. El primer párrafo habla de "8 RFCs", "decisions, actions, and exceptions as cryptographically signed artifacts", "Three Gates", "ledger of action".

Esa es la verdad arquitectónica del producto, pero **no es la verdad funcional**. La respuesta #44 del agente con acceso al codebase fue clara:

> "El README habla de 'governance protocol' y 'compliance'. Lo que el producto REALMENTE hace bien hoy es:
>
> **Audit automático de PRs con findings firmados.** Un developer instala la App, cada PR recibe un scan automático, los findings aparecen como PR comment con severity. Si hay secrets o PII, el PR se bloquea. Todo firmado por `agent:gitgov-audit` con Ed25519.
>
> Eso es concreto, útil, y funcional hoy. El README lo entierra bajo capas de protocolo y arquitectura. Debería ser el primer párrafo."

El gap es: **lo que vendemos vs lo que demostramos.** El producto que se puede demostrar HOY (con clicks reproducibles, no con explicación) es el PR audit flow. Pero el README pinta una visión más amplia que aún no está enteramente ejecutable. Eso erosiona credibilidad cuando alguien técnico abre el repo y prueba.

**Visitor flow actual (hipotético):**

```
1. Llega al README →
2. Lee "cryptographic governance protocol" →
3. Lee 8 RFCs →
4. Piensa: "OK, ¿pero qué hace?" →
5. Llega a Quick Start →
6. Corre `gitgov init` →
7. ¿Y ahora qué? Hay 30 comandos...
8. Cierra la pestaña.
```

**Visitor flow deseado:**

```
1. Llega al README →
2. Lee: "Install the GitHub App. Every PR gets a signed audit trail." →
3. Ve gif/animación de PR → comment → signed record →
4. Piensa: "OK, eso ES útil" →
5. Instala la App →
6. Su próximo PR aparece auditado y firmado →
7. Comparte el repo.
```

---

## Diagramas (captura)

### Estructura actual del README

```
┌────────────────────────────────────┐
│ Title + tagline                    │
│ "Every decision signed..."         │
├────────────────────────────────────┤
│ ## What is this?                   │
│ (3 párrafos abstractos sobre       │
│  protocolo + productos + AI)       │
├────────────────────────────────────┤
│ ## The Protocol                    │
│ (estructura del envelope, 8 RFCs)  │
├────────────────────────────────────┤
│ ## Products                        │
│ (Audit + Triad descritos)          │
├────────────────────────────────────┤
│ ## Quick Start                     │
│ (instalación CLI)                  │
├────────────────────────────────────┤
│ ## Talk to your project            │
│ ("@gitgov, how are we doing?")     │
├────────────────────────────────────┤
│ ## Navigate This Repository        │
│ (mapa de directorios)              │
├────────────────────────────────────┤
│ ## Architecture                    │
│ ## Why Open Source...              │
│ ## Community / License             │
└────────────────────────────────────┘

Problema: el visitor llega al "qué hace concretamente"
recién en el §"Products", después de leer 4 secciones
abstractas. Si llega.
```

### Estructura propuesta

```
┌────────────────────────────────────┐
│ Title + tagline reformulado:       │
│ "Cryptographic audit trail for     │
│  pull requests. Signed records,    │
│  stored in your Git."              │
├────────────────────────────────────┤
│ ## See it in action  [GIF/VIDEO]   │ ← FIRST IMPRESSION
│ - Install the GitHub App           │
│ - Open a PR                        │
│ - Get signed audit comment         │
│ - All evidence in your repo        │
├────────────────────────────────────┤
│ ## Three minutes setup             │
│ ```                                │
│ # Option 1: GitHub App (zero CLI)  │
│ # Install at gitgov.com/install    │
│ #                                  │
│ # Option 2: CLI                    │
│ npm i -g @gitgov/cli               │
│ gitgov init                        │
│ gitgov audit                       │
│ ```                                │
├────────────────────────────────────┤
│ ## What the audit captures         │
│ - Findings (signed by agent)       │
│ - Approvals (signed by reviewer)   │ ← refer pr_review_capture
│ - Waivers (signed by approver)     │
│ - Decisions (signed at each gate)  │
│                                    │
│ Verify any of these:               │
│ ```                                │
│ gitgov verify                      │ ← refer verify_command_alias
│ ```                                │
├────────────────────────────────────┤
│ ## Why "in your Git"?              │
│ (offline, no SaaS dep, your data) │
├────────────────────────────────────┤
│ ## The protocol behind it          │
│ (8 RFCs — moved DOWN, for          │
│  developers who want depth)        │
├────────────────────────────────────┤
│ ## Architecture / License / etc    │
└────────────────────────────────────┘

Cambio clave: lo concreto y demostrable arriba.
Lo abstracto e impresionante (8 RFCs) abajo,
para quien quiera profundizar.
```

---

## Propuesta (captura)

**No reescribir el README de cero.** Reordenar y reescribir solo las primeras 3 secciones (las que el visitor lee primero). Mantener el resto.

### Cambios concretos

**1. Tagline nueva (línea 4 del README)**

Hoy:
> "Every decision signed. Every exception auditable. Every report verifiable."
> "A cryptographic governance protocol built on Git."

Propuesto:
> "Every PR gets a signed audit trail. Stored in your Git. Verifiable offline."
> "A cryptographic governance protocol that lives where your code lives."

La tagline propuesta es **concreta** (PR audit trail) y **diferenciante** (in your Git, verifiable offline). La actual es **abstracta** (decisions, exceptions, reports — qué decisiones, qué reports?).

**2. Primera sección: "See it in action"**

Reemplaza el "## What is this?" abstracto. Estructura:

```markdown
## See it in action

[GIF or video — 30 seconds]

1. Install the GitHub App at [gitgov.com/install]
2. Open a pull request
3. Within seconds, an `agent:gitgov-audit` comment appears with:
   - Security findings (signed)
   - Code quality issues (signed)
   - Severity breakdown
4. Every finding is a `rec_xxxx.json` in your repo's `gitgov-state` branch
5. Verify offline anytime: `gitgov verify`

No SaaS dependency. No vendor lock-in. Your audit trail lives in your repo.
```

**3. Segunda sección: "Three minutes setup"**

Reemplaza el "## Quick Start" actual. Estructura:

```markdown
## Three minutes setup

### Option 1: GitHub App (zero CLI)
Install at [gitgov.com/install]. Your next PR is audited.

### Option 2: CLI
```bash
npm install -g @gitgov/cli
cd your-project
gitgov init
gitgov audit
```

Both options produce the same signed records. Use whichever fits your workflow.
```

**4. Tercera sección: "What the audit captures"**

Esta sección NO existe hoy. Es la que conecta el flow concreto (PR audit) con el potencial del protocolo (todo lo que se puede firmar). Estructura:

```markdown
## What the audit captures

Out of the box:
- **Findings** — security/quality issues, signed by `agent:gitgov-audit`
- **Approvals** — PR reviews, signed by reviewer  ← (when pr_review_capture ships)
- **Waivers** — exceptions with justification, signed by approver
- **Decisions** — gate evaluations, signed by policy engine

Verify any of these:
```bash
gitgov verify
```

Output:
```
Three Gates Verification — gitgov-state
  Gate 1 (Integrity):    487/487 ✓
  Gate 2 (Schema):       487/487 ✓
  Gate 3 (Signatures):   487/487 ✓

All verified offline.
```
```

**5. Mover "## The Protocol" (8 RFCs) más abajo**

La sección de los 8 RFCs es impresionante pero abstracta. Hoy es la 2da sección. Propuesto: moverla después de "What the audit captures" — para visitors que quieren profundizar después de entender qué hace el producto.

**6. Mover "## Talk to your project"**

La feature de "@gitgov, how are we doing?" es interesante pero no es el flow principal. Moverla a una sección de "Advanced features" o eliminarla del README principal.

---

## Archivos clave (refine)

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| `README.md` | repo root | El doc principal — reescribir secciones 1-3 | `README.md` |
| `brand_copy.md` | docs | Copy oficial — alinear taglines | `04_go_to_market/brand_copy.md` |
| `gitgov-hero.html` | artifacts | Hero animation con flow concreto | (visualizer artifact actual) |
| `landing_view.md` | saas-web | Spec de la landing del SaaS | `03_products/saas-web/specs/views/landing/landing_view.md` |
| `landing_brief.md` | saas-web | Brief de copy/diseño | `03_products/saas-web/specs/views/landing/landing_brief.md` |
| Posts de growth | docs | Alinear hooks de posts a la tagline nueva | `04_go_to_market/posts/*.md` |

---

## Plan paso a paso (refine)

**Pre-requisito:** Este input NO se ejecuta hasta que estén shipped:

1. ✅ AORCH-P1..P3 (en flight) — para que la afirmación "every finding becomes a signed record" sea real
2. ✅ `pr_review_capture_input.md` — para que la línea "Approvals signed by reviewer" sea real
3. ⚠️ `verify_command_alias_input.md` — para que el ejemplo `gitgov verify` exista

**Si reescribimos el README sin esos shipped, prometemos cosas que el repo no demuestra.** Eso es peor que el README actual.

### Fase 1 — Drafting (1 sesión, ~3 horas)

1. Crear branch `docs/readme-repositioning`
2. Reescribir secciones 1-3 según §"Cambios concretos" arriba
3. Grabar GIF/video de 30s del PR audit flow funcionando
4. Mantener el resto del README sin cambios

### Fase 2 — Internal review (1 sesión, ~1 hora)

5. Camilo + 1 reviewer leen el README nuevo "como visitor que nunca lo vio"
6. Identificar cualquier promesa que aún no esté demoable
7. Ajustar

### Fase 3 — Cross-update (1 sesión, ~2 horas)

8. Actualizar `brand_copy.md` con la tagline nueva
9. Actualizar 2-3 posts de `04_go_to_market/posts/` que tengan hooks similares
10. Actualizar la landing del SaaS si tiene tagline distinta
11. Actualizar el hero del `gitgov-hero.html` artifact

### Fase 4 — Merge + measurement (después de merge)

12. Merge a `main`
13. Trackear métricas:
    - GitHub stars antes/después (señal débil pero observable)
    - Time on page si tienen analytics en gitgov.com
    - npm install rate de `@gitgov/cli`
    - Conversaciones tipo "instalé y..." en Discord

---

## Verificación (refine)

No hay tests automatizables — es copy. Criterios de aceptación:

### Test A: el "explica como si tuviera 5 años"

Tomar a alguien técnico que NO conoce GitGov. Le mandás solo el README nuevo. Pregunta: *"¿Qué hace este producto?"*

- ❌ Si responde: "es un protocolo criptográfico de governance basado en Git" → README falló
- ✅ Si responde: "audita PRs y firma los findings, los datos quedan en tu repo" → README funciona

### Test B: el "qué pruebo primero"

Misma persona. *"¿Qué harías para probarlo?"*

- ❌ Si dice: "leería los RFCs" → enterramos el flow concreto
- ✅ Si dice: "instalaría la GitHub App o correría `gitgov init`" → bien

### Test C: el "promesa demostrable"

Cada afirmación del README debe ser ejecutable HOY:

- "Every PR gets a signed audit trail" → demoable post-AORCH-fix
- "Approvals signed by reviewer" → demoable post-pr_review_capture
- "Verify offline" → demoable post-verify_command_alias
- "Stored in your Git" → demoable hoy (gitgov-state existe)

Si alguna no es demoable, no entra al README hasta que lo sea.

---

## Preguntas de comprensión (obligatoria — captura)

**1. ¿Reescribir el README ahora arriesga sub-vender el producto?**

> Hint: sí, es un riesgo. El README actual transmite ambición; el propuesto transmite concreción. La ambición vende a investors; la concreción convierte a developers. La pregunta es a quién priorizamos en este momento (pre-customer). Mi voto es developers — sin developers usando el producto, los investors van a pasar igual.

**2. ¿Qué hacemos con la sección de los 8 RFCs?**

> Hint: NO eliminar. Mover abajo. Los 8 RFCs son la prueba de seriedad técnica que distingue a GitGov de "un wrapper de Git con una App". Pero esa prueba importa DESPUÉS de que el visitor entienda qué hace el producto, no antes.

**3. ¿La tagline propuesta es demasiado nicho ("PR audit trail")?**

> Hint: sí, pero es nicho ejecutable. La tagline actual es amplia y aspiracional. Las taglines amplias funcionan cuando tenés brand reconocido (Stripe, Vercel). En fase pre-customer, taglines nicho convierten mejor. Eventualmente, cuando GitGov audit sea adoptado, podemos ampliar la tagline a "governance protocol" porque ya tenemos el wedge instalado.

**4. ¿Cuánto tiempo dejar el README nuevo antes de evaluar?**

> Hint: mínimo 60 días. Métricas de README nuevo son ruidosas en plazos cortos. Si en 60 días las métricas (stars, installs, conversaciones) no mejoran, revisitar. Si mejoran, reforzar la dirección.

**5. ¿Este repositioning afecta el pricing model futuro?**

> Hint: sí, sutilmente. Si vendemos "PR audit con signed evidence", el pricing más natural es per-repo o per-PR. Si vendemos "governance protocol", el pricing natural es per-org. El repositioning empuja hacia el primero. Vale alinear pricing model conversation post-repositioning.

---

## EARS estimados (refine)

N/A — Es copy + GIF, no código. No hay EARS asociados.

Estimación de esfuerzo: **6-8 horas** total distribuidas en 3-4 sesiones.

---

## Notas adicionales

**Por qué este input depende de PR capture + verify alias + AORCH:**

Si reescribimos el README diciendo "Approvals signed by reviewer" cuando el handler no existe, mentimos. Si decimos "verify offline anytime: gitgov verify" cuando el comando no existe, mentimos. Si decimos "every finding becomes a signed record" mientras AORCH-P1..P3 está roto, mentimos.

Cada "mentira" en el README es una conversación perdida con un visitante técnico que prueba y se da cuenta. **El README solo se reescribe cuando las afirmaciones son verificables**.

**Por qué hacer el input igual ahora (aunque la ejecución espere):**

Capturar la decisión de repositioning ahora — con la lógica documentada — evita que cuando llegue el momento de ejecutar (después de los 3 ships), tengamos que reconstruir el razonamiento. La captura cuesta poco; la reconstrucción 3 meses después cuesta mucho más.

**Riesgo principal:**

Sub-vender. El README actual está optimizado para impresionar (8 RFCs, protocol, governance). El propuesto está optimizado para convertir (audit, signed, verify). Si los investors leen el README convertir-optimizado, pueden subestimar la ambición. Mitigación: dejar el bloque "## The protocol behind it" con los 8 RFCs claramente visible, solo que más abajo.

**Dependencias:**

- AORCH-P1..P3 fix (en flight) — bloqueante
- `pr_review_capture_input.md` — bloqueante
- `verify_command_alias_input.md` — bloqueante

Estimación de timing: si esos tres aterrizan en próximas 4-6 semanas, este input se ejecuta en semana 7-8.
