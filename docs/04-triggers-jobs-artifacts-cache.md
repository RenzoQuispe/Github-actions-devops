# Triggers, jobs, artefactos y caché

Este doc agrupa tres pilares de los workflows: **cuándo** se ejecutan (triggers/eventos), **cómo** se estructuran y condicionan los jobs y steps, y **cómo** se comparten datos entre jobs (artefactos y caché).

| Tema | Qué cubre |
|------|-----------|
| **Triggers y eventos** | La clave `on:`: push, pull_request, workflow_dispatch, schedule, etc., y filtros. |
| **Jobs y steps** | runs-on, needs, if, matrix, env, timeout. |
| **Artefactos y caché** | upload-artifact, download-artifact, actions/cache; retención y límites. |

---

## 1. Triggers y eventos (`on:`)

Los workflows se ejecutan cuando ocurre un **evento** que declaras en la clave `on:`.

### Eventos habituales

| Evento | Cuándo se dispara |
|--------|--------------------|
| **push** | Al hacer push a una rama (incluye merge de PR). |
| **pull_request** | Al abrir, actualizar, reabrir un PR; opcionalmente por tipo (opened, synchronize, etc.). |
| **workflow_dispatch** | Ejecución manual desde la pestaña Actions (con inputs opcionales). |
| **schedule** | Según expresión cron (horario UTC). |
| **release** | Al publicar, editar o eliminar un release; tipos: published, created, etc. |
| **workflow_call** | Cuando otro workflow lo invoca (reusable workflow). |

### Filtros por rama o ruta

Puedes limitar **push** y **pull_request** a ciertas ramas o rutas:

```yaml
on:
  push:
    branches: [main, release/*]
    paths-ignore: ['docs/**', '*.md']
  pull_request:
    branches: [main]
    paths: ['src/**', 'tests/**']
```

- **branches** / **branches-ignore**: ramas que disparan (o se ignoran).
- **paths** / **paths-ignore**: archivos o carpetas que deben (o no) cambiar para que se dispare el workflow.

### Múltiples eventos en un solo workflow

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
  schedule:
    - cron: '0 2 * * 1'
