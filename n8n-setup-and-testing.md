N8N workflow import & testing

1) Import

- Open your n8n instance UI. Go to 'Workflows' → 'Import' and upload `My workflow (1).json`.

2) Credentials / Environment

- In n8n, set these environment variables (or use n8n Credentials where appropriate):
  - `ACTIVITY_LOG_URL` — URL to post activity logs (e.g., https://base.kutraa.com/rest/v1/activity_log)
  - `ACTIVITY_LOG_APIKEY` — Bearer token for activity log API
  - `AGENT_FORWARD_BASE_URL` — Base URL for forwarding to agent hooks (e.g., http://tofyq3lga15o3184lxde506q:18789)
  - `AGENT_FORWARD_BEARER` — Bearer token used when forwarding
  - `SUPABASE_RPC_URL` — Supabase RPC endpoint for `append_conversation_message` (optional)
  - `SUPABASE_APIKEY` — Supabase anon/service key (optional)
  - `OPENCLAW_WEBHOOK_URL` — (optional) URL used by the Route node to forward messages

3) Activate workflow

- Activate the imported workflow and note the webhook URL for the `cm-agent` webhook node.

4) Portal configuration

- Set `N8N_WEBHOOK_URL` in the portal `.env` to the `cm-agent` webhook URL and restart the portal:
```bash
node server.js
```

5) Quick tests

- Direct to n8n webhook:
```bash
curl -s -X POST "<N8N_WEBHOOK_URL>" \
  -H "Content-Type: application/json" \
  -d '{"message":"Show sales trend for last week","context":{}}' | jq
```

- Via portal proxy:
```bash
curl -s -X POST "http://localhost:3000/api/agent" \
  -H "Content-Type: application/json" \
  -d '{"message":"Top 5 products","context":{}}' | jq
```

6) Verify

- Check n8n execution logs for the workflow run and node outputs.
- Ensure the `Respond to Portal` node returned an item containing `reply` so the portal can show the message.

7) Troubleshooting

- If portal shows no reply: in n8n set the Webhook node `Response Mode` to `Response Node` and wire the node that contains `reply` to the `Respond to Portal` node.
- If broadcasts do not go out: confirm `AGENT_FORWARD_BASE_URL` and `AGENT_FORWARD_BEARER` are set and reachable.

---

If you want, I can: (A) generate a pre-filled `.env.example` for the portal with placeholders, (B) patch the portal to expose a small `/health` and `/debug` page showing `N8N_WEBHOOK_URL` and last reply, or (C) attempt to import the workflow into a reachable n8n if you provide connection details.
