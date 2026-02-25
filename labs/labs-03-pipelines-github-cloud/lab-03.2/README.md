# Lab 03.2 — Gestor de tareas multi-usuario en AWS

Aplicación fullstack desplegada en AWS con la siguiente arquitectura:

```
  Usuario (navegador)
      ↓
  CloudFront
      ↓
  S3 (Frontend React)
      ↓
  API Gateway (REST API)  ←  Frontend llama a esta URL
      ↓
  Lambda (lógica backend)
      ↓
  DynamoDB (usuarios + tareas)
```

## Contenido del lab

- **Frontend (React + Vite):** login, **crear cuenta** (registro) y gestor de tareas por usuario (listar, crear, marcar completada, eliminar). Cada usuario ve solo sus tareas.
- **Backend (Lambda + Node.js):** API REST con **registro** (`POST /register`), **login** (`POST /login`) y CRUD de tareas asociadas al usuario autenticado.
- **Infraestructura (CloudFormation):** S3, CloudFront, API Gateway, Lambda, DynamoDB (tabla `users` con GSI por `username`, tabla `tasks` con GSI por `userId`).

## Usuarios y registro

- **Varios usuarios:** cada usuario tiene su propia lista de tareas. El login identifica por nombre de usuario y contraseña.
- **Crear cuenta:** desde la pantalla de login se puede ir a "Crear cuenta" para registrarse (nombre de usuario único y contraseña de al menos 4 caracteres). Tras registrarse se inicia sesión automáticamente.
- **Usuario inicial opcional:** si en la plantilla se define el parámetro `DefaultUserPassword`, el backend crea un usuario **usuario** con esa contraseña cuando la tabla de usuarios está vacía (útil para el primer acceso sin registro).

## Desplegar con GitHub Actions

1. **Política IAM para GitHub Actions:** Crea una política en AWS a partir de `IAM_policies_AWS.json` y asígnala al usuario (o rol) cuyas credenciales usarás en los secrets. Crea después las **Access Key** de ese usuario en la consola IAM y guarda el Access Key ID y el Secret en los secrets del repo (`AWS_ACCESS_KEY` y `AWS_SECRET_KEY`).

2. **Secrets en el repo:** `AWS_ACCESS_KEY` y `AWS_SECRET_KEY` (usuario/rol con permisos para CloudFormation, Lambda, S3, CloudFront, API Gateway, DynamoDB, IAM).

3. **Workflow:** El archivo de `.github/workflows/` se ejecuta:
   - En **push a la rama `labs-03`** cuando cambian archivos en `lab-03.2/` o `Plantilla_CloudFormation_AWS.yml`.
   - O de forma **manual** (workflow_dispatch).

4. **Pasos del pipeline:**
   - Despliega/actualiza el stack CloudFormation `lab03-2-tasks`.
   - Empaqueta y sube el código del backend a la Lambda `lab03-2-api`.
   - Construye el frontend con la URL del API (output del stack) y sube los estáticos a S3.
   - Invalida la caché de CloudFront.

## Despliegue manual (opcional)

Desde la raíz del repo:

```bash
# 1. Stack
aws cloudformation deploy \
  --template-file labs/labs-03-pipelines-github-cloud/lab-03.2/Plantilla_CloudFormation_AWS.yml \
  --stack-name lab03-2-tasks \
  --capabilities CAPABILITY_NAMED_IAM

# 2. Backend
cd labs/labs-03-pipelines-github-cloud/lab-03.2/backend
npm install --omit=dev && zip -r ../../../../backend.zip .
aws lambda update-function-code --function-name lab03-2-api --zip-file fileb://../../../../backend.zip

# 3. Frontend (sustituir API_URL por la URL del API del stack)
cd ../frontend
echo "VITE_APP_API_URL=https://XXXX.execute-api.us-east-2.amazonaws.com/prod" > .env.production
npm install && npm run build
aws s3 sync dist/ s3://NOMBRE_BUCKET/ --delete
```

Obtener `API_URL` y `NOMBRE_BUCKET` con:

```bash
aws cloudformation describe-stacks --stack-name lab03-2-tasks \
  --query "Stacks[0].Outputs" --output table
```

## Estructura del lab

```
lab-03.2/
├── backend/           # Lambda (API: login + CRUD tareas)
│   ├── index.js
│   └── package.json
├── frontend/          # React (Vite)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── IAM_policies_AWS.json   # Política IAM para el usuario de GitHub Actions
├── workflow.yml            # Definición del pipeline (referencia)
└── README.md
```

La plantilla IaC está en **`lab-03.2/Plantilla_CloudFormation_AWS.yml`**.

## URLs tras el despliegue

- **Frontend:** salida `FrontendURL` del stack (CloudFront), p. ej. `https://d1234abcd.cloudfront.net`.
- **API:** salida `ApiURL` del stack, p. ej. `https://abc123.execute-api.us-east-2.amazonaws.com/prod`. El frontend se construye con esta URL en `VITE_APP_API_URL`.

## Notas

- CORS está habilitado en las respuestas de la Lambda para que el frontend en CloudFront pueda llamar al API en API Gateway.
- La contraseña por defecto está en la plantilla (parámetro `DefaultUserPassword`); en producción conviene usar un secreto (p. ej. Secrets Manager) y no subirla al repo.
