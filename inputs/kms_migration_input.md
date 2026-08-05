# Input: KMS Migration — Migrar MASTER_KEY de env var a Key Management Service (APARCADO)

> Documento de input para futura epic. **APARCADO** — deuda técnica conocida, NO se ejecuta hasta que el primer cliente con compliance enterprise lo requiera.

**Fecha:** 2026-05-08
**Autor:** humano:camilo (founder) + agent:claude-opus-4-7 (consultoría estratégica)
**Origen:** sesión estratégica gitgov pivot — análisis de seguridad para MVP
**Sesión:** post-decisión "MASTER_KEY en env var es OK para MVP"
**Prioridad:** **Baja (aparcado)** — se reactiva con primer cliente compliance enterprise
**Relacionado con:** `release_v1_input.md` (decisión de mantener env var en MVP), `clone_migration_input.md` (también aparcado), `marketplace_sandbox_input.md` (también aparcado)
**Destino:** **NO crear epic todavía.** Mantener este input en `specs/epics/inputs/` con label "aparcado" hasta primer requerimiento explícito de cliente.

---

## Problema (captura)

GitGov usa una jerarquía de claves criptográficas de 3 niveles para encriptar y firmar records:

```
Nivel 1: MASTER_KEY (root)
   │
   ▼  (HKDF derivation)
Nivel 2: OrgEncryptionKey (por organización)
   │
   ▼  (ECDH X25519 + HKDF)
Nivel 3: ActorKey (por actor en la org)
```

**Implementación actual:**
- MASTER_KEY vive en una variable de entorno (`MASTER_KEY=<base64>`)
- El servidor (saas-api, saas-worker) lee la env var al arrancar
- La clave queda residente en memoria del proceso
- En Cloud Run con Secret Manager, la env var se inyecta desde Secret Manager al boot

**Esto significa:**
- La MASTER_KEY toca la memoria del servidor
- Si el servidor se compromete (RCE, container escape), la clave es legible
- Si los logs accidentalmente dumpean env (ej. `process.env` en error), la clave podría leakearse
- Si un developer hace SSH al container con permisos suficientes, puede leer la clave
- Backup de la clave es responsabilidad del operador (config manual)

**Modelo enterprise estándar (lo que se conoce como "KMS adoption"):**

```
Nivel 0: KMS service (AWS KMS, GCP KMS, Azure Key Vault, HashiCorp Vault)
   │
   │  Server NUNCA toca la clave directamente
   │  Server pide al KMS: "descifra esto" o "firma esto"
   │  KMS responde con resultado, sin exponer la clave
   │
   ▼
Nivel 1: MASTER_KEY (vive solo en KMS, nunca sale)
   │
   ▼  (operations via KMS API)
Nivel 2: OrgEncryptionKey (encriptada con MASTER_KEY via KMS)
   │
   ▼  (operations via KMS API)
Nivel 3: ActorKey (encriptada con OrgEncryptionKey via KMS)
```

**Ventajas del modelo KMS:**
- La clave nunca toca la memoria del servidor application
- Audit log completo de cada operación criptográfica (quién pidió descifrar qué, cuándo)
- Rotation managed: KMS rota la clave sin intervención del servidor
- HSM-backed (hardware security module) para nivel financiero/healthcare
- Integración con IAM enterprise (acceso por identidad, no por env var)
- Cumple requisitos de SOC 2 Type II, PCI DSS, HIPAA, FedRAMP (con KMS apropiado)

**Desventajas / costos del modelo KMS:**
- Cada operación criptográfica es una request al KMS (latencia ~10-50ms vs <1ms in-memory)
- Costo: AWS KMS cobra $1/clave/mes + $0.03/10000 operations. Para volumen MVP es despreciable, pero suma a escala.
- Vendor lock-in: KMS de AWS solo funciona en AWS. Migrar entre clouds requiere abstraction layer (HashiCorp Vault) o re-arquitectura.
- Complejidad operativa: configuración IAM correcta es no-trivial. Errores comunes (over-permissive policies, accidentally deleting key) son costosos.
- Disponibilidad: si KMS cae (raro pero pasa), tu app cae. Caching local es complicado de hacer correctamente.

**Decisión confirmada por usuario (2026-05-08):**

