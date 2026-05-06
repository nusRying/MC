import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const LOGTO_ENDPOINT = process.env.LOGTO_ENDPOINT;
const LOGTO_API_RESOURCE = process.env.LOGTO_API_RESOURCE || 'https://api.cm-portal.io';
const JWKS = LOGTO_ENDPOINT ? createRemoteJWKSet(new URL(`${LOGTO_ENDPOINT}/oidc/jwks`)) : null;

async function verifyLogtoToken(req, res, next) {
  if (!LOGTO_ENDPOINT) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth' });

  try {
    const { payload } = await jwtVerify(authHeader.split(' ')[1], JWKS, {
      issuer: `${LOGTO_ENDPOINT}/oidc`,
      audience: LOGTO_API_RESOURCE,
    });
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

app.use(express.json());

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
  if (!secretKey) return res.status(500).json({ error: 'Missing secret' });

  const payload = {
    resource: { dashboard: parseInt(process.env.METABASE_DASHBOARD_ID || '4') },
    params: {},
    exp: Math.round(Date.now() / 1000) + (10 * 60)
  };

  res.json({ token: jwt.sign(payload, secretKey) });
});

app.post('/api/agent', verifyLogtoToken, async (req, res) => {
  const { message, context } = req.body;
  const n8nUrl = process.env.N8N_WEBHOOK_URL;
  if (!n8nUrl) return res.status(500).json({ error: 'Missing n8n URL' });

  try {
    const response = await fetch(n8nUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context: { ...context, user: req.user?.sub } }),
    });
    const data = await response.json();
    res.json({ 
      reply: data.output || data.reply || "Processed.",
      dashboard: data.dashboard || null,
      intent: data.intent || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Agent communication failed' });
  }
});

export default app;
