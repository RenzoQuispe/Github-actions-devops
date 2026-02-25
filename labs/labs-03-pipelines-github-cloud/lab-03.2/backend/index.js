const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const USERS_TABLE = process.env.USERS_TABLE || 'lab03-2-users';
const TASKS_TABLE = process.env.TASKS_TABLE || 'lab03-2-tasks';
const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || '';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'lab03-2-secret-change-me';
const USERNAME_INDEX = 'username-index';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function hashPassword(password) {
  return crypto.scryptSync(password, 'lab03-2-salt', 64).toString('hex');
}

// Token opaco: payload (userId, exp) + firma HMAC; el cliente lo envía en Authorization.
function createOpaqueToken(userId) {
  const payload = { userId, exp: Date.now() + 24 * 60 * 60 * 1000 };
  const data = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(data).digest('hex');
  return Buffer.from(data).toString('base64url') + '.' + sig;
}

function verifyOpaqueToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const i = token.indexOf('.');
  if (i === -1) return null;
  const data = token.slice(0, i);
  const sig = token.slice(i + 1);
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(JSON.stringify(payload)).digest('hex');
    if (sig !== expected || (payload.exp && payload.exp < Date.now())) return null;
    return payload.userId;
  } catch {
    return null;
  }
}

function json(body, statusCode = 200) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}

// Busca usuario por username (GSI username-index).
async function findUserByUsername(username) {
  const normalized = (username || '').trim().toLowerCase();
  if (!normalized) return null;
  const r = await docClient.send(
    new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: USERNAME_INDEX,
      KeyConditionExpression: 'username = :u',
      ExpressionAttributeValues: { ':u': normalized },
      Limit: 1,
    })
  );
  return (r.Items && r.Items[0]) || null;
}

// Crea usuario inicial "usuario" si la tabla está vacía (opcional, por parámetro).
async function ensureInitialUser() {
  if (!DEFAULT_PASSWORD) return;
  const existing = await findUserByUsername('usuario');
  if (existing) return;
  const userId = crypto.randomUUID();
  await docClient.send(
    new PutCommand({
      TableName: USERS_TABLE,
      Item: {
        userId,
        username: 'usuario',
        passwordHash: hashPassword(DEFAULT_PASSWORD),
        createdAt: new Date().toISOString(),
      },
    })
  );
}

async function postLogin(body) {
  const { username, password } = typeof body === 'string' ? JSON.parse(body || '{}') : body;
  const userInput = (username || '').trim();
  if (!userInput || !password) return json({ error: 'Falta usuario o contraseña' }, 400);
  await ensureInitialUser();
  const user = await findUserByUsername(userInput);
  if (!user) return json({ error: 'Credenciales incorrectas' }, 401);
  const hash = hashPassword(password);
  if (hash !== user.passwordHash) return json({ error: 'Credenciales incorrectas' }, 401);
  const token = createOpaqueToken(user.userId);
  return json({ token, userId: user.userId, username: user.username });
}

