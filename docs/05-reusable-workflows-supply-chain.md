# Reusable workflows, composite actions y supply chain

Este doc cubre **reutilización** de lógica (reusable workflows y composite actions) y **seguridad de la supply chain** en GitHub Actions: cómo elegir y fijar dependencias y buenas prácticas para pipelines más mantenibles y seguros.

| Tema | Qué cubre |
|------|-----------|
| **Reusable workflows** | Workflows que otros workflows invocan con `workflow_call`; inputs y outputs. |
| **Composite actions** | Agrupar steps en una “acción” reutilizable dentro del mismo repo. |
| **Supply chain y buenas prácticas** | Pin de acciones, Dependabot, attestations, mínimo privilegio. |

---

## 1. Reusable workflows

Un **reusable workflow** es un workflow que se dispara cuando **otro workflow** lo llama con el evento `workflow_call`. Sirve para centralizar pipelines (p. ej. CI estándar) y reutilizarlos desde varios repos o desde varios “workflows de entrada”.

### Características

- El workflow reutilizable debe tener **workflow_call** en `on:` (puede combinar con otros eventos si quieres que también se ejecute solo).
- Debe estar en la **rama por defecto** (o en una tag) para que otros workflows lo invoquen; si está en otro repo, hace falta permisos.
- Puede recibir **inputs** (strings, números, booleanos) y **secrets** (pasados explícitamente desde el caller).
- Puede definir **outputs** que el caller usa en jobs posteriores.

### Cómo exponer un reusable workflow

```yaml
# .github/workflows/ci-common.yml
name: CI común
on:
  workflow_call:
    inputs:
      python-version:
        required: true
        type: string
        default: '3.12'
      run-security:
        required: false
        type: boolean
        default: true
    secrets:
      SLACK_WEBHOOK:
        required: false

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ inputs.python-version }}
      - run: ruff check .
      - run: pytest
      - name: Security
        if: inputs.run-security
        run: pip install bandit && bandit -r src/
```

### Cómo llamarlo desde otro workflow

```yaml
# .github/workflows/main.yml
name: Main
on: [push, pull_request]

jobs:
  call-ci:
    uses: ./.github/workflows/ci-common.yml
    with:
      python-version: '3.11'
      run-security: true
    secrets:
      SLACK_WEBHOOK: ${{ secrets.SLACK_WEBHOOK }}
```

El job `call-ci` ejecuta todo el workflow `ci-common.yml`; el caller puede pasar **inputs** y **secrets** (no se heredan automáticamente por seguridad).

### Utilidad (DevSecOps)

- Un solo “CI estándar” (lint, test, SAST/SCA) reutilizado por varios repos o por varios triggers.
- Varios workflows de entrada (p. ej. uno por rama o uno manual) que llaman al mismo pipeline de validación.
- Centralizar actualizaciones de herramientas o de pasos de seguridad en un solo archivo.

---

## 2. Composite actions

Una **composite action** es un conjunto de **steps** definidos en un único directorio del repo (con un `action.yml` o `action.yaml`). Se usa como una acción más en `uses:`.

### Características

- Vive en el **mismo repositorio** (p. ej. `./.github/actions/my-action`).
- Tiene **inputs** y **outputs**; no tiene “jobs”, solo steps (run, o uses de otras acciones).
- Útil para no repetir bloques de steps (configurar cliente, formatear reporte, etc.).

### Estructura mínima

```yaml
# .github/actions/setup-and-lint/action.yml
name: 'Setup and lint'
description: 'Checkout, setup Python, run ruff'
inputs:
  python-version:
    description: 'Python version'
    required: true
    default: '3.12'
outputs:
  summary:
    description: 'Lint summary'
    value: ${{ steps.lint.outputs.summary }}

runs:
  using: 'composite'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with:
        python-version: ${{ inputs.python-version }}
    - id: lint
      run: |
        pip install ruff
        ruff check . --output-format=summary | tee summary.txt
        echo "summary<<EOF" >> $GITHUB_OUTPUT
        cat summary.txt >> $GITHUB_OUTPUT
        echo "EOF" >> $GITHUB_OUTPUT
      shell: bash
```

