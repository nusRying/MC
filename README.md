# C-M Analytics Portal

This project is a small Node.js app that:

- serves a polished frontend for the client
- generates short-lived Metabase embed tokens on the server
- embeds a Metabase dashboard into the page
- provides a sidebar that can forward messages to n8n/Openclaw webhooks

## Prerequisites

- Node.js 18 or newer
- A Metabase dashboard with embedding enabled
- The Metabase secret key for signed embedding

## Setup

1. Copy `.env.example` to `.env`
2. Fill in `METABASE_SECRET_KEY`
3. Set `METABASE_DASHBOARD_ID` to the dashboard you want to embed
4. Optionally set `N8N_WEBHOOK_URL` if you want the sidebar to forward messages to n8n

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Open `http://localhost:3000`.

## What you still need to do in Metabase

- Enable embedding for the dashboard
- Confirm the dashboard ID matches the one in `.env`
- Make sure the Metabase instance is reachable over HTTPS

## Agent sidebar flow

If `N8N_WEBHOOK_URL` is set, the sidebar posts messages to that webhook.
If it is not set, the app returns a local mock response so the UI still works in a demo.

## N8N Workflow Setup

The portal integrates with an n8n workflow (`My workflow (1).json`) for advanced message routing, logging, and broadcasting.

### 1. Import the workflow

- Open your n8n instance
- Go to **Workflows** → **Import**
- Upload `My workflow (1).json`

### 2. Configure environment variables in n8n

Set these as n8n environment variables or credentials:

- **`ACTIVITY_LOG_URL`** — Endpoint to post activity logs (e.g., `https://base.kutraa.com/rest/v1/activity_log`)
- **`ACTIVITY_LOG_APIKEY`** — Bearer token or API key for logging
- **`AGENT_FORWARD_BASE_URL`** — Base URL for agent forwarding (e.g., `http://your-agent-server:port`)
- **`AGENT_FORWARD_BEARER`** — Bearer token for agent forwarding (optional)
- **`SUPABASE_RPC_URL`** — Supabase RPC endpoint for conversation storage (optional)
- **`SUPABASE_APIKEY`** — Supabase API key (optional)
- **`OPENCLAW_WEBHOOK_URL`** — Webhook URL for Openclaw forwarding (optional; used by Route node)

### 3. Activate the workflow

- Click **Activate** on the workflow
- Copy the webhook URL for the `cm-agent` webhook node

### 4. Connect the portal to n8n

- Update the portal `.env` with the webhook URL:
  ```
  N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/cm-agent
  ```
- Restart the portal:
  ```bash
  npm start
  ```

## Testing

### Quick smoke tests

**Test 1: Direct to n8n (bypass portal)**
```bash
curl -s -X POST "https://your-n8n-instance.com/webhook/cm-agent" \
  -H "Content-Type: application/json" \
  -d '{"message":"Show sales trend for last week","context":{}}' | jq
```
Expected: JSON with `reply`, `intent`, `dashboard`, etc.

**Test 2: Via portal proxy**
```bash
curl -s -X POST "http://localhost:3000/api/agent" \
  -H "Content-Type: application/json" \
  -d '{"message":"Top 5 products","context":{}}' | jq
```
Expected: `{"reply": "..."}`

**Test 3: In-browser**
- Open `http://localhost:3000`
- Use the sidebar to ask "Show branch stock"
- Confirm the chat log shows the reply

### Debug page

Open `http://localhost:3000/debug` to see:
- Configured N8N webhook URL
- Metabase secret key status
- Last agent response and timestamp
- Any recent errors

The page auto-refreshes every 3 seconds.

### JSON API for debugging

GET `http://localhost:3000/api/debug` returns JSON with current status:
```json
{
  "n8nWebhookUrl": "...",
  "hasMetabaseSecretKey": true,
  "lastAgentResponse": { ... },
  "lastAgentError": null,
  "serverTime": "..."
}
```

## Workflow architecture

The imported workflow (`My workflow (1).json`) includes:

1. **C-M Agent Webhook** — Receives inbound requests from the portal at `/webhook/cm-agent`
2. **Route C-M Agent Request** — Classifies intent (sales_trend, product_mix, branch_stock, top_products, dashboard_help, or general)
3. **Prepare Log** — Structures payload for activity logging
4. **Broadcast Resolver** — Resolves agent routing (only if `metadata.agent_ids` or `metadata.broadcast=true`)
5. **Broadcast Sender** — Forwards to individual agent hooks
6. **Store User Message** — Appends user message to Supabase conversation table (RPC call)
7. **Activity Log** — Posts structured log to external logging service
8. **Respond to Portal** — Returns the original reply to the portal sidebar

### Data flow

```
Portal -> POST /webhook/cm-agent
  -> Webhook receives { message, context }
  -> Route classifies & optionally forwards to OPENCLAW_WEBHOOK_URL
  -> Prepare Log structures { project, intent, message, dashboard, forwarded, received_at }
  -> (side-branch) Broadcast Resolver + Sender (only if broadcast=true)
  -> (side-branch) Store User Message to Supabase
  -> Activity Log posts to external endpoint
  -> Respond to Portal returns { reply, intent, dashboard, suggestions, ... }
  -> Portal shows reply in sidebar
```

### Customization

- Modify the **Route C-M Agent Request** code node to add/update intent classification rules
- Adjust **Broadcast Resolver** to filter or transform agent routing
- Connect **Activity Log** and **Store User Message** to your own backends

## Troubleshooting

**Portal shows "Mock agent response"**
- `N8N_WEBHOOK_URL` is not set or incorrect
- Check `/debug` page to verify the URL

**N8N returns 404 or timeout**
- Confirm the webhook is active in n8n
- Check n8n execution logs for the workflow run
- Ensure your firewall allows traffic to n8n

**No reply from agent**
- Check n8n execution logs to see if the workflow ran
- Verify the `Respond to Portal` node is wired to send output
- Ensure the node output contains a `reply` field

**Activity logs not received**
- Confirm `ACTIVITY_LOG_URL` and `ACTIVITY_LOG_APIKEY` are set in n8n
- Check if the external logging endpoint is reachable

## Deployment to Coolify

1. Create a new project `C-M` in Coolify
2. Add this git repository or upload the source
3. Set environment variables in Coolify (copy from `.env`)
4. Deploy (Coolify will run `npm install && npm start`)
5. Configure the public URL in your `.env` for `N8N_WEBHOOK_URL`
6. Restart the deployment
