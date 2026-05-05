async function loadConfig() {
  const response = await fetch('/api/config');
  if (!response.ok) {
    throw new Error('Unable to load portal config.');
  }
  return response.json();
}

async function loadToken() {
  const response = await fetch('/api/metabase-token');
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Unable to generate Metabase token.');
  }
  return response.json();
}

function addMessage(log, text, role = 'bot', opts = {}) {
  // opts: { intent, dashboard, followUp }
  const node = document.createElement('div');
  node.className = `message message-${role}`;

  // If this is a bot reply that immediately follows a user message,
  // mark it so CSS can render it inline/connected to the user bubble.
  if (role === 'bot') {
    const last = log.lastElementChild;
    if (last && last.classList && last.classList.contains('message-user')) {
      node.classList.add('inline-reply');
    }

    // Find previous bot message
    const prevBot = Array.from(log.children).reverse().find(el => el.classList && el.classList.contains('message-bot'));

    // If previous bot text exactly equals this incoming text, replace it (update in-place)
    if (prevBot && prevBot.textContent === text) {
      // update context label if present
      if (opts && opts.dashboard) {
        let ctx = prevBot.querySelector('.reply-context');
        if (!ctx) {
          ctx = document.createElement('div');
          ctx.className = 'reply-context';
          prevBot.prepend(ctx);
        }
        ctx.textContent = `Context: ${opts.dashboard}`;
      }
      log.scrollTop = log.scrollHeight;
      return;
    }

    // If previous bot exists but different, we will append a new message.
    // For follow-ups, show a small confirmation microcopy (dashboard) above the reply.
    if (opts && opts.followUp && opts.dashboard) {
      const meta = document.createElement('div');
      meta.className = 'message-meta';
      meta.textContent = `Showing ${opts.dashboard} —`;
      node.appendChild(meta);
    }
  }

  // Append the visible reply text
  const textNode = document.createElement('div');
  textNode.className = 'message-text';
  textNode.textContent = text;
  node.appendChild(textNode);

  // If follow-up include compact context label below or above as needed
  if (role === 'bot' && opts && opts.dashboard && !opts.followUp) {
    const ctx = document.createElement('div');
    ctx.className = 'reply-context';
    ctx.textContent = `Context: ${opts.dashboard}`;
    node.appendChild(ctx);
  }

  log.appendChild(node);
  log.scrollTop = log.scrollHeight;
}

async function initDashboard() {
  const fallback = document.getElementById('dashboard-fallback');
  const status = document.getElementById('connection-status');
  const host = document.getElementById('metabase-dashboard-host');

  try {
    const config = await loadConfig();

    // expose a small portal config for other modules (e.g. sidebar)
    window.portalConfig = config || {};

    window.metabaseConfig = {
      theme: { preset: config.theme || 'light' },
      isGuest: config.isGuest,
      instanceUrl: config.metabaseInstanceUrl,
    };

    if (!config.hasMetabaseSecretKey) {
      throw new Error('METABASE_SECRET_KEY is not configured.');
    }

    const { token } = await loadToken();

    const dashboard = document.createElement('metabase-dashboard');
    dashboard.id = 'metabase-dashboard';
    dashboard.setAttribute('with-title', 'true');
    dashboard.setAttribute('with-downloads', 'true');
    dashboard.setAttribute('token', token);
    host.replaceChildren(dashboard);
    fallback.classList.add('is-hidden');
    status.textContent = `Connected to dashboard ${config.dashboardId}`;
  } catch (error) {
    status.textContent = 'Dashboard unavailable';
    fallback.textContent = error.message;
  }
}

async function initAgentSidebar() {
  const form = document.getElementById('agent-form');
  const input = document.getElementById('agent-input');
  const log = document.getElementById('chat-log');
  const quickButtons = document.querySelectorAll('[data-prompt]');

  // If portal is forwarding to n8n, hide the generic placeholder message
  if (window.portalConfig && window.portalConfig.n8nWebhookUrl) {
    const placeholder = log.querySelector('.message-bot');
    if (placeholder && placeholder.textContent && placeholder.textContent.includes('Ask a question')) {
      placeholder.style.display = 'none';
    }
  }

  quickButtons.forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.prompt || '';
      input.focus();
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const message = input.value.trim();
    if (!message) {
      return;
    }

    addMessage(log, message, 'user');
    input.value = '';

    try {
      // Determine if this looks like a short follow-up (e.g. 'show me', 'yes')
      const short = message.split(/\s+/).length <= 3 || /^(show|show me|yes|ok|sure|do it)$/i.test(message);
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          context: {
            source: 'portal-sidebar',
            page: 'dashboard',
            previousIntent: window.lastIntent || null,
            followUp: short,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Agent request failed.');
      }

      // store last intent for follow-ups
      if (payload && payload.intent) window.lastIntent = payload.intent;
      // store last intent for follow-ups
      if (payload && payload.intent) window.lastIntent = payload.intent;
      // pass dashboard and followUp flag for UI context microcopy
      addMessage(log, payload.reply || 'Agent request completed.', 'bot', { intent: payload.intent, dashboard: payload.dashboard, followUp: short });
    } catch (error) {
      addMessage(log, `Error: ${error.message}`, 'bot');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // ensure dashboard config loads first so the sidebar can adapt UI
  (async () => {
    await initDashboard();
    initAgentSidebar();
  })();
});