```

El workflow corre en cualquiera de estos eventos. Dentro del job puedes distinguir el evento con `github.event_name` o `github.event.*`.

### Utilidad (DevSecOps)

- **push** + **pull_request**: CI en cada cambio; gates antes de merge.
- **workflow_dispatch**: despliegues o tareas manuales controladas (p. ej. con input de versión o entorno).
- **schedule**: reportes de seguridad, drift detection de IaC, limpieza.
- **paths** / **paths-ignore**: no correr CI completo si solo cambian docs o si solo quieres correr cuando cambia infra (`terraform/**`).

---

## 2. Jobs y steps

Un **workflow** contiene uno o más **jobs**. Cada job tiene **steps** que se ejecutan en orden en el mismo runner.

### runs-on

Define el runner (sistema operativo y opcionalmente labels para self-hosted):

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
  test-windows:
    runs-on: windows-latest
```

### needs: orden y dependencias

Los jobs corren en paralelo por defecto. Con **needs** encadenas: un job solo corre cuando los listados han terminado bien.

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [ ... ]
  test:
    runs-on: ubuntu-latest
    needs: [lint]
    steps: [ ... ]
  deploy:
    runs-on: ubuntu-latest
    needs: [test]
    if: github.ref == 'refs/heads/main'
    steps: [ ... ]
```

Si `lint` falla, `test` no se ejecuta; si `test` falla, `deploy` no se ejecuta.

### if: condiciones

Puedes hacer que un job o un step solo se ejecute si se cumple una condición:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - name: Solo en main
        if: success()
        run: echo "Deploy"
      - name: Siempre al final
        if: always()
        run: echo "Cleanup"
```

Expresiones útiles: `success()`, `failure()`, `cancelled()`, `always()`, `github.ref`, `github.event_name`, comparaciones con `==`, `!=`, `&&`, `||`.

### matrix: ejecutar en paralelo por variantes

Ejecutar el mismo job con varias combinaciones (p. ej. versiones de Python o sistemas operativos):

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false  # si uno falla, los demás siguen
    matrix:
      python-version: ['3.10', '3.11', '3.12']
      os: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}
      - run: pytest
```

Se generan tantas ejecuciones como combinaciones (p. ej. 3 × 2 = 6).

### env: variables de entorno

Puedes definir variables a nivel de workflow, job o step (el nivel más específico gana):

```yaml
env:
  COMMON: value

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      JOB_VAR: job-value
    steps:
      - run: echo ${{ env.COMMON }} ${{ env.JOB_VAR }}
        env:
          STEP_VAR: step-value
```

### timeout-minutes y cancelación

Evitar jobs colgados:

```yaml
jobs:
  long-job:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps: [ ... ]
```

Si un job de la misma ejecución falla o se cancela, los demás que dependan de él (por **needs**) no se ejecutan; los que ya estaban corriendo pueden cancelarse según la configuración del repo.

### Utilidad (DevSecOps)

- **needs**: pipeline en etapas (lint -> test -> security -> deploy); no desplegar si falla un gate.
- **if**: deploy solo en `main`, o solo en eventos `release`; steps de notificación con `always()`.
- **matrix**: probar varias versiones de runtime o varios OS; más cobertura con el mismo YAML.
- **timeout-minutes**: límite para jobs de deploy o tests e2e.

---

## 3. Artefactos y caché

### Artefactos (upload-artifact / download-artifact)

Sirven para **pasar archivos entre jobs** de la misma ejecución del workflow (p. ej. el build produce un binario o una imagen y el job de deploy lo consume).

**Subir artefactos:**

```yaml
steps:
  - name: Build
    run: make build
  - uses: actions/upload-artifact@v4
    with:
      name: my-artifact
      path: dist/
      retention-days: 5
```

**Descargar en otro job:**

```yaml
needs: [build]
steps:
  - uses: actions/download-artifact@v4
    with:
      name: my-artifact
  - run: ls -la
```

- **path**: archivo o carpeta a subir (se comprime).
- **name**: identificador para `download-artifact`; si varios steps suben con el mismo nombre, se fusionan (comportamiento por defecto en v4).
- **retention-days**: cuánto tiempo GitHub guarda el artefacto (por defecto según el plan del repo).

Límites: tamaño máximo por artefacto y por ejecución según el plan; en la UI de Actions se pueden descargar manualmente.

### Caché (actions/cache)

Sirve para **reutilizar datos entre ejecuciones** (dependencias, compilaciones) y reducir tiempo y uso de red.

```yaml
steps:
  - uses: actions/checkout@v4
  - name: Cache pip
    uses: actions/cache@v4
    with:
      path: ~/.cache/pip
      key: pip-${{ runner.os }}-${{ hashFiles('requirements*.txt') }}
      restore-keys: |
        pip-${{ runner.os }}-
  - name: Install deps
    run: pip install -r requirements.txt
```

- **path**: directorio a cachear (se guarda y restaura).
- **key**: clave única; si coincide con una caché existente, se restaura. Suele incluir `runner.os` y un hash de archivos (p. ej. `hashFiles('**/lockfile')`).
- **restore-keys**: si no hay hit exacto, se usa la caché más reciente que coincida con algún prefijo (fallback parcial).

Una ejecución puede **guardar** solo una caché por **key**; el tamaño y el número de cachés tienen límites por repo.

### Cuándo usar artefactos vs caché

| Necesidad | Usar |
|-----------|------|
| Pasar salida de un job a otro en la **misma** ejecución | **Artefactos** (upload/download). |
| Acelerar instalación o build **entre** ejecuciones | **Caché** (actions/cache). |
| Persistir algo para descargar desde la UI (reportes, bundles) | **Artefactos**. |

### Utilidad (DevSecOps)

- **Artefactos**: pasar imagen Docker (save/load), SBOM, reportes de seguridad o binarios entre job de build y job de deploy o de release.
- **Caché**: cachear dependencias (pip, npm, Go modules) o herramientas (terraform providers) para que lint/test/security sean más rápidos y repetibles.

---

## Dónde verlo en GitHub

- **Actions** -> elegir un workflow run -> verás los **eventos** que lo dispararon y el **grafo de jobs** (needs, paralelo, fallos).
- Los **artefactos** aparecen en la página de la ejecución; las **cachés** en **Settings** -> **Actions** -> **Caches** (por repo).