> "MASTER_KEY en env var es OK para MVP. Cuando primer cliente compliance pregunte 'dónde guardan la master key?' volvemos."

**Por qué env var es OK para MVP:**

1. **Threat model realista para MVP:** El producto en MVP no maneja datos críticos sensitivos del cliente — maneja findings de SAST y waivers, que son metadatos sobre código, no el código mismo (en SaaS hosted) o datos personales/financieros.
2. **Cloud Run + Secret Manager ya proveen:** seguridad razonable. El secret está encriptado at-rest en Secret Manager, se inyecta como env var en runtime, no se logguea por default, y el container está aislado.
3. **Compliance actual no exige KMS:** Solo SOC 2 Type II / PCI DSS / HIPAA / FedRAMP exigen KMS-grade key management. Los design partners de Bloque D probablemente NO requieren esto.
4. **Migración es 2-4 semanas de trabajo:** que NO produce valor visible al usuario MVP. Inversión solo se justifica con cliente esperando que lo paga.

**Triggers para reactivar este input:**

1. **Primer cliente con requisito explícito de compliance** (SOC 2 audit, PCI assessment, HIPAA contract) que pregunte sobre key management.
2. **RFP de enterprise** que tenga sección "Cryptographic key management" con score weighted.
3. **Incidente de seguridad** (incluso simulado en pentest) que muestre exposure de la clave en escenario realista.
4. **Cambio regulatorio** en EU (AI Act, NIS2) que exija KMS-grade para AI governance tools.
5. **Decisión estratégica** de moverse a segmento enterprise como producto principal (en cuyo caso KMS es de los muchos pre-requisitos).

Sin esos triggers, mantener env var es la decisión correcta.

---

## Diagramas

### Estado actual (env var)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   GCP Cloud Run                                                  │
│                                                                  │
│   ┌─────────────────────────────────────────────────────┐        │
│   │  Container: saas-api                                │        │
│   │                                                     │        │
│   │  Env: MASTER_KEY=<base64-encoded-32-bytes>          │        │
│   │           ▲                                         │        │
│   │           │ inyectado desde Secret Manager          │        │
│   │           │                                         │        │
│   │  Code:    ▼                                         │        │
│   │  const masterKey = Buffer.from(                     │        │
│   │    process.env.MASTER_KEY!, 'base64'                │        │
│   │  );                                                 │        │
│   │  // masterKey en memoria del proceso                │        │
│   │                                                     │        │
│   └─────────────────────────────────────────────────────┘        │
│                                                                  │
│   ┌─────────────────┐                                            │
│   │  Secret Manager │                                            │
│   │  master-key     │                                            │
│   │  (encrypted at  │                                            │
│   │   rest)         │                                            │
│   └─────────────────┘                                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

Threat surface:
- RCE en saas-api → MASTER_KEY readable from process memory
- Accidental log of process.env → MASTER_KEY in logs
- Container escape → host filesystem access → potential MASTER_KEY exposure
- Compromised IAM role → can read Secret Manager
- Compromised cloud account → game over
```

### Estado futuro (KMS, si se reactiva)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   GCP Cloud Run                                                  │
│                                                                  │
│   ┌─────────────────────────────────────────────────────┐        │
│   │  Container: saas-api                                │        │
│   │                                                     │        │
│   │  No master key in memory ever                       │        │
│   │                                                     │        │
│   │  Code:                                              │        │
│   │  const kms = new KMSClient();                       │        │
│   │  const decrypted = await kms.decrypt({              │        │
│   │    keyId: 'projects/.../master-key',                │        │
│   │    ciphertext: orgEncryptedKey                      │        │
│   │  });                                                │        │
│   │  // KMS responde con OrgEncryptionKey decrypted     │        │
│   │  // MASTER_KEY nunca toca este servidor             │        │
│   │                                                     │        │
│   └────────────────┬────────────────────────────────────┘        │
│                    │                                             │
│                    │ KMS API call                                │
│                    ▼                                             │
│   ┌─────────────────────────────────────────────────────┐        │
│   │  GCP Cloud KMS                                      │        │
│   │                                                     │        │
│   │  ┌──────────────────────────────────────┐           │        │
│   │  │ Key: master-key                      │           │        │
│   │  │   - HSM-backed (FIPS 140-2 Level 3)  │           │        │
│   │  │   - IAM-controlled access            │           │        │
│   │  │   - Rotation managed                 │           │        │
│   │  │   - Audit log per operation          │           │        │
│   │  └──────────────────────────────────────┘           │        │
│   │                                                     │        │
│   └─────────────────────────────────────────────────────┘        │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

Threat surface (reduced):
- RCE en saas-api → can call KMS, but only with permitted operations
  → IF rate-limited, attacker can't exfiltrate all keys at once
  → Audit log shows attacker calls
- Accidental log → no MASTER_KEY to log
- Container escape → no MASTER_KEY on host
- Compromised IAM role → bounded by KMS IAM permissions
- Compromised cloud account → still bad, but KMS adds defense-in-depth
```

