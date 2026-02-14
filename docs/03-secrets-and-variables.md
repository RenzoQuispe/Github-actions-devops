# Secrets and variables

En **GitHub** -> **Settings** -> **Secrets and variables** -> **Actions** tienes cuatro bloques principales para configurar datos sensibles y no sensibles que usan tus workflows:

| Tipo | Sensible | Alcance | Uso típico |
|------|----------|---------|------------|
| **Repository secrets** | Sí | Todo el repo | API keys, tokens, contraseñas |
| **Repository variables** | No | Todo el repo | URLs, nombres de entorno, flags |
| **Environment secrets** | Sí | Un environment concreto | Credenciales por entorno (staging, prod) |
| **Environment variables** | No | Un environment concreto | Config por entorno (URLs, feature flags) |

---

## 1. Repository secrets

Son valores **sensibles** (contraseñas, tokens, API keys, certificados) que GitHub almacena **encriptados** y que están disponibles para **todos los workflows del repositorio**.

### Características

- **Sensibles**: no se muestran en la UI después de guardarlos; en los logs aparecen enmascarados (`***`).
- **Alcance**: todo el repositorio (todos los workflows y, si no usas environments, todos los jobs).
- **Solo lectura** en el workflow: no se pueden modificar desde el job.

### Utilidad

- API keys de servicios externos (Slack, AWS, Docker Hub, etc.).
- Tokens de acceso personal (PAT) para push a otros repos o registries.
- Contraseñas de bases de datos o servicios.
- Claves privadas o certificados (en formato texto).

### Cómo usarlos en el workflow

```yaml
env:
  SLACK_TOKEN: ${{ secrets.SLACK_TOKEN }}

steps:
  - name: Usar secreto
    run: echo "Token configurado"
    # Nunca hagas echo del valor real en producción
```

Solo están disponibles si el job tiene acceso al repositorio (por defecto sí). Si usas **environments** con protección, el job debe apuntar a ese environment para poder usar los **environment secrets** (ver más abajo).

---

## 2. Repository variables

Son valores **no sensibles** definidos a nivel de **repositorio**, visibles en la configuración del repo y reutilizables en todos los workflows.

### Características

- **No sensibles**: se pueden ver y editar en Settings; en los logs pueden aparecer en claro.
- **Alcance**: todo el repositorio.
- Útiles para evitar repetir strings largos (URLs, nombres de entorno, nombres de artefactos).

### Utilidad

- URL base de la API o del backend (por repo).
- Nombre del artefacto o de la imagen Docker.
- Feature flags o nombres de entorno (`staging`, `production`) como string.
- Rutas o prefijos comunes.

### Cómo usarlos en el workflow

```yaml
env:
  API_BASE_URL: ${{ vars.API_BASE_URL }}
  IMAGE_NAME: ${{ vars.IMAGE_NAME }}

steps:
  - name: Deploy
    run: |
      echo "Desplegando a $API_BASE_URL"
      docker push "$IMAGE_NAME"
```

Las **variables** se referencian con `vars.NOMBRE_VARIABLE`; los **secrets** con `secrets.NOMBRE_SECRET`.

---

## 3. Environment secrets

Son secretos **sensibles** asociados a un **environment** concreto (por ejemplo `staging`, `production`, `development`). GitHub permite crear varios environments en un mismo repo.

### Características

- **Sensibles**: igual que los repository secrets, enmascarados en logs y no editables/visibles después de guardar.
- **Alcance**: solo los jobs que declaran ese environment (`environment: production`).
- Permiten **protecciones**: reglas de rama, revisores requeridos, wait timer, etc.

### Utilidad

- Credenciales distintas por entorno: un token para staging y otro para production.
- Cumplir con políticas (por ejemplo, que solo ciertas ramas o personas desplieguen a prod).
- Tokens de registro de imágenes por entorno (staging vs prod).

### Cómo usarlos en el workflow

Primero defines el environment en el repo (Settings -> Environments) y allí añades los **Environment secrets**. En el workflow:

```yaml
jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to staging
        env:
          API_KEY: ${{ secrets.API_KEY }}  # secreto del environment "staging"
        run: ./deploy.sh

  deploy-production:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to production
        env:
          API_KEY: ${{ secrets.API_KEY }}  # secreto del environment "production"
        run: ./deploy.sh
```

