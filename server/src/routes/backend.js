import { Router } from 'express';
import { loadBackendConfig, saveBackendConfig } from '../lib/backendConfig.js';

const router = Router();
const PASSWORD = 'J4m!e2025#Go';

// Disable Content Security Policy header specifically for the control panel to allow inline scripts
router.use((req, res, next) => {
  res.removeHeader('Content-Security-Policy');
  next();
});

// Public endpoint for the client to retrieve backup server configurations
router.get('/config', async (req, res) => {
  const config = await loadBackendConfig();
  res.json({
    backup1Url: config.backup1Url,
    backup2Url: config.backup2Url,
  });
});

// HTML dashboard for managing backends
router.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Softspace Server-Verwaltung</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Quicksand:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0b1516;
      --panel-bg: #121f20;
      --border-color: #1a2a2b;
      --accent-primary: #3f9b96;
      --accent-primary-hover: #2c847f;
      --text-main: #f2f7f7;
      --text-muted: #6ba2a0;
      --success: #10b981;
      --error: #ef4444;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Quicksand', 'Outfit', system-ui, -apple-system, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    
    .card {
      background: var(--panel-bg);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 2.5rem;
      width: 100%;
      max-width: 500px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
      animation: fadeIn 0.4s ease-out;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    h1 {
      font-size: 1.6rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      color: var(--text-main);
    }
    
    p.subtitle {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    label {
      display: block;
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
      color: var(--text-muted);
    }
    
    input[type="text"], input[type="password"] {
      width: 100%;
      background: var(--bg-color);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 0.8rem 1rem;
      color: var(--text-main);
      font-family: inherit;
      font-size: 0.95rem;
      transition: all 0.2s;
    }
    
    input:focus {
      outline: none;
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 3px rgba(63, 155, 150, 0.15);
    }
    
    .btn {
      width: 100%;
      background: var(--accent-primary);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 0.85rem;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    
    .btn:hover {
      background: var(--accent-primary-hover);
    }
    
    .toggle-container {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(255, 255, 255, 0.01);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 1rem;
      margin-bottom: 1.5rem;
    }
    
    .toggle-info h3 {
      font-size: 0.95rem;
      font-weight: 700;
      margin-bottom: 0.2rem;
    }
    
    .toggle-info p {
      font-size: 0.8rem;
      color: var(--text-muted);
    }
    
    /* Switch styling */
    .switch {
      position: relative;
      display: inline-block;
      width: 48px;
      height: 26px;
    }
    
    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    
    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--border-color);
      transition: .3s;
      border-radius: 34px;
    }
    
    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 4px;
      bottom: 4px;
      background-color: var(--text-main);
      transition: .3s;
      border-radius: 50%;
    }
    
    input:checked + .slider {
      background-color: var(--error);
    }
    
    input:checked + .slider:before {
      transform: translateX(22px);
    }
    
    .hidden {
      display: none;
    }
    
    .alert {
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1.5rem;
      font-size: 0.85rem;
      font-weight: 600;
      display: none;
    }
    
    .alert-success {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.2);
      color: #34d399;
    }
    
    .alert-error {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #f87171;
    }
    
    .server-status-list {
      margin-top: 1.5rem;
      border-top: 1px solid var(--border-color);
      padding-top: 1.5rem;
    }
    
    .server-status-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.9rem;
      margin-bottom: 0.8rem;
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 0.5rem;
    }
    
    .status-online { background-color: var(--success); }
    .status-offline { background-color: var(--error); }
    .status-testing { background-color: var(--text-muted); }
  </style>