### Flujo de migración (cuando se reactive)

```
Phase 1 (1 semana): Abstraction layer
  ├── Crear KeyProvider interface
  ├── EnvVarKeyProvider (current behavior)
  ├── KmsKeyProvider (new, GCP/AWS/Vault implementations)
  └── Tests unitarios paridad

Phase 2 (1 semana): Migración orgs nuevas
  ├── Default KmsKeyProvider para nuevas orgs
  ├── EnvVarKeyProvider mantiene orgs existentes
  ├── Feature flag por org
  └── Validar paridad funcional

Phase 3 (1 semana): Migración orgs existentes
  ├── Para cada org: re-encrypt OrgEncryptionKey via KMS
  ├── Migración offline (org en mantenimiento brief)
  ├── Validación post-migración
  └── Toggle org a KmsKeyProvider

Phase 4 (1 semana): Documentation + monitoring
  ├── Update reference docs
  ├── Monitoring de KMS operations
  ├── Alertas de KMS errors
  └── Deprecation timeline para EnvVarKeyProvider
```

---

## Propuesta (cuando se reactive)

**NOTA: Esta sección documenta la propuesta TENTATIVA para cuando se reactive el input. NO ejecutar hasta que se cumplan triggers.**

### Sub-bloque KM.1 — Abstraction layer (semana 1)

**Trabajo:**

1. **Definir `IKeyProvider` interface**
   ```typescript
   interface IKeyProvider {
     deriveOrgKey(orgId: string): Promise<Buffer>;
     encrypt(plaintext: Buffer, keyContext: KeyContext): Promise<EncryptedBlob>;
     decrypt(blob: EncryptedBlob, keyContext: KeyContext): Promise<Buffer>;
     sign(data: Buffer, keyContext: KeyContext): Promise<Signature>;
     verify(data: Buffer, signature: Signature, keyContext: KeyContext): Promise<boolean>;
   }
   ```

2. **Implementar `EnvVarKeyProvider`** (current behavior)
   - Lee MASTER_KEY de env var
   - Deriva keys via HKDF localmente
   - Encrypts/decrypts via AES-GCM in-process
   - Mismas APIs que el código actual

3. **Implementar `KmsKeyProvider` (GCP)**
   - Usa GCP Cloud KMS para operaciones criptográficas
   - MASTER_KEY vive en KMS, nunca en proceso
   - OrgEncryptionKey y ActorKey encriptadas with envelope encryption
   - Caching local (con TTL corto) para evitar request por operación

4. **Implementar `KmsKeyProvider` (AWS)** [opcional, futuro]
   - Mismo modelo pero con AWS KMS
   - Permite multi-cloud o migración a AWS

5. **Tests unitarios paridad**
   - Mismos tests para ambos providers
   - Validar comportamiento idéntico (mismos plaintexts produce mismos resultados después de decrypt)

### Sub-bloque KM.2 — Feature flag por org (semana 2)

**Trabajo:**

1. **Schema migration**
   - Tabla `organizations` añade columna `key_provider: "env_var" | "kms"`
   - Default `"env_var"` para orgs existentes
   - Default `"kms"` para orgs nuevas (post-migration)

2. **Provider selection per request**
   - Cada operación criptográfica resuelve el provider basado en org
   - `getKeyProviderForOrg(orgId): IKeyProvider`
   - Sin cambios en business logic — la abstracción está en el layer de keys

3. **Tests integración**
   - Org con `env_var` → usa EnvVarKeyProvider
   - Org con `kms` → usa KmsKeyProvider
   - Ambas producen findings/waivers válidos verificables