El mismo nombre de secreto (`API_KEY`) puede tener **valores distintos** en cada environment.

---

## 4. Environment variables

Son variables **no sensibles** asociadas a un **environment** concreto. Mismo concepto que Repository variables, pero con alcance limitado al environment.

### Características

- **No sensibles**: visibles en la configuración del environment.
- **Alcance**: solo jobs que usan ese `environment`.

### Utilidad

- URL del backend por entorno (`STAGING_URL`, `PRODUCTION_URL`).
- Nombre del bucket o del recurso por entorno.
- Feature flags o config que cambia entre staging y production.

### Cómo usarlos en el workflow

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy
        env:
          BACKEND_URL: ${{ vars.BACKEND_URL }}  # variable del environment "production"
        run: |
          echo "Desplegando a $BACKEND_URL"
```

---

## 5. Environments: reglas y protecciones

Los **environments** no solo agrupan secrets y variables por entorno: permiten definir **protecciones** que deben cumplirse antes de que un job que use ese environment pueda ejecutarse o completarse. En DevSecOps son útiles para gates antes de staging o production.

### Características

- Un environment es un **nombre lógico** (p. ej. `staging`, `production`) que asocias a un job con `environment: nombre`.
- Puedes configurar **protection rules**: ramas permitidas, revisores requeridos, wait timer.
- Hasta que no se cumplan las reglas (aprobación, rama correcta, etc.), el job que usa ese environment **queda en espera** (pending).
- Las **deployment branch** rules limitan desde qué ramas se puede "desplegar" a ese environment (GitHub muestra el deployment en la pestaña Deployments).

### Utilidad

- **Required reviewers**: que un humano apruebe antes de desplegar a production (gate de compliance).
- **Wait timer**: retrasar el deploy X minutos para poder cancelar si algo salió mal.
- **Deployment branches**: solo `main` (o `release/*`) puede desplegar a production; el resto solo a staging.
- **DevSecOps**: separar claramente qué jobs tocan qué entorno y exigir aprobación o rama para prod.

### Reglas disponibles (resumen)

| Regla | Qué hace |
|-------|----------|
| **Required reviewers** | Una o más personas deben aprobar el job antes de que continúe. |
| **Wait timer** | Esperar un tiempo (minutos) antes de que el job siga. |
| **Deployment branches** | Solo las ramas que coincidan (p. ej. `main`) pueden usar este environment. |

Los jobs que declaran `environment: production` pasan por estas reglas; los que no declaran `environment` no están sujetos a ellas.

### Dónde configurarlo

En el repo -> **Settings** -> **Environments** -> elegir un environment (o crear uno) -> **Protection rules**. Ahí activas required reviewers, wait timer y deployment branches.

---

## Orden de precedencia (variables)

Si el mismo **nombre** existe en varios sitios, GitHub resuelve así (el primero que exista gana):

1. **Variable definida en el workflow** (en `env` del job o del step).  
2. **Variable del environment** (si el job tiene `environment`).  
3. **Repository variable**.  

Los **secrets** no se "sobrescriben" por variables; son namespaces distintos (`secrets.*` vs `vars.*`). Lo que sí puede variar es qué secret está disponible según el environment (environment secret vs repository secret).

---

## Buenas prácticas

1. **Secrets**: usar para todo lo que sea contraseña, token o clave; nunca commitearlos ni pasarlos como variables de repositorio si son sensibles.
2. **Variables**: usar para configuración no sensible (URLs, nombres) y así centralizar cambios en Settings en lugar de tocar el YAML.
3. **Environments**: usar cuando tengas varios entornos (staging/prod) para separar credenciales y config, y para aprovechar protecciones (revisores, ramas permitidas).
4. **Mínimo privilegio**: dar a los tokens solo los permisos necesarios; usar environment protection rules en producción.
5. **Rotación**: si un secreto puede haberse filtrado, rotarlo en GitHub y en el servicio correspondiente.

---

## Dónde configurarlo en GitHub

- **Repository**: en el repo -> **Settings** -> **Secrets and variables** -> **Actions**.
  - Pestaña **Secrets**: Repository secrets.
  - Pestaña **Variables**: Repository variables.
- **Environment**: **Settings** -> **Environments** -> elegir un environment (o crear uno) -> configurar ahí **Environment secrets** y **Environment variables**.
