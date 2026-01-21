---
description: Audita coherencia Blueprint ↔ Código ↔ Tests para UNA triada
hooks:
  Stop:
    - type: prompt
      prompt: |
        VERIFICACIÓN OBLIGATORIA antes de terminar:

        1. ¿Auditaste la triada?
        2. ¿Emitiste veredicto (✅ COHERENTE o ❌ INCONSISTENCIAS)?
        3. ¿Ejecutaste `git status --short` para ver archivos pendientes?
        4. SI coherente, ¿ofreciste commitear TODOS los archivos modificados?
        5. SI el usuario aceptó commit, ¿ejecutaste el commit?
        6. ¿Verificaste con `git status` que no quedaron archivos pendientes?

        NO puedes terminar sin completar estos pasos.
---

# /audit-triad [argumento_opcional]

## PASO 0: OBLIGATORIO - Contexto del Auditor

Lee el spec completo del auditor:
@packages/blueprints/02_agents/design/triad_coherence_auditor.md

## Modos de Uso

### 1. Sin argumento: `/audit-triad`
- Ejecuta `git diff --name-only` para detectar archivos modificados
- Agrupa por módulo/triada
- Lista los módulos al usuario
- Usuario selecciona UNO (número)
- Audita ESA triada
- FIN

### 2. Con nombre de módulo: `/audit-triad lint_module`
- Busca la triada del módulo directamente
- Audita ESA triada
- FIN

### 3. Con path de archivo: `/audit-triad packages/core/src/lint/lint.ts`
- Deduce el módulo desde el path del archivo
- Busca la triada correspondiente
- Audita ESA triada
- FIN

---

## REGLAS CRÍTICAS (NO OMITIR)

### Regla 1: UNA triada por ejecución
Solo auditas UNA triada. Al terminar, el comando TERMINA.
Si el usuario quiere auditar otra, debe ejecutar `/audit-triad` de nuevo.

**IGNORA** cualquier todo list o contexto previo sobre "múltiples triadas".
Después del commit (o si el usuario rechaza), **PARA completamente**.

### Regla 2: SIEMPRE leer los 3 archivos
ANTES de emitir cualquier veredicto, DEBES:
```
Read(blueprint.md)
Read(codigo.ts)
Read(codigo.test.ts)
```
NUNCA asumas contenido del contexto previo.

### Regla 3: SIEMPRE construir tabla EARS
Después de leer, construye la tabla:
```
| EARS | Blueprint | Código | Test | Estado |
| A1   | L288      | L132   | L194 | ✅     |
```

### Regla 4: SIEMPRE emitir veredicto
```
✅ TRIADA COHERENTE (X/Y EARS completos)
```
o
```
❌ INCONSISTENCIAS DETECTADAS
- [Lista de problemas]
```

### Regla 5: VERIFICAR GIT STATUS antes de ofrecer commit
SIEMPRE ejecuta `git status --short` en los archivos de la triada ANTES de ofrecer commit.
Muestra explícitamente qué archivos tienen cambios pendientes:

```bash
git status --short path/to/blueprint.md path/to/codigo.ts path/to/codigo.test.ts
```

Output esperado:
```
 M packages/core/src/modulo/codigo.ts
 M packages/core/src/modulo/codigo.test.ts
```

Si hay archivos modificados, listarlos TODOS en la oferta de commit.

### Regla 6: SI coherente → OFRECER COMMIT
Si el veredicto es ✅ COHERENTE:
```
¿Commitear esta triada? [Y/n]

Archivos con cambios pendientes:
- M path/to/codigo.ts
- M path/to/codigo.test.ts
```
ESPERA respuesta del usuario.

### Regla 7: SI usuario acepta → EJECUTAR COMMIT
Si el usuario dice Y/sí/ok:
- Si hay submodule (blueprints), commitea primero ahí
- Luego commitea en repo principal
- **IMPORTANTE:** Incluir TODOS los archivos listados en git status (no solo los que leíste)
- Mensaje: `docs(módulo): sync triada blueprint ↔ código ↔ tests`
- Después del commit, ejecuta `git status --short` de nuevo para verificar que no quedó nada pendiente

---

## Flujo de Detección de Triada

### Desde nombre de módulo → archivos
```
lint_module →
  Blueprint: glob "**/blueprints/**/*lint_module*.md" O "**/modules/lint_module/*.md"
  Código: glob "**/src/**/lint*.ts" (no .test.ts)
  Tests: glob "**/src/**/lint*.test.ts"
```

### Desde path de archivo → módulo
```
packages/core/src/lint/lint.ts →
  Módulo: lint (del path)
  Blueprint: buscar en blueprints/ con *lint*.md
  Tests: lint.test.ts en mismo directorio
```

### Si no encuentras blueprint
1. Informa qué patrones de glob intentaste
2. PREGUNTA al usuario: "¿Dónde está el blueprint para X?"
3. NUNCA asumas que no existe sin preguntar

---

## Ejecutar Ahora

Detecta el modo de uso según el argumento recibido y ejecuta el flujo correspondiente.
