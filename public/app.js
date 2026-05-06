// --- Utility Functions ---

function parseMarkdown(text) {
  // Enhanced professional markdown parser
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.*?)__/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// --- Data Fetching ---

async function loadConfig() {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Portal configuration load failed.');
  return response.json();
}

async function loadToken() {
  const response = await fetch('/api/metabase-token');
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Token generation failed.');
  return payload;
}

// --- UI Rendering ---

function addMessage(log, text, role = 'bot', opts = {}) {
  const node = document.createElement('div');
  node.className = `message message-${role}`;

  // Meta info (Role + Time)
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = `${role.toUpperCase()} • ${getTimestamp()}`;
  node.appendChild(meta);

  // Bot-specific analysis header
  if (role === 'bot' && opts.followUp && opts.dashboard) {
    const analysis = document.createElement('div');
    analysis.style.fontSize = '11px';
    analysis.style.color = 'var(--text-subtle)';
    analysis.style.marginBottom = '4px';
    analysis.textContent = `Analyzing source: ${opts.dashboard}`;
    node.appendChild(analysis);
  }

  // Content
  const contentNode = document.createElement('div');
  contentNode.className = 'message-text';
  contentNode.innerHTML = role === 'bot' ? parseMarkdown(text) : text;
  node.appendChild(contentNode);

  // Context Footer
  if (role === 'bot' && opts.dashboard && !opts.followUp) {
    const ctx = document.createElement('div');
    ctx.className = 'reply-context';
    ctx.textContent = `Context: ${opts.dashboard}`;
    node.appendChild(ctx);
  }

  log.appendChild(node);
  node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setTyping(visible) {
  const container = document.getElementById('typing-container');
  if (container) container.style.display = visible ? 'block' : 'none';
  if (visible) {
    const log = document.getElementById('chat-log');
    log.scrollTop = log.scrollHeight;
  }
}

// --- Initialization ---

async function initDashboard() {
  const fallback = document.getElementById('dashboard-fallback');
  const status = document.getElementById('connection-status');
  const host = document.getElementById('metabase-dashboard-host');

  try {
    const config = await loadConfig();
    window.portalConfig = config || {};

    window.metabaseConfig = {
      theme: { preset: config.theme || 'light' },
      isGuest: config.isGuest,
      instanceUrl: config.metabaseInstanceUrl,
    };

    if (!config.hasMetabaseSecretKey) throw new Error('Secret key configuration missing.');

    const { token } = await loadToken();

    const dashboard = document.createElement('metabase-dashboard');
    dashboard.id = 'metabase-dashboard';
    dashboard.setAttribute('with-title', 'true');
    dashboard.setAttribute('with-downloads', 'true');
    dashboard.setAttribute('token', token);
    
    host.replaceChildren(dashboard);
    fallback.style.display = 'none';
    status.innerHTML = `<span class="status-dot"></span> Online (ID: ${config.dashboardId})`;
  } catch (error) {
    status.innerHTML = `<span class="status-dot" style="background: #ef4444;"></span> Configuration Error`;
    fallback.textContent = `CRITICAL ERROR: ${error.message}`;
    fallback.style.color = '#ef4444';
  }
}

async function initAgentSidebar() {
  const form = document.getElementById('agent-form');
  const input = document.getElementById('agent-input');
  const log = document.getElementById('chat-log');
  const quickButtons = document.querySelectorAll('[data-prompt]');

  // Quick Action Buttons
  quickButtons.forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.prompt || '';
      input.focus();
    });
  });

  // Form Submission
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const message = input.value.trim();
    if (!message) return;

    addMessage(log, message, 'user');
    input.value = '';
    
    setTyping(true);

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          context: {
            source: 'enterprise-portal-v3',
            previousIntent: window.lastIntent || null,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Agent request failed.');

      if (payload.intent) window.lastIntent = payload.intent;
      
      setTyping(false);
      addMessage(log, payload.reply || 'Request processed.', 'bot', { 
        intent: payload.intent, 
        dashboard: payload.dashboard
      });
    } catch (error) {
      setTyping(false);
      addMessage(log, `**ERROR:** ${error.message}`, 'bot');
    }
  });

  // Handle Enter for submission (Shift+Enter for newline)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    await initDashboard();
    initAgentSidebar();
  })();
});
