# Input: ADR — Por qué Ed25519 keyful en lugar de Sigstore como default

> Documento de input para futura epic.

**Fecha:** 2026-05-05
**Autor:** humano:camilo + agent:claude (deep review session)
**Origen:** Critical review session / respuesta #33 del agente
**Sesión:** recall_20_2026-05-04_rldx-e1-runner-puro-cli-l1
**Prioridad:** 🟡 Importante para DD — no urgente para producto
**Relacionado con:**
  - `01_foundations/` (donde vive el ADR a producir)
  - `competitive_landscape.md` (la decisión refuerza la posición competitiva)
  - `core/src/record_signer/` y `core/src/key_provider/` (implementación de la decisión)
**Destino:** Pendiente — produce 1 ADR estructurado. Bajo esfuerzo, alto valor en conversaciones técnicas

---

## Problema (captura)

GitGov tomó una decisión arquitectónica fundamental: usar **Ed25519 keyful con keys persistentes por actor** en lugar de **Sigstore keyless con OIDC efímero + Rekor**.

Esa decisión es defendible — y bien — pero **no está documentada**. Confirmado en respuesta #33 del review crítico:

> "No se evaluó formalmente. No hay ADR ni documento de decisión sobre Sigstore. Razones implícitas por el diseño: [...]"

El problema concreto:

1. **Cualquier auditor técnico, investor de DD, o miembro CNCF** que evalúe GitGov va a preguntar "¿por qué no Sigstore?". Hoy la respuesta vive en la cabeza del equipo, no en un documento.
2. **Sigstore es la primitiva de firma más adoptada del ecosistema cloud-native open source.** No considerarla en una decisión de arquitectura criptográfica es difícil de justificar sin documentación.
3. **El competitive landscape v2** menciona el riesgo "Sigstore extends to governance" como riesgo #2 de la tesis. Sin ADR formal, ese riesgo queda como afirmación verbal sin respaldo.

**Esta no es una feature del producto.** Es higiene estratégica. Pero en la fase actual (pre-customer, pre-fundraise), tener decisiones arquitectónicas documentadas vale más que código nuevo. Cinco horas de trabajo evitan cinco conversaciones incómodas.

---

## Diagramas (captura)

### Comparación de modelos de identidad

```
SIGSTORE (Keyless)                   GITGOV (Keyful)
──────────────────                   ────────────────

   Identity:                            Identity:
   OIDC token                           Ed25519 keypair
   (Google/GitHub/etc)                  (per actor, persistent)
        │                                    │
        ▼                                    ▼
   Fulcio CA issues                     Actor stores key
   ephemeral cert (10 min)              (Fs/Prisma/Env)
        │                                    │
        ▼                                    ▼
   Sign artifact with cert              Sign record with
   (cosign)                             RecordSigner
        │                                    │
        ▼                                    ▼
   Append entry to Rekor                Commit to gitgov-state
   (public transparency log)            (your repo)
        │                                    │
        ▼                                    ▼
   Cert expires immediately             Key persists for
                                        years until rotation

   Verification:                        Verification:
   1. Fetch cert from Rekor             1. Read public key from
   2. Validate cert was issued             ActorRecord in repo
      by Fulcio for given OIDC          2. Ed25519_Verify
      identity                          3. SHA-256 checksum
   3. Verify signature                  Done — offline.
   ⚠ Requires online Rekor lookup
```

### El cuadrante de decisión

```
                    Persistent identity
                          ↑
                          │
             GitGov ●     │     ● PGP / Sigstore "keyful mode" (rare)
                          │
                          │
   Online verify ◀────────┼────────▶ Offline verify
                          │
                          │
            Sigstore ●    │     ● ad-hoc raw signatures
            (typical)     │
                          │
                          ↓
                    Ephemeral identity
```

GitGov ocupa el cuadrante **persistent + offline**. Sigstore ocupa el cuadrante **ephemeral + online**. Son decisiones de arquitectura distintas para problemas distintos.

---

## Propuesta (captura)

Producir **un ADR estructurado** en `01_foundations/adrs/ADR-001-ed25519-vs-sigstore.md` siguiendo formato estándar (Context / Decision / Consequences / Alternatives Considered).

### Contenido propuesto del ADR (esqueleto)

