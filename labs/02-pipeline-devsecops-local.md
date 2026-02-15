# Lab 2: Pipeline DevSecOps local

Pipeline completo de **DevSecOps** para un microservicio **Python** mínimo, con **Docker**, **Kubernetes (KinD)** y **GitHub Actions**. Puede ejecutarse **100% local** con `Makefile` y tiene su reflejo en `.github/workflows/ci-devsecops.yml` para CI en GitHub. No requiere secretos ni credenciales cloud.

---

## Estructura del laboratorio

| Ruta | Descripción |
|------|-------------|
| `src/` | Servicio HTTP (`/` y `/health`). |
| `tests/` | Pruebas unitarias. |
| `docker/` | Dockerfile no-root y `HEALTHCHECK`. |
| `compose.yaml` | Levantar servicio local para DAST. |
| `k8s/` | Manifiestos y `kind-config.yaml` (KinD). |
| `.github/workflows/ci-devsecops.yml` | Pipeline CI en GitHub. |
| `artifacts/` | Resultados de análisis (SBOM, SAST, SCA, DAST, scans). |
| `.evidence/` | Evidencias (smoke tests, pods, etc.). |
| `slsa/` | Ejemplo de layout para in-toto. |
| `Makefile` | Tareas locales. |

---

## Requisitos locales

- Docker, Kind, kubectl  
- Python 3.12  
- Herramientas: `syft`, `grype`, `semgrep`, `bandit`, `pip-audit`, `in-toto-run` (opcional `trivy`).

El target **`make ensure-tools`** indica qué falta por instalar según tu SO.

---

## Flujo local recomendado

```bash
make build           # construye imagen
make unit            # pruebas unitarias
make sast sca        # SAST + SCA
make sbom            # SBOM proyecto + imagen
make scan-image      # análisis de vulnerabilidades imagen
make compose-up      # lanza app en :8000
make dast            # ZAP baseline contra http://127.0.0.1:8000
make compose-down
make kind-up         # crea cluster KinD
make kind-load       # carga imagen local al cluster
make k8s-deploy      # despliega y espera rollout
make k8s-portforward # 127.0.0.1:30080 -> service
make smoke           # verifica /health en K8s
make attest          # ejemplo in-toto (local)
make evidence-pack   # tar.gz con artefactos y evidencias
```

---

## GitHub Actions: concepto en este lab

El workflow **`.github/workflows/ci-devsecops.yml`** reproduce en GitHub (en push/PR a `main` o manual) los mismos pasos que el Makefile permite correr en local: checkout, setup Python, build de imagen, unit tests, SAST (bandit, semgrep), SCA (pip-audit), SBOM (syft), escaneo de imagen (grype), compose + DAST (ZAP), subida de artefactos. No usa secretos; permisos explícitos (`contents: read`, `security-events: write`, etc.).

---

## Supply Chain (local)

- **SBOM** con `syft` (proyecto e imagen).  
- **SCA** con `pip-audit`.  
- **SAST** con `bandit` y `semgrep` (config en `.semgrep.yml`).  
- **Escaneo de imagen** con `grype` (u opcional `trivy`).  
- **DAST** con OWASP ZAP baseline sobre el servicio en compose.  
- **SLSA-like**: ejemplo **in-toto** para evidenciar el paso de build (`make attest`).

---

## Buenas prácticas incluidas

- Imagen **no root** y base **slim**.  
- `HEALTHCHECK` en Docker y probes en K8s.  
- Evidencias y artefactos en carpetas dedicadas (`artifacts/`, `.evidence/`).  
- `imagePullPolicy: Never` + `kind load docker-image` para uso **KinD** offline.  
- Port-forward para smoke tests sin exponer NodePort.