async function postRegister(body) {
  const { username, password } = typeof body === 'string' ? JSON.parse(body || '{}') : body;
  const userInput = (username || '').trim();
  if (!userInput) return json({ error: 'El nombre de usuario es obligatorio' }, 400);
  if (!password || password.length < 4) return json({ error: 'La contraseña debe tener al menos 4 caracteres' }, 400);
  const normalized = userInput.toLowerCase();
  const existing = await findUserByUsername(normalized);
  if (existing) return json({ error: 'Ese nombre de usuario ya está en uso' }, 409);
  const userId = crypto.randomUUID();
  const item = {
    userId,
    username: normalized,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  await docClient.send(new PutCommand({ TableName: USERS_TABLE, Item: item }));
  const token = createOpaqueToken(userId);
  return json({ token, userId, username: normalized }, 201);
}

async function getTasks(userId) {
  const r = await docClient.send(
    new QueryCommand({
      TableName: TASKS_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    })
  );
  const tasks = (r.Items || []).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return json({ tasks });
}

async function postTask(userId, body) {
  const b = typeof body === 'string' ? JSON.parse(body || '{}') : body;
  const title = (b.title || '').trim();
  if (!title) return json({ error: 'Falta title' }, 400);
  const taskId = crypto.randomUUID();
  const item = {
    taskId,
    userId,
    title,
    completed: false,
    createdAt: new Date().toISOString(),
  };
  await docClient.send(new PutCommand({ TableName: TASKS_TABLE, Item: item }));
  return json({ task: item }, 201);
}

async function putTask(userId, taskId, body) {
  const b = typeof body === 'string' ? JSON.parse(body || '{}') : body;
  const get = await docClient.send(
    new GetCommand({ TableName: TASKS_TABLE, Key: { taskId } })
  );
  if (!get.Item || get.Item.userId !== userId) return json({ error: 'Tarea no encontrada' }, 404);
  const updates = [];
  const names = {};
  const values = {};
  if (typeof b.title === 'string') {
    updates.push('#title = :title');
    names['#title'] = 'title';
    values[':title'] = b.title.trim();
  }
  if (typeof b.completed === 'boolean') {
    updates.push('#completed = :completed');
    names['#completed'] = 'completed';
    values[':completed'] = b.completed;
  }
  if (updates.length === 0) return json({ task: get.Item });
  values[':uid'] = userId;
  const r = await docClient.send(
    new UpdateCommand({
      TableName: TASKS_TABLE,
      Key: { taskId },
      UpdateExpression: 'SET ' + updates.join(', '),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'userId = :uid',
      ReturnValues: 'ALL_NEW',
    })
  );
  return json({ task: r.Attributes });
}

async function deleteTask(userId, taskId) {
  const get = await docClient.send(
    new GetCommand({ TableName: TASKS_TABLE, Key: { taskId } })
  );
  if (!get.Item || get.Item.userId !== userId) return json({ error: 'Tarea no encontrada' }, 404);
  await docClient.send(
    new DeleteCommand({
      TableName: TASKS_TABLE,
      Key: { taskId },
      ConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    })
  );
  return json({ ok: true }, 200);
}

function parsePath(path) {
  const base = (path || '').replace(/^\/prod/, '').replace(/\/+$/, '') || '/';
  const parts = base.split('/').filter(Boolean);
  return { base, parts };
}

exports.handler = async (event) => {
  const path = event.path || event.rawPath || '/';
  const method = (event.httpMethod || event.requestContext?.http?.method || 'GET').toUpperCase();
  const body = event.body;
  const authHeader = event.headers?.Authorization || event.headers?.authorization;

  const { parts } = parsePath(path);

  try {
    // OPTIONS CORS preflight
    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          ...CORS_HEADERS,
          'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
        body: '',
      };
    }

    // POST /login
    if (method === 'POST' && (parts[0] === 'login' || path.endsWith('/login'))) {
      return await postLogin(body);
    }

    // POST /register
    if (method === 'POST' && (parts[0] === 'register' || path.endsWith('/register'))) {
      return await postRegister(body);
    }

    // Rutas protegidas
    const userId = verifyOpaqueToken(authHeader);
    if (!userId) {
      return json({ error: 'No autorizado. Inicia sesión.' }, 401);
    }

    // GET /tasks
    if (method === 'GET' && (parts[0] === 'tasks' || path.endsWith('/tasks'))) {
      return await getTasks(userId);
    }

    // POST /tasks
    if (method === 'POST' && (parts[0] === 'tasks' || path.endsWith('/tasks'))) {
      return await postTask(userId, body);
    }

    // PUT /tasks/:id  DELETE /tasks/:id
    if (parts[0] === 'tasks' && parts[1]) {
      const taskId = parts[1];
      if (method === 'PUT') return await putTask(userId, taskId, body);
      if (method === 'DELETE') return await deleteTask(userId, taskId);
    }

    return json({ error: 'Ruta no encontrada', path, method }, 404);
  } catch (err) {
    console.error('API error:', err);
    return json(
      { error: 'Error interno', message: err.message },
      500
    );
  }
};
