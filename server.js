const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const metabaseInstanceUrl = process.env.METABASE_INSTANCE_URL || 'https://cmmeta.kutraa.com';
const metabaseSecretKey = process.env.METABASE_SECRET_KEY || '';
const dashboardId = Number(process.env.METABASE_DASHBOARD_ID || 4);
const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || '';

// Track last agent response for debug
let lastAgentResponse = null;
let lastAgentError = null;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (_req, res) => {
  res.json({
    metabaseInstanceUrl,
    dashboardId,
    theme: 'light',
    isGuest: true,
    hasMetabaseSecretKey: Boolean(metabaseSecretKey),
    n8nWebhookUrl: n8nWebhookUrl || ''
  });
});

app.get('/api/metabase-token', (_req, res) => {
  if (!metabaseSecretKey) {
    return res.status(500).json({ error: 'METABASE_SECRET_KEY is not configured.' });
  }

  const payload = {
    resource: { dashboard: dashboardId },
    params: {},
    exp: Math.floor(Date.now() / 1000) + 10 * 60,
  };

  const token = jwt.sign(payload, metabaseSecretKey);
  res.json({ token });
});

app.post('/api/agent', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const context = req.body?.context || {};

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  if (n8nWebhookUrl) {
    try {
      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context }),
      });

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        // Prioritize 'output' as requested, then other common n8n response fields
        const reply = data.output || data.reply || data.message || data.text || 'Agent workflow completed.';
        lastAgentResponse = { timestamp: new Date().toISOString(), message, reply, data };
        lastAgentError = null;
        return res.json({ reply, raw: data });
      }

      const text = await response.text();
      const reply = text || 'Agent workflow completed.';
      lastAgentResponse = { timestamp: new Date().toISOString(), message, reply };
      lastAgentError = null;
      return res.json({ reply });
    } catch (error) {
      lastAgentError = { timestamp: new Date().toISOString(), message, error: error.message };
      return res.status(502).json({
        error: 'Failed to reach the configured agent webhook.',
        details: error.message,
      });
    }
  }

  const cannedReply = `Mock agent response: I received "${message}". Connect N8N_WEBHOOK_URL to forward this to your n8n/Openclaw workflow.`;
  lastAgentResponse = { timestamp: new Date().toISOString(), message, reply: cannedReply, mock: true };
  lastAgentError = null;
  res.json({ reply: cannedReply });
});

app.get('/api/debug', (_req, res) => {
  res.json({
    n8nWebhookUrl: n8nWebhookUrl || '(not configured)',
    hasMetabaseSecretKey: Boolean(metabaseSecretKey),
    lastAgentResponse,
    lastAgentError,
    serverTime: new Date().toISOString(),
  });
});

app.get('/debug', (_req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>System Debug | C-M Portal</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root { --bg: #0a0a0a; --panel: #141414; --border: #262626; --text: #fafafa; --muted: #a3a3a3; --accent: #6366f1; }
    body { font-family: 'Inter', sans-serif; margin: 0; background: var(--bg); color: var(--text); padding: 40px 20px; }
    .container { max-width: 800px; margin: 0 auto; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 32px; }
    h1 { font-size: 1.5rem; font-weight: 700; margin: 0 0 24px; letter-spacing: -0.02em; }
    .section { margin-top: 24px; border-top: 1px solid var(--border); padding-top: 20px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 8px; display: block; }
    .value { font-family: ui-monospace, monospace; background: #000; padding: 12px; border-radius: 6px; border: 1px solid var(--border); word-break: break-all; font-size: 13px; }
    .status-ok { color: #22c55e; }
    .status-missing { color: #ef4444; }
    pre { background: #000; padding: 16px; border-radius: 6px; border: 1px solid var(--border); overflow-x: auto; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>System Diagnosis</h1>
    
    <div class="section">
      <span class="label">N8N Webhook Endpoint</span>
      <div class="value" id="webhook-url">Checking...</div>
    </div>
    
    <div class="section">
      <span class="label">Metabase Signing Configuration</span>
      <div class="value" id="secret-key">Checking...</div>
    </div>
    
    <div class="section">
      <span class="label">Last Agent Transaction</span>
      <pre id="last-response">Fetching activity...</pre>
    </div>
    
    <div class="section">
      <span class="label">Active Faults</span>
      <pre id="last-error">None</pre>
    </div>
    
    <div class="section" style="text-align: right; border-top: none;">
      <span class="label" id="server-time">...</span>
    </div>
  </div>
  
  <script>
    async function loadDebugInfo() {
      try {
        const res = await fetch('/api/debug');
        const data = await res.json();
        
        const urlEl = document.getElementById('webhook-url');
        urlEl.textContent = data.n8nWebhookUrl;
        urlEl.className = 'value ' + (data.n8nWebhookUrl === '(not configured)' ? 'status-missing' : 'status-ok');
        
        const keyEl = document.getElementById('secret-key');
        keyEl.textContent = data.hasMetabaseSecretKey ? 'ACTIVE' : 'MISSING';
        keyEl.className = 'value ' + (data.hasMetabaseSecretKey ? 'status-ok' : 'status-missing');
        
        document.getElementById('last-response').textContent = data.lastAgentResponse ? JSON.stringify(data.lastAgentResponse, null, 2) : 'No recent transactions';
        document.getElementById('last-error').textContent = data.lastAgentError ? JSON.stringify(data.lastAgentError, null, 2) : 'No faults detected';
        document.getElementById('server-time').textContent = 'System Time: ' + data.serverTime;
      } catch (error) {
        document.getElementById('webhook-url').textContent = 'Error syncing with diagnostic API: ' + error.message;
      }
    }
    
    loadDebugInfo();
    setInterval(loadDebugInfo, 5000);
  </script>
</body>
</html>
  `;
  res.send(html);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// For Vercel: Export the app instead of calling listen directly
if (process.env.NODE_ENV !== 'production' && require.main === module) {
  app.listen(port, () => {
    console.log(`C-M portal running on http://localhost:${port}`);
  });
}

module.exports = app;
