import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3000;

// --- Logto Verification Setup ---
const LOGTO_ENDPOINT = process.env.LOGTO_ENDPOINT;
const LOGTO_API_RESOURCE = process.env.LOGTO_API_RESOURCE || 'https://api.cm-portal.io';
const JWKS = LOGTO_ENDPOINT ? createRemoteJWKSet(new URL(`${LOGTO_ENDPOINT}/oidc/jwks`)) : null;

async function verifyLogtoToken(req, res, next) {
  if (!LOGTO_ENDPOINT) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${LOGTO_ENDPOINT}/oidc`,
      audience: LOGTO_API_RESOURCE,
    });
    req.user = payload;
    next();
  } catch (error) {
    console.error('JWT Verification Error:', error.message);
    return res.status(401).json({ error: 'Unauthorized: ' + error.message });
  }
}

app.use(express.json());
app.use(express.static('public'));

// --- API Endpoints ---

app.get('/api/config', (req, res) => {
  res.json({
    dashboardId: process.env.METABASE_DASHBOARD_ID || '4',
    metabaseInstanceUrl: process.env.METABASE_INSTANCE_URL,
    hasMetabaseSecretKey: !!process.env.METABASE_SECRET_KEY,
    theme: 'night',
    isGuest: false,
    LOGTO_ENDPOINT: process.env.LOGTO_ENDPOINT,
    LOGTO_APP_ID: process.env.LOGTO_APP_ID,
  });
});

app.get('/api/metabase-token', verifyLogtoToken, (req, res) => {
  const secretKey = process.env.METABASE_SECRET_KEY;
  const dashboardId = parseInt(process.env.METABASE_DASHBOARD_ID || '4');

  if (!secretKey) return res.status(500).json({ error: 'Metabase Secret Key is not configured.' });

  const payload = {
    resource: { dashboard: dashboardId },
    params: {},
    exp: Math.round(Date.now() / 1000) + (10 * 60)
  };

  const token = jwt.sign(payload, secretKey);
  res.json({ token });
});

app.post('/api/agent', verifyLogtoToken, async (req, res) => {
  const { message, context } = req.body;
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!n8nWebhookUrl) return res.status(500).json({ error: 'n8n Webhook URL is not configured.' });

  try {
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message, 
        context: { ...context, user: req.user?.sub || 'anonymous' }
      }),
    });

    const data = await response.json();
    const reply = data.output || data.reply || (Array.isArray(data) ? data[0].output : null);

    res.json({ 
      reply: reply || "Assistant is processing your request.",
      dashboard: data.dashboard || null,
      intent: data.intent || null
    });
  } catch (error) {
    console.error('n8n Webhook Error:', error);
    res.status(500).json({ error: 'Failed to communicate with the intelligence agent.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

export default app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`🚀 Mission Control running at http://localhost:${port}`);
  });
}
