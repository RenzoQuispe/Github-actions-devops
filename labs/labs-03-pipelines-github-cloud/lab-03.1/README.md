# Lab 03.1 — Lambda + DynamoDB (AWS Free Tier)

Laboratorio con **AWS Lambda** y **DynamoDB**: la Lambda escribe y lista eventos en una tabla. Pensado para **Free Tier** (sin coste con uso bajo).

## Qué hace

- **Lambda** recibe un payload con `action`: `putEvent` (guardar evento) o `listEvents` (listar últimos eventos).
- Los eventos se guardan en DynamoDB (nombre de tabla configurable en la plantilla; por defecto `lab03-1-table1`).
- El **workflow** de GitHub Actions empaqueta el código, despliega en Lambda e invoca dos veces (escribir + listar) y comprueba que las respuestas son 200.

---

## Aprovisionar todo con IaC

Una sola plantilla crea **DynamoDB**, **rol IAM** (logs + DynamoDB) y la **función Lambda**. La Lambda se crea con un handler placeholder (respuesta 501); el código real (putEvent/listEvents) lo despliega el **workflow** en cada push.

### 1. Política IAM para GitHub Actions

Crea una política en AWS a partir de `IAM_Policies_AWS.json` y asígnala al usuario cuyas credenciales usarás en los secrets. Crea después las **Access Key** de ese usuario en la consola IAM y guarda el Access Key ID y el Secret en los secrets del repo (`AWS_ACCESS_KEY` y `AWS_SECRET_KEY`).

### 2. Desplegar la plantilla (manual o desde el pipeline)

**Desde el pipeline (recomendado):** En cada push a la rama `labs-03`, el workflow ejecuta `aws cloudformation deploy` con la plantilla `Plantilla_CloudFormation_AWS.yml` antes de actualizar el código de la Lambda. La primera vez crea el stack; en ejecuciones siguientes solo aplica cambios si la plantilla cambió. No hace falta desplegar la plantilla a mano.

**Manual (opcional):** Si prefieres crear el stack una vez desde tu máquina, desde la raíz del repo:

```bash
aws cloudformation deploy \
  --template-file plantillas-aws/lab-03.1-full.yml \
  --stack-name lab03-1-events \
  --capabilities CAPABILITY_NAMED_IAM
```

Parámetros opcionales (por defecto: `FunctionName=lab03-1-function1`, `TableName=lab03-1-table1`):

```bash
aws cloudformation deploy \
  --template-file plantillas-aws/lab-03.1-full.yml \
  --stack-name lab03-1-events \
  --parameter-overrides FunctionName=mi-lambda-lab03 TableName=mi-tabla-eventos \
  --capabilities CAPABILITY_NAMED_IAM
```

La plantilla crea en tu cuenta AWS:

- Tabla **DynamoDB** (nombre por defecto `lab03-1-table1`, 1 RCU / 1 WCU, Free Tier).
- Rol IAM con permisos de CloudWatch Logs y DynamoDB sobre esa tabla.
- Función **Lambda** con runtime Node.js 24, variable de entorno `TABLE_NAME` y un handler inicial que devuelve **501** (código aún no desplegado).

### 3. Secrets en GitHub

- **AWS_ACCESS_KEY** y **AWS_SECRET_KEY**: el usuario/rol debe tener permisos para **CloudFormation** (crear/actualizar stack), **Lambda** (update-function-code, invoke) y los recursos que crea la plantilla (DynamoDB, IAM). Si despliegas la plantilla desde el pipeline, son necesarios permisos de CloudFormation.
- **FUNCTION_NAME** (opcional): nombre de la función. Si no lo pones, el workflow usa `lab03-1-function1`. Si usaste otro nombre en el parámetro del stack, define aquí el mismo.

### 4. Ejecutar el lab

Haces **push a la rama `labs-03`**. El workflow:

1. Despliega/actualiza el stack con la plantilla (**Deploy stack (CloudFormation)**).
2. Empaqueta el código de `lab-03.1/index.js`.
3. Hace **update-function-code** sobre la Lambda.
4. Invoca la Lambda con `putEvent` y con `listEvents` y verifica que respondan 200.

Tras ese primer push, la función deja de devolver 501 y pasa a ejecutar el código del repo (putEvent/listEvents). En cada push posterior el workflow vuelve a desplegar la plantilla (si hay cambios) y a actualizar el código.