### Uso en un workflow

```yaml
steps:
  - uses: ./.github/actions/setup-and-lint
    with:
      python-version: '3.12'
  - run: echo ${{ steps.setup-and-lint.outputs.summary }}
```

### Reusable workflow vs composite action

| Necesidad | Usar |
|-----------|------|
| Reutilizar **jobs completos** (varios jobs, needs, matrix) y/o llamar desde otros workflows/repos | **Reusable workflow** (`workflow_call`). |
| Reutilizar un **bloque de steps** dentro del mismo repo | **Composite action**. |

---

## 3. Supply chain y buenas prácticas

La **supply chain** en GitHub Actions son las dependencias que usa tu pipeline: las **acciones** (`uses:`) y, en su caso, los **reusable workflows**. Que sean confiables y actualizables reduce riesgo y mantiene el pipeline estable.

### Pin de acciones por SHA

Evita usar solo la etiqueta (p. ej. `actions/checkout@v4`) en producción; fija la **versión por commit SHA** para que una nueva versión de la tag no cambie el comportamiento sin que lo decidas:

```yaml
- uses: actions/checkout@v4  # tag: puede cambiar
- uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # SHA: fijo
```

En la página de la acción en GitHub suele mostrarse el SHA de cada release; también puedes usar `@v4.1.1` (tag exacto) si la acción sigue semver.

### Dependabot para acciones

Habilitar **Dependabot** para GitHub Actions (en **Settings** -> **Code security and analysis** -> **Dependabot**) genera PRs cuando hay actualizaciones de las acciones que usas; así puedes revisar y fijar nuevo SHA o tag de forma controlada.

### Permisos mínimos (GITHUB_TOKEN)

El token por defecto `secrets.GITHUB_TOKEN` tiene permisos que puedes restringir a nivel de workflow o de job:

```yaml
permissions:
  contents: read
  pull-requests: write   # solo si necesitas comentar en PRs
  security-events: write # solo si usas CodeQL u otras integraciones de seguridad
```

En cada job puedes **aumentar** si hace falta, pero partir de **read** para `contents` y añadir solo lo necesario (principio de mínimo privilegio en DevSecOps).

### No loguear secrets

- No hagas `echo` ni `print` de variables que vengan de `secrets.*`.
- GitHub enmascara los valores conocidos en los logs, pero conviene no exponerlos en scripts (p. ej. no pasarlos como argumentos en claro en la línea de comandos si se puede evitar).

### Attestations y OIDC (avanzado)

Para supply chain más estricta, GitHub permite generar **attestations** (SLSA, in-toto) y usar **OIDC** para que el workflow se autentique en proveedores (AWS, GCP, etc.) sin guardar credenciales largas. Es opcional pero alinea con SLSA y políticas de confianza del artefacto.

### Resumen de buenas prácticas

1. **Pin** acciones por SHA (o tag exacto) y revisar PRs de Dependabot.
2. **Mínimo privilegio**: `permissions` restrictivos; ampliar solo donde haga falta.
3. **Secrets**: no loguearlos; usar environment secrets para prod y required reviewers donde aplique.
4. **Reutilización**: reusable workflows para pipelines estándar; composite actions para bloques de steps repetidos.
5. **Mantenimiento**: un solo lugar para CI común (reusable) y un solo lugar para steps comunes (composite) reduce duplicación y errores.

---

## Dónde configurarlo en GitHub

- **Reusable workflows**: en cualquier `.github/workflows/*.yml` con `on: workflow_call`.
- **Composite actions**: en carpetas bajo `.github/actions/<nombre>/` con `action.yml`.
- **Dependabot**: **Settings** -> **Code security and analysis** -> **Dependabot** -> habilitar **Actions**.
- **Permisos por defecto**: en el workflow con la clave `permissions:` a nivel raíz o en cada job.
