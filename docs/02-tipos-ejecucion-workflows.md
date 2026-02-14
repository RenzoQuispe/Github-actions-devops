# Tipos de ejecución en GitHub Actions

Los workflows de GitHub Actions pueden orquestar muchos tipos de tareas: desde tests y builds hasta deploys, publicaciones y escaneos de seguridad. En un enfoque **DevSecOps** entran también **IaC** (Terraform, Pulumi), **Kubernetes** y la capa de observabilidad (**Prometheus**, **Grafana**), que pueden tener tareas concretas en varios de estos tipos. Este doc repasa los **tipos de ejecución** más habituales y cómo encajan en un pipeline.

| Tipo | Objetivo | Cuándo se dispara (ejemplos) |
|------|----------|------------------------------|
| **Tests** | Validar código (unit, integration, e2e) | push, pull_request |
| **Build** | Compilar/empaquetar artefactos | push, pull_request, release |
| **Lint / format** | Estilo y estándares de código | push, pull_request |
| **Security (SAST/SCA/DAST)** | Encontrar vulnerabilidades | push, pull_request, schedule |
| **Deploy** | Llevar la app a un entorno | push a rama, workflow_dispatch, release |
| **Release / publish** | Publicar paquetes o imágenes | release, tag, workflow_dispatch |
| **Scheduled / maintenance** | Tareas periódicas o limpieza | schedule (cron) |
| **Notificaciones** | Slack, email, issues | al final de otros jobs |

---

## 1. Tests

Validar que el código se comporta como se espera: unitarios, integración, e2e o tests de contrato.

### Características

- Suelen ejecutarse en **cada push y en cada pull_request**.
- Pueden correr en paralelo por lenguaje o por suite (unit vs e2e).
- Fallar el job de tests suele **bloquear** merge o deploy si lo usas como gate.

### Utilidad

- **Unit tests**: rápido, en cada commit; frameworks (pytest, jest, go test, etc.).
- **Integration tests**: contra DB, APIs o servicios mock; a veces en job separado.
- **E2E tests**: contra un entorno desplegado o con servicios en compose; más lentos, a veces solo en `main` o en PR hacia main.

### Ejemplo mínimo

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install deps
        run: pip install -r requirements.txt -r requirements-dev.txt
      - name: Run tests
        run: pytest tests/ -v
```

---

## 2. Build

Compilar código, generar binarios, empaquetar o construir imágenes (Docker, etc.).

### Características

- Consume el código del repo (y a veces artefactos de otros jobs).
- Produce **artefactos** (`upload-artifact`) o imágenes que luego usan deploy o release.
- Puede depender de que los tests pasen (`needs: test`).

### Utilidad

- Compilar apps (Go, Rust, C++, etc.).
- Build de imágenes Docker para luego push a un registry (p. ej. imágenes que se desplegarán en **Kubernetes**).
- Empaquetar (npm pack, wheel, jar) para publicar o desplegar.
- **IaC**: validar y hacer plan de Terraform/Pulumi (`terraform validate`, `terraform plan`) como paso previo a un job de deploy; empaquetar o versionar módulos.
- **Kubernetes**: empaquetar **Helm** charts o validar manifiestos (kustomize build) antes de desplegar.

### Ejemplo mínimo

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t myapp:${{ github.sha }} .
      - name: Save image
        run: docker save myapp:${{ github.sha }} -o image.tar
      - uses: actions/upload-artifact@v4
        with:
          name: image
          path: image.tar
```

---

## 3. Lint / format

Comprobar estilo de código, convenciones y formateo (ESLint, Black, Prettier, Ruff, etc.).

### Características

- Suele ser **rápido** y ejecutarse en cada push/PR.
- Puede ser un job aparte o un step dentro del mismo job que los tests.
- Opcionalmente **auto-fix** y commit (menos común; suele hacerse en pre-commit o en un bot).

### Utilidad