### Sub-bloque KM.3 — Migración de orgs existentes (semana 3)

**Trabajo:**

1. **Migration script**
   - Para cada org `key_provider="env_var"`:
     - Decrypt OrgEncryptionKey con env var (current path)
     - Re-encrypt con KMS envelope (new path)
     - Update record con new ciphertext
     - Toggle `key_provider="kms"`
   - Idempotente, resumable, testeado en staging primero

2. **Comunicación a clientes**
   - Email de aviso: "estamos mejorando key management"
   - Window de mantenimiento corto si necesario (5-10 min)
   - Sin downtime visible a usuarios externos

3. **Rollback plan**
   - Si migración falla mid-flight: rollback a `env_var`
   - Si KMS falla post-migración: feature flag global toggle a `env_var` temporal mientras se debugea

### Sub-bloque KM.4 — Documentation + monitoring (semana 4)

**Trabajo:**

1. **Update reference docs**
   - `docs/reference/security_architecture.md` con KMS flow
   - Diagramas actualizados
   - Threat model formalizado

2. **Compliance documentation**
   - "GitGov Key Management" whitepaper para clientes enterprise
   - SOC 2 / PCI DSS alignment doc
   - Pen test report (tras KMS migration)

3. **Monitoring**
   - Cloud KMS metrics: latency, errors, throttling
   - Alertas: KMS errors, latency P99 >100ms, throttling events
   - Audit log integration: cada KMS operation logged

4. **Cost tracking**
   - Dashboard de KMS costs por org
   - Alertas si costos exceden threshold

---

## Archivos clave (cuando se reactive)

| Archivo | Repo | Qué contiene | Path completo |
|---------|------|--------------|---------------|
| key_provider.ts | gitgovernance/gitgov | NUEVO — `IKeyProvider` interface | `packages/core/src/crypto/key_provider.ts` |
| env_var_key_provider.ts | gitgovernance/gitgov | NUEVO — implementation actual refactorizada | `packages/core/src/crypto/env_var_key_provider.ts` |
| kms_key_provider_gcp.ts | gitgovernance/gitgov | NUEVO — GCP KMS implementation | `packages/core/src/crypto/kms_key_provider_gcp.ts` |
| kms_key_provider_aws.ts | gitgovernance/gitgov | NUEVO opcional — AWS KMS implementation | `packages/core/src/crypto/kms_key_provider_aws.ts` |
| key_module.ts | gitgovernance/gitgov | Modificar para usar `IKeyProvider` via factory | `packages/core/src/crypto/key_module.ts` |
| Migration script | gitgovernance/gitgov | NUEVO — script de migración orgs | `scripts/migrate_org_to_kms.ts` |
| Schema migration Prisma | gitgovernance/gitgov | NUEVO — añade columna key_provider | `packages/saas-api/prisma/migrations/*_add_key_provider.sql` |
| security_architecture.md | gitgovernance/gitgov | Update con KMS flow | `docs/reference/security_architecture.md` |

---

## Plan paso a paso (cuando se reactive)

**ESTADO ACTUAL: APARCADO. NO ejecutar.**

Si triggers se cumplen y se reactiva:

### Sesión 1 — Validación de triggers
1. Documentar cliente / requirement / regulación que activa
2. Estimar: ¿es UN cliente con compliance, o tendencia? Diferenciar one-off vs estructural.
3. Decisión formal de reactivar (acta)

### Semana 1 — Abstraction layer
4. Definir `IKeyProvider` interface
5. Implementar `EnvVarKeyProvider` (refactor del código actual)
6. Implementar `KmsKeyProvider` (GCP)
7. Tests unitarios paridad

### Semana 2 — Feature flag
8. Schema migration: añadir `key_provider` column
9. `getKeyProviderForOrg(orgId): IKeyProvider` factory
10. Tests integración: orgs con cada provider funcionan
11. Default `kms` para orgs nuevas (post-migration)

### Semana 3 — Migración existentes
12. Script de migración idempotente
13. Test en staging con orgs reales
14. Comunicación a clientes (email aviso)
15. Migración en producción con monitoring activo
16. Rollback plan validado

### Semana 4 — Documentation + monitoring
17. Update `docs/reference/security_architecture.md`
18. Whitepaper "GitGov Key Management" (para enterprise)
19. SOC 2 / PCI DSS alignment doc
20. Cloud Monitoring dashboards + alertas
21. Cost tracking dashboard

