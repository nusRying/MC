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
        const reply = data.reply || data.message || data.text || 'Agent workflow completed.';
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
  <title>C-M Portal Debug</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 2rem; background: #f5f5f5; }
    .container { max-width: 900px; margin: 0 auto; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; }
    .section { margin-top: 2rem; border-top: 1px solid #eee; padding-top: 1rem; }
    .label { font-weight: 600; color: #666; }
    .value { font-family: 'Monaco', 'Courier New', monospace; background: #f9f9f9; padding: 0.5rem; border-radius: 4px; word-break: break-all; }
    .status-ok { color: #27ae60; }
    .status-missing { color: #e74c3c; }
    .status-pending { color: #f39c12; }
    pre { background: #f9f9f9; padding: 1rem; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="container">
    <h1>C-M Portal Debug Info</h1>
    
    <div class="section">
      <p class="label">N8N Webhook URL:</p>
      <p class="value" id="webhook-url">Loading...</p>
    </div>
    
    <div class="section">
      <p class="label">Metabase Secret Key:</p>
      <p class="value" id="secret-key">Loading...</p>
    </div>
    
    <div class="section">
      <p class="label">Last Agent Response:</p>
      <pre id="last-response">Loading...</pre>
    </div>
    
    <div class="section">
      <p class="label">Last Agent Error:</p>
      <pre id="last-error">None</pre>
    </div>
    
    <div class="section">
      <p class="label">Server Time:</p>
      <p class="value" id="server-time">Loading...</p>
    </div>
  </div>
  
  <script>
    async function loadDebugInfo() {
      try {
        const res = await fetch('/api/debug');
        const data = await res.json();
        
        document.getElementById('webhook-url').textContent = data.n8nWebhookUrl;
        document.getElementById('webhook-url').className = 'value ' + (data.n8nWebhookUrl === '(not configured)' ? 'status-missing' : 'status-ok');
        
        document.getElementById('secret-key').textContent = data.hasMetabaseSecretKey ? '✓ Configured' : '✗ Missing';
        document.getElementById('secret-key').className = 'value ' + (data.hasMetabaseSecretKey ? 'status-ok' : 'status-missing');
        
        document.getElementById('last-response').textContent = data.lastAgentResponse ? JSON.stringify(data.lastAgentResponse, null, 2) : 'No responses yet';
        
        document.getElementById('last-error').textContent = data.lastAgentError ? JSON.stringify(data.lastAgentError, null, 2) : 'None';
        
        document.getElementById('server-time').textContent = data.serverTime;
      } catch (error) {
        document.getElementById('webhook-url').textContent = 'Error loading debug info: ' + error.message;
      }
    }
    
    loadDebugInfo();
    setInterval(loadDebugInfo, 3000);
  </script>
</body>
</html>
  `;
  res.send(html);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`C-M portal running on http://localhost:${port}`);
});
