# Introducción

Este repositorio centraliza lo que se va aprendiendo sobre **GitHub Actions** y laboratorios relacionados, con enfoque **DevSecOps**. Aquí se explica la introducción a **GitHub Actions**, cómo está organizado el repo en **teoría** y **práctica**, y los **tres tipos de laboratorios** que encontrarás.

---

## GitHub Actions en este repo

**GitHub Actions** es el motor de CI/CD integrado en GitHub. Permite definir **workflows** (archivos YAML en `.github/workflows/`) que se ejecutan en respuesta a eventos (push, pull_request, schedule, etc.) en **runners** (máquinas hospedadas por GitHub o propias).

**Conceptos clave** que encontrarás en `docs/`: workflow, job, step, evento, runner, secrets y variables, environments. Se parte de lo básico y se avanza hacia pipelines DevSecOps y uso de cloud.

---

## Estructura: teoría (`/docs`) y práctica (laboratorios)

El contenido del repositorio se divide en dos bloques:

| Bloque | Ubicación | Contenido |
|--------|-----------|-----------|
| **Teoría** | `/docs` | Documentación en Markdown: conceptos, configuración, buenas prácticas. Orden de lectura sugerido: 01 (este doc) -> 02 -> 03 -> 04 -> 05. |
| **Práctica** | Laboratorios | Workflows, scripts y código para **hacer** pipelines: desde lo más simple (GitHub sin cloud) hasta pipelines DevSecOps locales y pipelines que manipulan cloud. |

---

## Los tres tipos de laboratorios

Hay **tres familias de laboratorios**, según qué quieras practicar: pipeline básico en GitHub (sin cloud), pipeline DevSecOps ejecutable en local, o pipelines en GitHub que interactúan con cloud.

### 1. Pipeline en GitHub básico (sin cloud)

**Objetivo:** Armar un pipeline que corre **solo en GitHub** (runners hospedados), sin conectar ningún proveedor cloud ni servicios externos que requieran credenciales.

**Qué incluye (ejemplos):**

- Un workflow que se dispara en `push` o `pull_request`.
- Jobs de **lint**, **tests** y tal vez **build** (compilar o empaquetar).
- Uso de **secrets y variables** del repo (o de environments) para cosas opcionales (p. ej. notificaciones); el flujo core puede no necesitar ninguno.
- **Artefactos** para pasar salida entre jobs; **caché** para acelerar dependencias.

**Por qué es útil:** Aprender la sintaxis de workflows, eventos, jobs y steps sin depender de AWS, GCP, Azure ni registries externos. Es la base para luego añadir seguridad (DevSecOps) o integración con cloud.

---

### 2. Pipeline DevSecOps local

**Objetivo:** Un pipeline de **DevSecOps** (SAST, SCA, SBOM, escaneo de imagen, DAST, etc.) que puedes ejecutar **100 % en tu máquina** con un Makefile (o scripts equivalentes), y que además puede tener su reflejo en GitHub Actions para CI.

**Qué incluye (ejemplos):**

- **Build** de imagen Docker; **tests** unitarios.
- **SAST** (p. ej. bandit, semgrep), **SCA** (pip-audit), **SBOM** (syft), escaneo de **imagen** (grype, trivy).
- **DAST** (p. ej. OWASP ZAP) contra el servicio levantado en local (compose o similar).
- Opcional: **Kubernetes** local (KinD) para desplegar y hacer smoke tests; **evidencias** (in-toto, artefactos) para supply chain.

**Por qué es útil:** Practicar el flujo completo DevSecOps sin gastar cloud ni exponer secretos. El mismo repo puede tener un workflow en `.github/workflows/` que reproduce esos pasos en GitHub (como el `ci-devsecops.yml` de este repo), o puedes correr todo con `make` en local.

---

### 3. Pipelines en GitHub manipulando cloud

**Objetivo:** Workflows que **interactúan con proveedores cloud**.

**Por qué es útil:** Llevar lo aprendido en el pipeline básico y en DevSecOps a un entorno real: CI/CD que construye, valida y despliega usando infra y servicios en la nube.