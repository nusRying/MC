# C-M Portal: Complete Deployment Guide

## Overview

This guide covers the complete C-M portal setup, n8n workflow integration, and testing procedures.

**Architecture:**
- **Frontend Portal** — Node.js + Express server serving embedded Metabase dashboard + agent sidebar (React-free vanilla JS)
- **n8n Workflow** — Message routing, intent classification, logging, broadcast forwarding, Supabase integration
- **Data Source** — Supabase/Postgres with 5000+ demo transactions
- **Dashboard** — Metabase with signed JWT embedding

---

## Part 1: Portal Setup (Local / Coolify)

### 1.1 Clone & install

```bash
git clone <repo>
cd <repo>
npm install
```

### 1.2 Configure `.env`

Copy from `.env.example` and fill in:

```env
# Metabase
METABASE_INSTANCE_URL=https://cmmeta.kutraa.com
METABASE_SECRET_KEY=your_secret_key_here
METABASE_DASHBOARD_ID=4

# N8N (after workflow import)
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/cm-agent

# Server
PORT=3000
```

### 1.3 Start locally

```bash
npm start
```

Open `http://localhost:3000`.

### 1.4 Deploy to Coolify

1. Create project `C-M` in Coolify
2. Add this repository
3. Set environment variables in Coolify dashboard
4. Deploy (Coolify runs `npm install && npm start`)

---

## Part 2: N8N Workflow Integration

### 2.1 Import workflow

1. Open n8n UI → **Workflows** → **Import**
2. Upload `My workflow (1).json`
3. Review nodes (optional — see architecture below)

### 2.2 Configure n8n environment variables

In n8n **Settings** → **Environment Variables**, add:

| Variable | Example | Required |
|----------|---------|----------|
| `ACTIVITY_LOG_URL` | `https://base.kutraa.com/rest/v1/activity_log` | Yes* |
| `ACTIVITY_LOG_APIKEY` | `Bearer eyJhb...` | Yes* |
| `OPENCLAW_WEBHOOK_URL` | `https://openclaw-instance/webhook` | No |
| `AGENT_FORWARD_BASE_URL` | `http://agent-server:18789` | No (for broadcast) |
| `AGENT_FORWARD_BEARER` | `Bearer token...` | No (for broadcast) |
| `SUPABASE_RPC_URL` | `https://base.kutraa.com/rest/v1/rpc/append_conversation_message` | No |
| `SUPABASE_APIKEY` | `eyJ0eXAi...` | No |

*= Optional if you don't need activity logging / Supabase storage

### 2.3 Activate & note webhook URL

1. Click **Activate** on the workflow
2. Click the **C-M Agent Webhook** node
3. Copy the full webhook URL (e.g., `https://n8n.your-domain.com/webhook/cm-agent`)

### 2.4 Update portal `.env` and restart

```env
N8N_WEBHOOK_URL=<copied-webhook-url>
```

Then restart the portal:
```bash
npm restart  # or stop & npm start
```

---

## Part 3: Testing

### 3.1 Verify configuration

**In portal browser, open debug page:**
```
http://localhost:3000/debug
```

Should show:
- ✓ N8N webhook URL is configured
- ✓ Metabase secret key is present
- Status refreshes every 3 seconds

**Or via API:**
```bash
curl -s http://localhost:3000/api/debug | json_pp
```

### 3.2 Direct n8n webhook test

Test the n8n workflow in isolation:
```bash
curl -s -X POST "https://your-n8n-instance.com/webhook/cm-agent" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Show sales trend for last week",
    "context": { "source": "test" }
  }' | json_pp
```

Expected response:
```json
{
  "ok": true,
  "intent": "sales_trend",
  "reply": "Pull the Sales Trend chart...",
  "dashboard": "Sales Trend",
  "suggestions": [...]
}
```

### 3.3 Portal proxy test

Test the portal `/api/agent` endpoint:
```bash
curl -s -X POST "http://localhost:3000/api/agent" \
  -H "Content-Type: application/json" \
  -d '{ "message": "Top 5 products", "context": {} }' | json_pp
```

Expected response:
```json
{
  "reply": "I can list the highest-stock products...",
  "raw": {
    "ok": true,
    "intent": "top_products",
    ...
  }
}
```

### 3.4 In-browser interaction

1. Open `http://localhost:3000`
2. Click a quick action button or type in the sidebar
3. Confirm chat log shows the agent reply

### 3.5 Check n8n execution logs

In n8n:
1. Go to **Executions**
2. Find the `C-M Agent Bridge v2` workflow runs
3. Expand each execution to see node outputs
4. Verify `Respond to Portal` node has output with `reply`

---

## Part 4: N8N Workflow Architecture

### Nodes & Flow

```
C-M Agent Webhook
    ↓
Route C-M Agent Request (classify intent)
    ├─→ Prepare Log
    │    ├─→ Activity Log (HTTP POST)
    │    │    ├─→ Respond to Portal ← Portal receives reply here
    │    │    ↑
    │    └─→ Broadcast Resolver (if metadata.broadcast=true)
    │         ├─→ Broadcast Sender (HTTP POST per agent)
    │         │    ↓
    │         └─→ Store User Message (Supabase RPC)
    │              ↓ (both flow to Activity Log)
    │
    └─→ Respond to Portal (direct, immediate response)
```

### Node Descriptions

