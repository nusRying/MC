import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { MCPAuth } from 'mcp-auth';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.MCP_PORT || 3001;

// --- 1. MCP Auth Setup ---
const LOGTO_ENDPOINT = 'https://p7a5w0.logto.app';
const resourceIdentifier = process.env.LOGTO_API_RESOURCE || 'https://api.cm-portal.io';

const authServerConfig = {
  issuer: `${LOGTO_ENDPOINT}/oidc`,
  type: 'oidc'
};

const mcpAuth = new MCPAuth({
  protectedResources: {
    metadata: {
      resource: resourceIdentifier,
      authorizationServers: [authServerConfig],
      scopesSupported: ['read:analytics', 'write:agent'],
    },
  },
});

// --- 2. MCP Server Setup ---
const server = new McpServer({
  name: "C-M Analytics Assistant",
  version: "1.0.0"
});

// --- 3. Register Tools ---

server.tool(
  'get_analytics_status',
  { description: 'Get the current status of the Metabase dashboard and system nodes.' },
  async (args, { authInfo }) => {
    return {
      content: [{ 
        type: 'text', 
        text: `System online. Dashboard ID: ${process.env.METABASE_DASHBOARD_ID || '4'}. Metabase Instance: ${process.env.METABASE_INSTANCE_URL}.` 
      }]
    };
  }
);

server.tool(
  'ask_intelligence_agent',
  { 
    query: z.string().describe('The natural language question about sales or inventory data.')
  },
  async ({ query }, { authInfo }) => {
    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nUrl) return { content: [{ type: 'text', text: "n8n Webhook not configured." }] };

    try {
      const response = await fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, context: { source: 'mcp-server' } }),
      });
      const data = await response.json();
      return {
        content: [{ type: 'text', text: data.output || data.reply || "Agent processed the request." }]
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `Agent Error: ${error.message}` }] };
    }
  }
);

// --- 4. Mount Routes ---

app.use(mcpAuth.protectedResourceMetadataRouter());

let transport;
app.get('/sse', async (req, res) => {
  transport = new SSEServerTransport('/messages', res);
  await server.connect(transport);
});

app.post('/messages', async (req, res) => {
  if (!transport) return res.status(400).send('No active SSE connection');
  await transport.handlePostMessage(req, res);
});

app.use('/mcp', mcpAuth.bearerAuth('jwt', {
  resource: resourceIdentifier,
  audience: resourceIdentifier,
  requiredScopes: ['read:analytics'],
}));

export default app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`🤖 C-M Analytics MCP Server running on http://localhost:${port}`);
  });
}