---

## Verificación (cuando se reactive)

```bash
# 1. Tests paridad
cd packages/core && npm test crypto/key_provider
# Tests deben pasar para ambos providers (env_var + kms)

# 2. Migración script idempotente
node scripts/migrate_org_to_kms.ts --org-id=test-org-123 --dry-run
# Verificar plan
node scripts/migrate_org_to_kms.ts --org-id=test-org-123
# Ejecutar
node scripts/migrate_org_to_kms.ts --org-id=test-org-123  # 2da vez
# Debe ser no-op

# 3. Smoke test post-migración
# Verificar que findings/waivers de org migrada se pueden:
# - Crear (encrypt via KMS)
# - Leer (decrypt via KMS)
# - Validar firmas (verify via KMS)

# 4. Performance benchmark
node packages/core/benchmarks/key_provider_perf.ts
# env_var: ~0.1ms/op
# kms: ~10-50ms/op (red, latencia KMS)
# Verificar que UX no se degrada significativamente

# 5. Monitoring activo
# Cloud Monitoring dashboard muestra KMS operations sin errores
gcloud monitoring metrics list --filter="cloudkms"
```

**Criterios de éxito (cuando se reactive):**

- [ ] Triggers documentados con evidencia
- [ ] `IKeyProvider` interface implementado
- [ ] `EnvVarKeyProvider` y `KmsKeyProvider` (GCP) en paridad funcional
- [ ] Schema migration aplicada
- [ ] Migración script idempotente y testeado
- [ ] Orgs nuevas usan KMS por default
- [ ] Orgs existentes migradas sin downtime
- [ ] Documentation actualizada (security_architecture, whitepaper)
- [ ] Monitoring + alertas activas
- [ ] Performance dentro de SLA (P99 latency increase aceptable)

---

## Preguntas de comprensión

### Comprensión (must-pass — sin estas no puede empezar)

**[1] ¿Cuál es el estado actual y por qué está aparcado?**
hint: Sección "Decisión confirmada por usuario". MASTER_KEY en env var con Cloud Run + Secret Manager es seguridad razonable para MVP. Migración a KMS es 2-4 semanas que NO producen valor visible al usuario MVP. Inversión solo se justifica con cliente compliance esperando que paga. Aparcado hasta primer requirement explícito.

**[2] ¿Cuáles son los triggers que reactivan este input?**
hint: Sección "Triggers para reactivar". 5 triggers: T1 (cliente compliance pregunta), T2 (RFP enterprise con weighting), T3 (incidente de seguridad), T4 (cambio regulatorio EU), T5 (decisión estratégica de pivot a enterprise). Si NO se cumple ninguno en review schedule (cada 4 semanas), mantener aparcado.

**[3] ¿Qué se hace con este input mientras está aparcado?**
hint: Sección "Destino". Mantener en `specs/epics/inputs/` con label "aparcado". Schedule de review cada 4 semanas. NO crear epic, NO empezar trabajo, NO modificar código de crypto. El input es referencia: "esto está identificado como deuda, sabemos cuándo lo activamos".

### Profundización (weighted — entender el diseño)

**[4] ¿Por qué env var con Secret Manager es OK para MVP?**
hint: Sección "Por qué env var es OK para MVP". (a) Threat model realista — el producto maneja metadatos sobre código, no datos críticos sensitivos. (b) Cloud Run + Secret Manager proveen aislamiento + at-rest encryption razonable. (c) Compliance MVP no exige KMS (solo SOC 2 Type II / PCI / HIPAA / FedRAMP). (d) Migración produce 0 valor visible — solo justificada cuando cliente paga por ello.

**[5] ¿Qué cambia técnicamente al migrar a KMS?**
hint: Sección "Estado futuro (KMS)". (a) MASTER_KEY nunca toca memoria del servidor — vive en KMS HSM-backed. (b) Cada operación criptográfica es request al KMS (latencia ~10-50ms vs <1ms in-memory). (c) Audit log completo por KMS de cada operación. (d) Rotation managed por KMS. (e) Vendor lock-in con cloud específico (GCP KMS solo en GCP).

