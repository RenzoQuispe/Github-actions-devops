import React, { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_APP_API_URL || '';

// Log de conexión al API (visible en consola del navegador)
if (typeof window !== 'undefined') {
  console.log('[Lab 03.2] API base URL:', API_URL || '(vacío — revisar VITE_APP_API_URL en el build)');
  if (!API_URL) console.warn('[Lab 03.2] Sin API URL las peticiones fallarán.');
}

const TOKEN_KEY = 'lab03-2-token';
const USERNAME_KEY = 'lab03-2-username';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function getStoredUsername() {
  return localStorage.getItem(USERNAME_KEY);
}

function setStoredUser(token, username) {
  setToken(token);
  if (username) localStorage.setItem(USERNAME_KEY, username);
  else localStorage.removeItem(USERNAME_KEY);
}

function clearStoredUser() {
  setToken('');
  localStorage.removeItem(USERNAME_KEY);
}

async function api(path, options = {}) {
  const base = API_URL.replace(/\/$/, '');
  const segment = path.replace(/^\//, '');
  const url = segment ? `${base}/${segment}` : base;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (typeof window !== 'undefined') {
    console.log('[Lab 03.2] API request:', options.method || 'GET', url);
  }
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (typeof window !== 'undefined') {
    console.log('[Lab 03.2] API response:', res.status, path, res.ok ? '(OK)' : '(error)', data?.error ? data : '');
  }
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}

function Login({ onLogin, onGoRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api('login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setStoredUser(data.token, data.username);
      onLogin();
    } catch (err) {
      setError(err.error || err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="card">
        <h1>Gestor de tareas</h1>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="nombre de usuario"
              autoComplete="username"
              required
            />
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem' }}>
          ¿No tienes cuenta?{' '}
          <button type="button" className="link-button" onClick={onGoRegister}>
            Crear cuenta
          </button>
        </p>
      </div>
    </div>
  );
}

function Register({ onRegister, onGoLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    if (password.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres');
      return;
    }
    setLoading(true);
    try {
      const data = await api('register', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setStoredUser(data.token, data.username);
      onRegister();
    } catch (err) {
      setError(err.error || err.message || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="card">
        <h1>Crear cuenta</h1>
        <p style={{ textAlign: 'center', color: '#888', fontSize: '0.875rem', marginBottom: '1rem' }}>
          Regístrate para tener tus propias tareas
        </p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="nombre de usuario"
              autoComplete="username"
              required
            />
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 4 caracteres"
              autoComplete="new-password"
              required
              minLength={4}
            />
          </div>
          <div className="form-group">
            <label>Repetir contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repetir contraseña"
              autoComplete="new-password"
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.875rem' }}>
          ¿Ya tienes cuenta?{' '}
          <button type="button" className="link-button" onClick={onGoLogin}>
            Iniciar sesión
          </button>
        </p>
      </div>
    </div>
  );
}

function Tasks({ username, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const loadTasks = useCallback(async () => {
    setError('');
    try {
      const data = await api('tasks');
      setTasks(data.tasks || []);
    } catch (err) {
      if (err.status === 401) {
        clearStoredUser();
        onLogout();
        return;
      }
      setError(err.error || err.message || 'Error al cargar tareas');
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const addTask = async (e) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    setError('');
    try {
      await api('tasks', { method: 'POST', body: JSON.stringify({ title }) });
      setNewTitle('');
      await loadTasks();
    } catch (err) {
      setError(err.error || err.message || 'Error al crear tarea');
    } finally {
      setAdding(false);
    }
  };

  const toggleTask = async (task) => {
    try {
      await api(`tasks/${task.taskId}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: !task.completed }),
      });
      await loadTasks();
    } catch (err) {
      setError(err.error || err.message || 'Error al actualizar');
    }
  };

  const deleteTask = async (taskId) => {
    try {
      await api(`tasks/${taskId}`, { method: 'DELETE' });
      await loadTasks();
    } catch (err) {
      setError(err.error || err.message || 'Error al eliminar');
    }
  };

  const logout = () => {
    clearStoredUser();
    onLogout();
  };

  if (loading) {
    return (
      <div className="app">
        <div className="card">
          <div className="loading">Cargando tareas…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="card">
        <h1>Tareas{username ? ` de ${username}` : ''}</h1>
        <form className="tasks-header" onSubmit={addTask}>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Nueva tarea…"
            disabled={adding}
          />
          <button type="submit" className="btn-primary" disabled={adding}>
            Añadir
          </button>
        </form>
        {error && <div className="error">{error}</div>}
        <ul className="task-list">
          {tasks.length === 0 && (
            <li style={{ color: '#888', padding: '0.5rem 0' }}>No hay tareas. Añade una arriba.</li>
          )}
          {tasks.map((task) => (
            <li key={task.taskId} className="task-item">
              <input
                type="checkbox"
                checked={!!task.completed}
                onChange={() => toggleTask(task)}
              />
              <span className={task.completed ? 'done' : ''}>{task.title}</span>
              <button type="button" onClick={() => deleteTask(task.taskId)}>
                Eliminar
              </button>
            </li>
          ))}
        </ul>
        <div className="logout-row">
          <button type="button" className="btn-secondary" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken());
  const [showRegister, setShowRegister] = useState(false);

  // Comprobar conexión al API al cargar
  useEffect(() => {
    if (!API_URL || typeof window === 'undefined') return;
    const base = API_URL.replace(/\/$/, '');
    const url = `${base}/health`;
    fetch(url)
      .then((r) => r.json().catch(() => ({})))
      .then((data) => {
        console.log('[Lab 03.2] Healthcheck OK — backend alcanzable:', data);
      })
      .catch((err) => {
        console.error('[Lab 03.2] Healthcheck falló — no se puede conectar al API:', err.message, 'URL:', url);
      });
  }, []);

  if (loggedIn) {
    return (
      <Tasks
        username={getStoredUsername()}
        onLogout={() => setLoggedIn(false)}
      />
    );
  }
  if (showRegister) {
    return (
      <Register
        onRegister={() => setLoggedIn(true)}
        onGoLogin={() => setShowRegister(false)}
      />
    );
  }
  return (
    <Login
      onLogin={() => setLoggedIn(true)}
      onGoRegister={() => setShowRegister(true)}
    />
  );
}