```markdown
# ADR-001: Ed25519 keyful signing as default, not Sigstore

**Status:** Accepted
**Date:** 2026-05-05
**Decision-makers:** Camilo (founder), [team]

## Context

GitGov is a cryptographic governance protocol where every decision becomes
a signed record. The choice of signing primitive is foundational — it shapes
identity model, verification UX, key management complexity, and offline guarantees.

At the time of this decision, two viable approaches exist in the open-source
ecosystem:

1. **Ed25519 keyful** — each actor holds a persistent Ed25519 private key.
   Records are signed with this key. Verification reads the public key from
   the actor's record and validates Ed25519 + SHA-256 checksum offline.

2. **Sigstore keyless** — actors authenticate via OIDC, receive ephemeral
   certificates from Fulcio (10 min lifetime), sign with the cert, and append
   to Rekor (public transparency log). Verification fetches the cert from
   Rekor and validates against the OIDC identity provider.

## Decision

GitGov uses **Ed25519 keyful signing as the default and only initial implementation.**

Sigstore is NOT integrated as a backend at this stage. A future
`SigstoreSigningProvider` may be added (Q3-Q4 2026) as an optional alternative
backend, NOT as a replacement.

## Rationale

### 1. Offline-first is a core product property

The pitch "verifiable offline" is non-negotiable. Sigstore verification
requires Rekor (online transparency log). Even if cert validation can be
cached, the model assumes connectivity. For air-gapped, regulated, or
sensitive environments, Sigstore introduces dependency we cannot remove.

### 2. Persistent identity matches governance semantics

Governance records carry semantic identity claims like "Alice signed as
security-lead during 2024-2026". Sigstore's ephemeral certs collapse this
into "an OIDC session signed something at moment X". The mental model breaks
when verifying records years after signing — the OIDC session no longer exists.

GitGov treats actor identity as a first-class persistent concept (RFC-02).
Sigstore would require maintaining an external mapping between OIDC identities
and persistent actorIds, reintroducing complexity we eliminated.

### 3. Implementation simplicity for protocol adoption

Ed25519 + SHA-256 is implementable in any language with libsodium (~50 LOC).
A third-party Spanish-language community can implement GitGov without
integrating with Fulcio, Rekor, or the broader Sigstore stack.

Standards win when implementation cost is low. Adding Sigstore as a hard
dependency raises the floor and reduces the protocol's portability.

### 4. Key management is simpler than expected

The concern with keyful systems is key management complexity. We mitigate this:
- FsKeyProvider for development (file with 0600 perms)
- PrismaKeyProvider for SaaS (3-level hierarchy with HKDF + AES-GCM)
- EnvKeyProvider for CI (secret manager handles wrapping)

These three backends cover all common deployment scenarios. Future backends
(KMS, HSM) can be added without protocol changes.

## Alternatives considered

### A. Sigstore as default

Rejected. Reasons above.

### B. Hybrid: GitGov for organizational records, Sigstore for build artifacts

Considered. This is in fact the recommended deployment for teams using both.
GitGov does not replace Sigstore for supply-chain artifact signing — they're
complementary. But within the GitGov protocol, signing is uniformly Ed25519.

### C. PGP / GPG keys

Rejected. PGP is heavyweight, has poor UX, key management is notoriously
painful, and the ecosystem is fragmented (GnuPG vs OpenPGP.js vs Sequoia).
Ed25519 raw is simpler and more portable.

### D. ECDSA P-256

Considered. Ed25519 chosen for: smaller signatures (64 vs ~70 bytes),
deterministic signing (no nonce reuse risk), simpler implementations,
broader audit history. ECDSA is also valid; preference is taste-driven.

## Consequences

### Positive

- Records verify offline with no external dependencies
- Protocol is implementable in ~50 lines of crypto code
- Persistent actor identity maps cleanly to organizational governance
- Backend pluggability (Fs/Prisma/Env) covers deployment scenarios
- Decision is reversible: a SigstoreSigningProvider can be added as optional
  backend later without breaking existing records

### Negative

- We don't get the "free" identity federation that Sigstore provides via OIDC
- Each actor must onboard with key generation (vs "log in with GitHub" UX)
- We don't appear in the Sigstore/CNCF supply-chain narrative by default
- Compromised keys are valid until revoked (vs Sigstore's 10-min expiry
  reducing blast radius)

### Mitigations for negatives

- Future SigstoreSigningProvider for teams that prefer OIDC identity
- Key rotation tooling (already partially implemented via PrismaKeyProvider
  archived/active states)
- Bridge to Sigstore via `SigstoreSigningProvider` in Q3-Q4 2026
- Document the decision (this ADR) for DD conversations

## Revisit triggers

This decision should be revisited if:

- Sigstore adds first-class support for persistent identity (current proposals
  exist but not landed as of 2026-05)
- Sigstore extends to semantic governance attestation types
- An anchor customer requires Sigstore compatibility as deployment condition
- Industry standards adopt Sigstore as required for governance evidence

## References

- Sigstore architecture: sigstore.dev/architecture
- in-toto specification: in-toto.io/specs
- RFC-01 (GitGov Embedded Metadata): 02_protocol/01_embedded.md
- RFC-02 (GitGov Actor): 02_protocol/02_actor.md
- Competitive landscape v2: 04_go_to_market/competitive_landscape.md
```

---