**[6] ¿Cómo se mantiene paridad funcional durante migración?**
hint: Sección "Sub-bloque KM.1 → 5. Tests unitarios paridad". `IKeyProvider` interface garantiza que ambos providers (env_var + kms) tienen mismas APIs. Tests unitarios validan comportamiento idéntico: dado mismo plaintext + key context, ambos producen ciphertexts decryptable a mismo plaintext. La implementation interna difiere, la API y el resultado son idénticos.

**[7] ¿Por qué multi-cloud (GCP + AWS) es opcional y futuro?**
hint: Sección "Sub-bloque KM.1 → 4. Implementar KmsKeyProvider (AWS)". Multi-cloud agrega complejidad de abstracción + testing matrix duplicado. Para MVP enterprise, GCP KMS solo (asumiendo deploy en GCP) es suficiente. Multi-cloud aplica solo cuando: (a) cliente requiere AWS specifically, (b) se decide multi-cloud strategy. Para 95% de casos: GCP KMS only.

### Verificación (bonus — confirmar scope)

**[8] ¿Qué evidencia se necesita para reactivar este input?**
hint: Sección "Sesión 1 — Validación de triggers". Cliente compliance con requirement explícito (en RFP, contrato, o conversación documentada), regulación nueva, o decisión estratégica de pivot a enterprise como producto principal. NO reactivar por especulación o "feels safer".

**[9] ¿Qué pasa si KMS falla en producción post-migración?**
hint: Sección "Sub-bloque KM.3 → 3. Rollback plan". Feature flag global toggle a `env_var` temporal. KMS errors típicamente son raros (cloud providers tienen 99.99% SLA), pero defensa: monitoring activo, alertas tempranas, rollback path probado. Si KMS down >5 min: degraded mode con cached keys (con TTL corto) o downtime explicable a clientes con SLA.

**[10] ¿Cuál es el costo operativo del KMS comparado con env var?**
hint: Sección "Desventajas / costos del modelo KMS". AWS KMS: $1/clave/mes + $0.03/10k operations. Para volumen MVP (1000 orgs, 100 ops/dia/org): ~$1k+/mes. GCP KMS similar. Latencia: ~10-50ms/op vs <1ms in-memory. Costo despreciable para producto enterprise pricing $X00-X000/mo, pero no zero.

**[11] ¿Cómo se relaciona este input con `clone_migration_input.md` y `marketplace_sandbox_input.md`?**
hint: Los tres son inputs aparcados con triggers de reactivación específicos. `kms_migration` reactiva por compliance enterprise. `clone_migration` reactiva por escala/performance. `marketplace_sandbox` reactiva por launch del marketplace. Comparten modelo: deuda documentada, triggers explícitos, schedule de review, NO ejecutar mientras esté aparcado.

---

## EARS estimados (cuando se reactive)

| ID | Requisito |
|----|-----------|
| KM-A1 | WHEN system needs to derive OrgKey, THE KeyProvider SHALL produce key without exposing master key |
| KM-A2 | WHEN encrypt called with KmsKeyProvider, THE system SHALL invoke KMS API and never load master key into memory |
| KM-A3 | WHEN decrypt called with KmsKeyProvider, THE system SHALL request decryption from KMS and receive only the result |
| KM-A4 | WHEN KMS API call fails, THE system SHALL retry with exponential backoff up to 3 times |
| KM-A5 | WHEN KMS returns rate limit error, THE system SHALL queue request and retry |
| KM-B1 | WHEN org has key_provider="env_var", THE system SHALL use EnvVarKeyProvider |
| KM-B2 | WHEN org has key_provider="kms", THE system SHALL use KmsKeyProvider |
| KM-B3 | WHEN feature flag toggled, THE system SHALL respect new provider on next operation without restart |
| KM-C1 | WHEN migration script runs for org, THE org's OrgEncryptionKey SHALL be re-encrypted via KMS |
| KM-C2 | WHEN migration script re-runs (idempotent), THE script SHALL detect already-migrated orgs and skip |
| KM-C3 | WHEN migration fails mid-flight, THE org SHALL remain in env_var mode (no partial state) |
| KM-D1 | WHEN KMS operation logged, THE audit log SHALL include: org_id, operation_type, timestamp, success/failure |
| KM-D2 | WHEN KMS errors exceed threshold (P99 >100ms or error_rate >1%), THE monitoring SHALL alert |
| KM-E1 | WHEN performance benchmark run, THE KmsKeyProvider P95 latency SHALL be <50ms per operation |
| KM-E2 | WHEN concurrent operations run, THE KmsKeyProvider SHALL handle concurrency without race conditions |

