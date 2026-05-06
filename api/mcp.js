import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { MCPAuth } from 'mcp-auth';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const LOGTO_ENDPOINT = 'https://p7a5w0.logto.app';
const resourceIdentifier = process.env.LOGTO_API_RESOURCE || 'https://api.cm-portal.io';

const mcpAuth = new MCPAuth({
  protectedResources: {
    metadata: {
      resource: resourceIdentifier,
      authorizationServers: [{ issuer: `${LOGTO_ENDPOINT}/oidc`, type: 'oidc' }],
      scopesSupported: ['read:analytics', 'write:agent'],
    },
  },
});

const server = new McpServer({ name: "C-M Analytics Assistant", version: "1.0.0" });

server.tool('get_analytics_status', {}, async () => {
  return { content: [{ type: 'text', text: `System online. ID: ${process.env.METABASE_DASHBOARD_ID}` }] };
});

server.tool('ask_intelligence_agent', { query: z.string() }, async ({ query }) => {
  const response = await fetch(process.env.N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: query }),
  });
  const data = await response.json();
  return { content: [{ type: 'text', text: data.output || data.reply }] };
});

app.use(mcpAuth.protectedResourceMetadataRouter());

let transport;
app.get('/mcp/sse', async (req, res) => {
  transport = new SSEServerTransport('/mcp/messages', res);
  await server.connect(transport);
});

app.post('/mcp/messages', async (req, res) => {
  if (transport) await transport.handlePostMessage(req, res);
});

app.use('/mcp/execute', mcpAuth.bearerAuth('jwt', {
  resource: resourceIdentifier,
  audience: resourceIdentifier,
  requiredScopes: ['read:analytics'],
}));

export default app;