## Archivos clave (refine)

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| `ADR-001-...` (nuevo) | docs | El ADR final | `01_foundations/adrs/ADR-001-ed25519-vs-sigstore.md` |
| `01_foundations/README.md` | docs | Index — agregar link al ADR | `01_foundations/README.md` |
| `licensing_strategy.md` | docs | Referenciar ADR en discusión de moat | `01_foundations/licensing_strategy.md` |
| `competitive_landscape.md` | go-to-market | Cruzar referencia desde el riesgo Sigstore | `04_go_to_market/competitive_landscape.md` |

---

## Plan paso a paso (refine)

**Sesión única (~3-5 horas):**

1. **Investigación previa (30 min)** — leer:
   - sigstore.dev/architecture
   - Una o dos discusiones de la comunidad Sigstore sobre persistent identity
   - in-toto.io/specs (para diferenciar)

2. **Draft del ADR (2 horas)** — usar el esqueleto de §"Propuesta" arriba

3. **Review interna (30 min)** — Camilo + 1 reviewer técnico cruzando la decisión

4. **Iteración + commit (30 min)** — refinar según feedback, commit a `01_foundations/adrs/`

5. **Cross-references (30 min)** — actualizar `competitive_landscape.md` y `01_foundations/README.md` para apuntar al ADR

**No hay Cycle 2.** Es un documento. Una vez aceptado, vive.

---

## Verificación (refine)

No hay tests automatizables — es un documento. Criterios de aceptación:

- ✅ ADR existe en `01_foundations/adrs/` con formato consistente
- ✅ Cubre las 4 secciones: Context / Decision / Consequences / Alternatives
- ✅ Identifica al menos 3 razones técnicas concretas para la decisión (no marketing)
- ✅ Lista al menos 3 negativos honestos (no whitewashing)
- ✅ Define triggers de revisión explícitos
- ✅ Linkeado desde `01_foundations/README.md` y referenciado en `competitive_landscape.md`
- ✅ Pasa una "lectura de adversario": un reviewer técnico hostil leyendo el ADR no encuentra contradicciones obvias

---

## Preguntas de comprensión (obligatoria — captura)

**1. ¿Esta decisión es realmente irrevocable, o es path-dependent?**

> Hint: la respuesta correcta es path-dependent. Hoy elegimos Ed25519. Mañana puede haber un `SigstoreSigningProvider` opcional. El ADR debe enmarcar la decisión como "default actual" no como "decisión eterna". Eso baja la presión de la decisión y la hace más fácil de defender.

**2. ¿Hay algún caso de uso donde Sigstore sería estrictamente superior a Ed25519 para GitGov?**

> Hint: sí — agentes serverless efímeros donde key management es dolor. Para esos, Sigstore + workload identity es mejor. El ADR debe reconocerlo y ofrecer el SigstoreSigningProvider como ruta futura para ese caso.

**3. ¿Cuál es el costo real de NO escribir este ADR?**

> Hint: en cada conversación con DD, investor técnico, o periodista de seguridad, la pregunta sale. Sin ADR, la respuesta varía según quién esté en la sala. Con ADR, la respuesta es un link. Costo = ~5 horas. Beneficio = consistency en N conversaciones futuras.

**4. ¿El ADR debe ser público o interno?**

> Hint: público. La transparencia sobre decisiones arquitectónicas es parte del posicionamiento de GitGov ("we open-source how we think"). Un ADR público también filtra a los desarrolladores que aprecian este nivel de rigor.

**5. ¿Qué hacemos cuando Sigstore agregue persistent identity (si lo hacen)?**

> Hint: revisar el ADR. Posiblemente upgrade el SigstoreSigningProvider a "supported" en lugar de "optional alternative". El ADR DEBE listar este trigger explícitamente para que sea fácil revisitar.

---

## EARS estimados (refine)

N/A — Es un documento, no código. No hay EARS asociados.

Estimación de esfuerzo: **3-5 horas** total (una sesión).

---

## Notas adicionales

**Por qué este input es importante pese a no ser feature:**

Es la versión más barata posible de "blindaje en DD". Cuesta 5 horas, vale en 5+ conversaciones. La fase actual del producto (pre-customer, pre-Series A) recompensa este tipo de higiene sobre features nuevas.

**Quién es el lector del ADR:**

- Investors técnicos haciendo DD
- Security researchers escribiendo blog posts sobre GitGov
- Members CNCF / Linux Foundation evaluando GitGov para incubation
- Developers OSS considerando implementar el protocolo en otros lenguajes
- Compliance officers preguntando "por qué no usan el estándar X"

Todos esos lectores valoran "decision was made deliberately with tradeoffs documented" más que "decision was made because X is better". El ADR debe transmitir deliberación, no superioridad.

**Riesgo de no hacerlo:**

Cada vez que la pregunta "¿por qué no Sigstore?" salga sin ADR, la respuesta verbal del equipo va a variar. Inconsistencia en respuestas técnicas en fase pre-funding daña credibilidad más que cualquier feature missing.

**Dependencias:** ninguna. Se puede empezar hoy.