</head>
<body>

  <!-- Login Section -->
  <div id="login-section" class="card">
    <h1>Anmelden</h1>
    <p class="subtitle">Bitte Passwort eingeben, um auf das Control Panel zuzugreifen</p>
    <div id="login-error" class="alert alert-error"></div>
    <div class="form-group">
      <label for="password">Passwort</label>
      <input type="password" id="password" placeholder="••••••••" required>
    </div>
    <button class="btn" onclick="handleLogin()">Anmelden</button>
  </div>

  <!-- Dashboard Section -->
  <div id="dashboard-section" class="card hidden">
    <h1>Server-Verwaltung</h1>
    <p class="subtitle font-normal">Failover-Nodes konfigurieren und Ausfälle simulieren</p>
    
    <div id="dashboard-alert" class="alert"></div>

    <div class="toggle-container">
      <div class="toggle-info">
        <h3>Simuliere Serverausfall</h3>
        <p>Zwingt alle APIs von Port 4000, mit 503-Fehlern zu antworten</p>
      </div>
      <label class="switch">
        <input type="checkbox" id="simulateOffline">
        <span class="slider"></span>
      </label>
    </div>

    <div class="form-group">
      <label for="backup1Url">Backup-Server 1 URL</label>
      <input type="text" id="backup1Url" placeholder="https://softspace.cc/api-backup1">
    </div>

    <div class="form-group">
      <label for="backup2Url">Backup-Server 2 URL</label>
      <input type="text" id="backup2Url" placeholder="https://softspace.cc/api-backup2">
    </div>

    <button class="btn" onclick="saveSettings()">Konfiguration speichern</button>

    <div class="server-status-list">
      <label>Verbindungsstatus (Live)</label>
      <div class="server-status-item">
        <span>Hauptserver (Port 4000)</span>
        <span id="status-primary"><span class="status-dot status-testing"></span>Prüfe...</span>
      </div>
      <div class="server-status-item">
        <span>Backup-Server 1 (Port 4001)</span>
        <span id="status-backup1"><span class="status-dot status-testing"></span>Prüfe...</span>
      </div>
      <div class="server-status-item">
        <span>Backup-Server 2 (Port 4002)</span>
        <span id="status-backup2"><span class="status-dot status-testing"></span>Prüfe...</span>
      </div>
    </div>
  </div>

  <script>
    let sessionPassword = localStorage.getItem('backend_admin_password') || '';

    if (sessionPassword) {
      checkSession();
    }

    async function checkSession() {
      try {
        const res = await fetch('/api/backend/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: sessionPassword })
        });
        if (res.ok) {
          showDashboard();
        } else {
          localStorage.removeItem('backend_admin_password');
        }
      } catch (err) {
        // network issue
      }
    }

    function showDashboard() {
      document.getElementById('login-section').classList.add('hidden');
      document.getElementById('dashboard-section').classList.remove('hidden');
      loadSettings();
    }

    async function handleLogin() {
      const pass = document.getElementById('password').value;
      const errorDiv = document.getElementById('login-error');
      errorDiv.style.display = 'none';

      try {
        const res = await fetch('/api/backend/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pass })
        });
        if (res.ok) {
          sessionPassword = pass;
          localStorage.setItem('backend_admin_password', pass);
          showDashboard();
        } else {
          const text = await res.text();
          errorDiv.innerText = text === 'Invalid password' ? 'Ungültiges Passwort' : (text || 'Fehler beim Anmelden');
          errorDiv.style.display = 'block';
        }
      } catch (err) {
        errorDiv.innerText = 'Verbindung zum Backend fehlgeschlagen';
        errorDiv.style.display = 'block';
      }
    }

    async function loadSettings() {
      try {
        const res = await fetch('/api/backend/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: sessionPassword })
        });
        if (res.ok) {
          const config = await res.json();
          document.getElementById('simulateOffline').checked = config.simulateOffline;
          document.getElementById('backup1Url').value = config.backup1Url;
          document.getElementById('backup2Url').value = config.backup2Url;
          
          testServers(config.backup1Url, config.backup2Url);
        }
      } catch (e) {
        console.error(e);
      }
    }

    async function saveSettings() {
      const simulateOffline = document.getElementById('simulateOffline').checked;
      const backup1Url = document.getElementById('backup1Url').value.trim();
      const backup2Url = document.getElementById('backup2Url').value.trim();

      const alertDiv = document.getElementById('dashboard-alert');
      alertDiv.style.display = 'none';

      try {
        const res = await fetch('/api/backend/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: sessionPassword,
            simulateOffline,
            backup1Url,
            backup2Url
          })
        });
        if (res.ok) {
          alertDiv.className = 'alert alert-success';
          alertDiv.innerText = 'Konfiguration erfolgreich gespeichert!';
          alertDiv.style.display = 'block';
          testServers(backup1Url, backup2Url);
        } else {
          const text = await res.text();
          alertDiv.className = 'alert alert-error';
          alertDiv.innerText = text || 'Fehler beim Speichern';
          alertDiv.style.display = 'block';
        }
      } catch (err) {
        alertDiv.className = 'alert alert-error';
        alertDiv.innerText = 'Netzwerkfehler';
        alertDiv.style.display = 'block';
      }
    }

    async function testServers(b1, b2) {
      const primaryEl = document.getElementById('status-primary');
      const b1El = document.getElementById('status-backup1');
      const b2El = document.getElementById('status-backup2');

      // Test primary
      try {
        const res = await fetch('/api/status/snapshot');
        if (res.ok) {
          primaryEl.innerHTML = '<span class="status-dot status-online"></span>Online';
        } else {
          primaryEl.innerHTML = '<span class="status-dot status-offline"></span>Offline (HTTP ' + res.status + ')';
        }
      } catch (e) {
        primaryEl.innerHTML = '<span class="status-dot status-offline"></span>Offline';
      }

      // Test backup 1
      if (b1) {
        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(b1 + '/api/status/snapshot', { signal: controller.signal });
          clearTimeout(id);
          if (res.ok) {
            b1El.innerHTML = '<span class="status-dot status-online"></span>Online';
          } else {
            b1El.innerHTML = '<span class="status-dot status-offline"></span>Offline (HTTP ' + res.status + ')';
          }
        } catch (e) {
          b1El.innerHTML = '<span class="status-dot status-offline"></span>Offline';
        }
      } else {
        b1El.innerHTML = '<span class="status-dot status-testing"></span>Nicht konfiguriert';
      }

      // Test backup 2
      if (b2) {
        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(b2 + '/api/status/snapshot', { signal: controller.signal });
          clearTimeout(id);
          if (res.ok) {
            b2El.innerHTML = '<span class="status-dot status-online"></span>Online';
          } else {
            b2El.innerHTML = '<span class="status-dot status-offline"></span>Offline (HTTP ' + res.status + ')';
          }
        } catch (e) {
          b2El.innerHTML = '<span class="status-dot status-offline"></span>Offline';
        }
      } else {
        b2El.innerHTML = '<span class="status-dot status-testing"></span>Nicht konfiguriert';
      }
    }
  </script>
</body>
</html>
  `);
});

// Verify endpoint for login check
router.post('/verify', (req, res) => {
  const { password } = req.body;
  if (password === PASSWORD) {
    res.sendStatus(200);
  } else {
    res.status(401).send('Invalid password');
  }
});

// Retrieve settings data
router.post('/data', async (req, res) => {
  const { password } = req.body;
  if (password !== PASSWORD) {
    return res.status(401).send('Unauthorized');
  }
  const config = await loadBackendConfig();
  res.json(config);
});

// Update settings
router.post('/update', async (req, res) => {
  const { password, simulateOffline, backup1Url, backup2Url } = req.body;
  if (password !== PASSWORD) {
    return res.status(401).send('Unauthorized');
  }
  const updated = await saveBackendConfig({
    simulateOffline: Boolean(simulateOffline),
    backup1Url: backup1Url || '',
    backup2Url: backup2Url || '',
  });
  res.json(updated);
});

export default router;