---

## Scope estimado (cuando se reactive)

**Trabajo nuevo (estimado):**
- `IKeyProvider` interface (~50 líneas)
- `EnvVarKeyProvider` refactor (~200 líneas)
- `KmsKeyProvider` GCP (~400 líneas)
- `KmsKeyProvider` AWS (opcional, ~400 líneas)
- Tests unitarios + paridad (~600 líneas)
- Schema migration Prisma (~30 líneas)
- Migration script (~300 líneas)
- Documentation: security_architecture, whitepaper, compliance docs (~5 docs)
- Monitoring dashboards + alertas (config en GCP)

**Trabajo de DevOps:**
- Crear KMS keys en GCP (1 master key + scaffolding)
- Configurar IAM (least-privilege para Cloud Run service accounts)
- Configurar audit log para KMS operations
- Cost tracking dashboard

**Riesgo (cuando se reactive):**
- **Medio-Alto**. Crypto refactor tiene blast radius enorme — bug aquí puede hacer findings unverifiable. Riesgo de migration script: re-encrypt con bug puede dejar orgs en estado irrecoverable. Mitigación: testing exhaustivo en staging, rollback plan validado, migración en horario de bajo tráfico.

**Esfuerzo (cuando se reactive):** **2-4 semanas**

**Dependencias externas (cuando se reactive):**
- GCP project con Cloud KMS habilitado
- IAM service account con permisos KMS
- Cost approval para KMS pricing
- Plan de comunicación a clientes

---

## Prioridad

**Baja (aparcado)** — se reactiva solo si triggers se cumplen.

Razones para mantener aparcado:

1. **MVP no maneja datos críticos sensitivos.** El threat model actual no justifica KMS-grade key management.
2. **Cloud Run + Secret Manager proveen seguridad razonable.** No es perfect, pero es razonable para MVP.
3. **Migración 2-4 semanas SIN valor visible al usuario.** El esfuerzo solo se justifica con cliente compliance pagando.
4. **Vendor lock-in si se mueve a KMS specific.** Posponer la decisión multi-cloud hasta que sea forzada.
5. **Crypto refactor tiene blast radius alto.** Bug aquí hace findings unverifiable. Mejor hacerlo cuando hay urgencia clara.

**Schedule de review:** cada 4 semanas durante `architectural review` global. En el review:
- ¿Algún cliente preguntó por key management?
- ¿Apareció RFP enterprise con weighting de KMS?
- ¿Cambió la regulación EU/US relevante?
- ¿Hubo incidente de seguridad (real o simulado)?

Si NO en todas: mantener aparcado.
Si SÍ en cualquiera: re-evaluar si triggers cumplidos.

**Anti-objetivos explícitos (mientras esté aparcado):**

- ❌ NO empezar implementación
- ❌ NO crear epic en `specs/epics/active/`
- ❌ NO modificar código de crypto con la excusa de "preparar para KMS"
- ❌ NO crear `IKeyProvider` interface antes de tener trabajo de migración listo (re-architecting prematuro)
- ❌ NO bloquear features de release_v1 o pilot_validation por este input
- ❌ NO especular sobre fechas de reactivación
- ❌ NO mencionar KMS en marketing como "future feature" — eso crea expectativa que no podemos cumplir

---

**Notas para el `epic_designer` que procese este input:**

1. Este input está APARCADO. NO crear epic todavía.
2. El input vive en `specs/epics/inputs/` con label "aparcado" hasta que triggers se cumplan.
3. Cada 4 semanas, durante el architectural review, evaluar si triggers se cumplieron.
4. Si triggers se cumplen: actualizar el input con evidencia del cliente/requirement, cambiar label a "active", y entonces SÍ crear epic con el plan documentado.
5. La epic resultante (si se crea) requiere `dependency_auditor` validation: ¿hay otros sistemas tocando MASTER_KEY que también deben migrar?
6. NO procesar este input para ejecución mientras esté aparcado. Si un agente sugiere "implementar KeyProvider proactivamente para flexibilidad", parar — eso es over-engineering sin justificación.
