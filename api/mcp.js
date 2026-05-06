import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { MCPAuth } from 'mcp-auth';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const LOGTO_ENDPOINT = 'https://p7a5w0.logto.app';
// Clean the identifier from any accidental whitespace or newlines
const resourceIdentifier = (process.env.LOGTO_API_RESOURCE || 'https://api.cm-portal.io').trim();

const mcpAuth = new MCPAuth({
  protectedResources: {
    metadata: {
      resource: resourceIdentifier,
      authorizationServers: [{ issuer: `${LOGTO_ENDPOINT}/oidc`, type: 'oidc' }],
      scopesSupported: ['read:analytics', 'write:agent'],
    },
  },
});

const server = new McpServer({ 
  name: "C-M Analytics Enterprise Bridge", 
  version: "1.1.0" 
});

// Tool: System Health & Status
server.tool(
  'get_system_status',
  { description: 'Check the operational status of the Analytics Portal and Metabase nodes.' },
  async () => {
    return { 
      content: [{ 
        type: 'text', 
        text: `🚀 C-M Enterprise Systems are ONLINE. Dashboard ID: ${process.env.METABASE_DASHBOARD_ID || '4'}. Resource: ${resourceIdentifier}` 
      }] 
    };
  }
);

// Tool: Intelligence Query
server.tool(
  'query_intelligence_agent',
  { 
    prompt: z.string().describe('The analytics question or instruction for the AI agent.') 
  },
  async ({ prompt }) => {
    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nUrl) return { content: [{ type: 'text', text: "Error: n8n agent not linked." }] };

    try {
      const response = await fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, context: { source: 'mcp-remote-bridge' } }),
      });
      const data = await response.json();
      return { 
        content: [{ 
          type: 'text', 
          text: data.output || data.reply || "Agent successfully processed the request." 
        }] 
      };
    } catch (error) {
      return { content: [{ type: 'text', text: `Bridge Error: ${error.message}` }] };
    }
  }
);

// --- Routes ---

app.use(mcpAuth.protectedResourceMetadataRouter());

let transport;
app.get('/mcp/sse', async (req, res) => {
  console.log('🔌 New MCP SSE Connection');
  transport = new SSEServerTransport('/mcp/messages', res);
  await server.connect(transport);
});

app.post('/mcp/messages', async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send('No active transport');
  }
});

// Middleware for bearer auth on execution
app.use('/mcp/execute', mcpAuth.bearerAuth('jwt', {
  resource: resourceIdentifier,
  audience: resourceIdentifier,
  requiredScopes: ['read:analytics'],
}));

export default app;