| Node | Purpose | Config |
|------|---------|--------|
| **C-M Agent Webhook** | Listens for portal messages at `/webhook/cm-agent` | POST, Response Node mode |
| **Route C-M Agent Request** | JavaScript code that classifies intent and optionally forwards to Openclaw | Uses `OPENCLAW_WEBHOOK_URL` env var |
| **Prepare Log** | Structures log payload (project, intent, message, received_at) | JavaScript code |
| **Broadcast Resolver** | Expands broadcast requests to individual agents (only if `metadata.broadcast=true`) | JavaScript code; outputs array of agent targets |
| **Broadcast Sender** | Forwards message to each agent via HTTP POST | Uses `AGENT_FORWARD_BASE_URL` + `AGENT_FORWARD_BEARER` |
| **Store User Message** | Appends message to Supabase `conversations` table via RPC | Uses `SUPABASE_RPC_URL` + `SUPABASE_APIKEY` |
| **Activity Log** | HTTP POST to external logging service | Uses `ACTIVITY_LOG_URL` + `ACTIVITY_LOG_APIKEY` |
| **Respond to Portal** | Sends final response back to portal | Webhook Response node |

### Intent Classification

The **Route C-M Agent Request** node recognizes these intents:

| Keyword Match | Intent | Reply |
|---------------|--------|-------|
| trend, daily, weekly, revenue | `sales_trend` | "Pull the Sales Trend chart..." |
| product type, product mix, category | `product_mix` | "I can summarize how sales are split..." |
| branch, city, stock | `branch_stock` | "I can show branch stock by city..." |
| top product, top 5, top 10 | `top_products` | "I can list the highest-stock products..." |
| embed, dashboard, metabase | `dashboard_help` | "The dashboard embed is ready..." |
| (anything else) | `general` | "I can help with sales, stock..." |

---

## Part 5: Environment Variables Reference

### Portal (.env)

```env
# Server
PORT=3000

# Metabase embedding
METABASE_INSTANCE_URL=https://cmmeta.kutraa.com
METABASE_SECRET_KEY=your_secret_key
METABASE_DASHBOARD_ID=4

# N8N webhook
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/cm-agent
```

### N8N (Environment Variables)

```env
# Activity logging (required for Activity Log node)
ACTIVITY_LOG_URL=https://base.kutraa.com/rest/v1/activity_log
ACTIVITY_LOG_APIKEY=Bearer eyJ0eXAiOiJKV1QiLCJhbGci...

# Broadcast forwarding (optional, for multi-agent routing)
AGENT_FORWARD_BASE_URL=http://agent-server.local:18789
AGENT_FORWARD_BEARER=Bearer token123

# Supabase integration (optional, for conversation storage)
SUPABASE_RPC_URL=https://base.kutraa.com/rest/v1/rpc/append_conversation_message
SUPABASE_APIKEY=eyJ0eXAiOiJKV1QiLCJhbGci...

# Openclaw forwarding (optional, for advanced routing)
OPENCLAW_WEBHOOK_URL=https://openclaw-instance.com/webhook/agent
```

---

## Part 6: Troubleshooting

### Portal shows "Mock agent response"

**Cause:** `N8N_WEBHOOK_URL` is missing or incorrect

**Fix:**
1. Check portal `.env` for `N8N_WEBHOOK_URL`
2. Open `http://localhost:3000/debug` and verify the webhook URL is displayed
3. Restart the portal and try again

### N8N workflow errors

**Check execution logs:**
1. In n8n, go to **Executions**
2. Find the failed workflow run
3. Expand each node to see error details

**Common issues:**
- **Activity Log node fails** → Check `ACTIVITY_LOG_URL` and `ACTIVITY_LOG_APIKEY` are set
- **Broadcast Sender fails** → Check `AGENT_FORWARD_BASE_URL` and target agent is reachable
- **Store User Message fails** → Check `SUPABASE_RPC_URL` and `SUPABASE_APIKEY` are set

### Portal doesn't show reply

**Cause:** Respond to Portal node isn't receiving output with `reply` field

**Check:**
1. Verify n8n workflow ran (check executions)
2. Expand `Respond to Portal` node in execution log
3. Confirm it has an item with `reply` field
4. If missing, ensure `Route C-M Agent Request` returns `reply` in its output

### Broadcast messages not going out

**Cause:** Broadcast is disabled by default

**To enable:**
- Send metadata with the request: `{"message": "...", "metadata": {"broadcast": true}}`
- Or set `metadata.agent_ids` to an array of agent IDs

---

## Part 7: Quick Reference

### Start portal
```bash
npm start
```

### Start portal (development, watch mode)
```bash
npm install -g nodemon
nodemon server.js
```

### View debug info
```
http://localhost:3000/debug
```

### View API debug (JSON)
```bash
curl http://localhost:3000/api/debug
```

### Test agent endpoint
```bash
curl -X POST http://localhost:3000/api/agent \
  -H "Content-Type: application/json" \
  -d '{"message":"Test message"}'
```

### View n8n workflow
- Open n8n UI
- Search for "C-M Agent Bridge v2"
- Click to view nodes and connections

---

## Part 8: Production Checklist

Before deploying to production:

- [ ] Set `METABASE_SECRET_KEY` to a strong value
- [ ] Use HTTPS URLs for all external endpoints
- [ ] Set `N8N_WEBHOOK_URL` to the production n8n domain
- [ ] Configure all required n8n environment variables
- [ ] Test end-to-end at least once (portal → n8n → response)
- [ ] Set up logging and monitoring (activity log endpoint)
- [ ] Configure database backups (Supabase auto-handles, but confirm)
- [ ] Set up firewall rules to allow n8n ↔ portal communication
- [ ] Document any custom intent rules added to the Route node
- [ ] Create runbook for alerting on workflow failures

---

## Next Steps

1. **Import the workflow** — Use this guide Part 2
2. **Configure n8n** — Set environment variables
3. **Update portal .env** — Copy N8N webhook URL
4. **Test locally** — Use this guide Part 3
5. **Deploy to Coolify** — Use this guide Part 1.4
6. **Monitor** — Check `/debug` page regularly

For questions, see the README.md or workflow comments in `My workflow (1).json`.