- Mantener un estilo uniforme y detectar malas prácticas.
- Fallar el workflow si el código no cumple (fail on lint error).
- **IaC**: lint de Terraform (tflint, `terraform fmt -check`), Pulumi o CloudFormation para que la infra cumpla estándares.
- **Kubernetes**: validar YAML de manifiestos (yamllint, kubeconform) o reglas de Helm (helm lint) antes de deploy.

### Ejemplo mínimo

```yaml
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install ruff
      - name: Lint
        run: ruff check .
```

---

## 4. Security (SAST / SCA / DAST)

Escaneos de seguridad: código (SAST), dependencias (SCA) y/o aplicación desplegada (DAST). En un enfoque **DevSecOps** se extiende también a infraestructura y configuraciones.

### Características

- **SAST**: analiza código fuente (bandit, semgrep, CodeQL, etc.).
- **SCA**: analiza dependencias (pip-audit, npm audit, Dependabot, etc.).
- **DAST**: prueba la app en ejecución (ZAP, etc.); a veces requiere un job previo que levanta el servicio.
- Pueden ejecutarse en **push/PR** o en **schedule** para reportes periódicos.

### Utilidad

- Detectar vulnerabilidades antes de merge o deploy.
- Cumplir políticas de seguridad y supply chain (SBOM, firmas, etc.).
- **IaC**: escaneo de seguridad de Terraform, Pulumi o CloudFormation (**tfsec**, **checkov**, **trivy** para IaC) para detectar misconfiguraciones (buckets públicos, políticas IAM débiles, etc.).
- **Kubernetes**: escaneo de manifiestos y Helm charts (**kubeaudit**, **trivy** para K8s, **kubeconform**) para políticas RBAC, recursos privilegiados o imágenes sin digest.
- **Prometheus / Grafana**: validar configs (p. ej. `promtool check config`) y dashboards para evitar errores que afecten la observabilidad; revisar que alertas y datasources no expongan datos sensibles.

### Ejemplo mínimo

```yaml
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: SAST (Bandit)
        run: pip install bandit && bandit -r src/
      - name: SCA (pip-audit)
        run: pip install pip-audit && pip-audit
```

---

## 5. Deploy

Llevar la aplicación o artefactos a un entorno (staging, production, etc.).

### Características

- Suele ejecutarse **solo en ciertas ramas** (p. ej. `main`) o con **workflow_dispatch** manual.
- Usa **environments** para separar credenciales y protecciones (revisores, ramas permitidas).
- Típicamente **depende** de build y tests (`needs: [build, test]`).

### Utilidad

- Deploy a VMs, **Kubernetes**, serverless (Lambda, Cloud Run), o PaaS (Heroku, etc.).
- Actualizar solo cuando los gates (tests, security) han pasado.
- **IaC**: aplicar infraestructura con **Terraform** o **Pulumi** (`terraform apply`, o apply en pipeline controlado) para provisionar/actualizar redes, clusters, registries, etc., de forma repetible y auditable.
- **Kubernetes**: desplegar con **kubectl**, **Helm** o **Kustomize** (rollout de manifiestos o charts); desplegar a un cluster tras validar y escanear en pasos anteriores.
- **Prometheus y Grafana**: desplegar el stack de monitoreo (p. ej. **kube-prometheus-stack** o Helm charts de Prometheus/Grafana) para tener métricas, alertas y dashboards en el entorno; en DevSecOps, la observabilidad forma parte del pipeline (métricas de seguridad, disponibilidad, SLIs).

### Ejemplo mínimo

```yaml
  deploy:
    runs-on: ubuntu-latest
    environment: production
    needs: [build, test]
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Download artifact
        uses: actions/download-artifact@v4
        with:
          name: image
      - name: Deploy
        run: ./scripts/deploy.sh
        env:
          REGISTRY_TOKEN: ${{ secrets.REGISTRY_TOKEN }}
```

---

## 6. Release / publish

Publicar versiones: tags, artefactos en GitHub Releases, paquetes (npm, PyPI, container registry), etc.

