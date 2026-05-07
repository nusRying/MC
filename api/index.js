import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// --- Logto Configuration (Cleaned) ---
const LOGTO_ENDPOINT = (process.env.LOGTO_ENDPOINT || 'https://p7a5w0.logto.app').trim().replace(/\/$/, '');
const LOGTO_API_RESOURCE = (process.env.LOGTO_API_RESOURCE || 'https://api.cm-portal.io').trim();
const JWKS = createRemoteJWKSet(new URL(`${LOGTO_ENDPOINT}/oidc/jwks`));

console.log(`🛡️ Auth Guard active for resource: ${LOGTO_API_RESOURCE}`);

async function verifyLogtoToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
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
    console.error('❌ JWT Verification Failed:', error.message);
    // Log details for easier debugging in Vercel console
    return res.status(401).json({ error: `Unauthorized: ${error.message}` });
  }
}

app.use(express.json());

// --- API Endpoints ---

app.get('/api/config', (req, res) => {
  res.json({
    dashboardId: process.env.METABASE_DASHBOARD_ID || '4',
    metabaseInstanceUrl: process.env.METABASE_INSTANCE_URL,
    hasMetabaseSecretKey: !!process.env.METABASE_SECRET_KEY,
    theme: 'night',
    isGuest: false,
    LOGTO_ENDPOINT: LOGTO_ENDPOINT,
    LOGTO_APP_ID: (process.env.LOGTO_APP_ID || '').trim(),
  });
});

app.get('/api/metabase-token', verifyLogtoToken, (req, res) => {
  const secretKey = process.env.METABASE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Metabase Secret Key is not configured.' });

  const payload = {
    resource: { dashboard: parseInt(process.env.METABASE_DASHBOARD_ID || '4') },
    params: {},
    exp: Math.round(Date.now() / 1000) + (10 * 60)
  };

  const token = jwt.sign(payload, secretKey);
  res.json({ token });
});

app.post('/api/agent', verifyLogtoToken, async (req, res) => {
  const { message, context } = req.body;
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nUrl) return res.status(500).json({ error: 'n8n Webhook URL is not configured.' });

  try {
    console.log('📡 Forwarding to n8n:', n8nUrl);
    const response = await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message, 
        context: { ...context, user: req.user?.sub || 'anonymous' }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ n8n Error Response:', response.status, errorText);
      return res.status(response.status).json({ error: `n8n error: ${response.status}` });
    }

    const data = await response.json();
    console.log('✅ n8n Response Received:', JSON.stringify(data).substring(0, 100));
    
    const result = Array.isArray(data) ? data[0] : data;
    
    res.json({ 
      reply: result.output || result.reply || result.text || "Processed.",
      dashboard: result.dashboard || null,
      intent: result.intent || null
    });
  } catch (error) {
    console.error('💥 Agent Proxy Crash:', error.message);
    res.status(500).json({ error: `Failed to communicate with intelligence agent: ${error.message}` });
  }
});

export default app;