### Características

- Se dispara con **release** (published), **tag** creado, o **workflow_dispatch** con input de versión.
- Genera artefactos descargables y/o publica en registries externos.
- Suele ir después de build y tests, y a veces después de deploy a staging.

### Utilidad

- Crear GitHub Release con binarios o notas.
- Publicar imagen Docker en GHCR o Docker Hub.
- Publicar en npm, PyPI, Maven, etc.

### Ejemplo mínimo

```yaml
on:
  release:
    types: [published]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Create release asset
        run: echo "v${{ github.event.release.tag_name }}" > version.txt
      - uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ github.event.release.upload_url }}
          asset_path: ./version.txt
          asset_name: version.txt
          asset_content_type: text/plain
```

---

## 7. Scheduled / maintenance

Tareas que se ejecutan en un **horario** (cron) o como mantenimiento.

### Características

- Trigger `schedule` con expresión **cron** (horario UTC).
- Útil para reportes, limpieza, sincronización o escaneos periódicos que no quieres en cada push.

### Utilidad

- Reportes de seguridad o métricas semanales.
- Limpiar recursos antiguos (imágenes, snapshots).
- Sincronizar con sistemas externos o generar documentación periódica.
- **IaC**: **drift detection** (ejecutar `terraform plan` de forma periódica y notificar si la infra real se desvía del código); limpieza de recursos obsoletos.
- **Prometheus / Grafana**: exportar snapshots de dashboards, backup de configuraciones o de métricas; reportes periódicos de SLOs/alertas que alimentan el enfoque DevSecOps (visibilidad continua).

### Ejemplo mínimo

```yaml
on:
  schedule:
    - cron: '0 2 * * 1'  # Lunes a las 02:00 UTC
  workflow_dispatch:

jobs:
  weekly-report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate report
        run: ./scripts/weekly-report.sh
      - name: Upload report
        uses: actions/upload-artifact@v4
        with:
          name: weekly-report
          path: report.html
```

---

## 8. Notificaciones

Avisar a Slack, email, crear/actualizar issues o comentar en PRs cuando algo termina (éxito o fallo).

### Características

- Suele ser un **job al final** que depende de otros (`needs: [deploy]`) o que corre siempre y revisa conclusiones.
- Usa secrets para tokens (Slack, etc.) o el `GITHUB_TOKEN` para comentar en issues/PRs.

### Utilidad

- Notificar en Slack/Teams cuando falla el build o cuando se despliega a prod.
- Comentar en el PR el resultado de tests o enlaces a artefactos.
- Crear un issue si un escaneo de seguridad encuentra algo crítico.

### Ejemplo mínimo

```yaml
  notify:
    runs-on: ubuntu-latest
    needs: [test]
    if: always() && (needs.test.result == 'failure' || needs.test.result == 'success')
    steps:
      - name: Notify Slack
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Tests: ${{ needs.test.result }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## Cómo combinar varios tipos en un solo workflow

Un flujo típico: **lint** y **test** en paralelo; luego **build**; luego **security**; y solo en `main` un **deploy** (y opcionalmente **release** o **notify**).

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [ ... ]

  test:
    runs-on: ubuntu-latest
    steps: [ ... ]

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps: [ ... ]

  security:
    needs: [build]
    runs-on: ubuntu-latest
    steps: [ ... ]

  deploy:
    needs: [security]
    if: github.ref == 'refs/heads/main'
    environment: production
    runs-on: ubuntu-latest
    steps: [ ... ]
```

Con `needs` defines el orden; con `if` limitas cuándo corre cada job (rama, evento, etc.).

---

## Dónde verlo en GitHub

- **Actions** -> pestaña del workflow -> cada ejecución muestra los **jobs** y su tipo (tests, build, deploy, etc.).
- Los **triggers** que configuras en `on:` definen cuándo se dispara cada tipo de ejecución (push, PR, schedule, release, workflow_dispatch).
