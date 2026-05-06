import LogtoClient from 'https://esm.sh/@logto/browser@2.2.0';

console.log('🚀 Portal Initializing...');

const logtoConfig = {
  endpoint: 'https://p7a5w0.logto.app', 
  appId: 'rob9ql3srvz75f409v4mj',
  resources: ['https://api.cm-portal.io'],
};

let logto;
let dashboardInitialized = false;

async function initAuth() {
  const signInBtn = document.getElementById('sign-in');
  const userInfo = document.getElementById('user-info');
  const systemMeta = document.getElementById('system-meta');
  const userName = document.getElementById('user-name');
  const workspace = document.querySelector('.workspace');

  try {
    const config = await loadConfig().catch(() => ({}));
    window.portalConfig = config || {};

    logto = new LogtoClient({
      endpoint: config.LOGTO_ENDPOINT || logtoConfig.endpoint,
      appId: config.LOGTO_APP_ID || logtoConfig.appId,
      resources: logtoConfig.resources,
    });
    window.logtoInstance = logto;

    // 1. Check if we are in the middle of a callback
    if (window.location.pathname === '/callback') {
      console.log('🔄 Callback detected. Processing authentication...');
      await logto.handleSignInCallback(window.location.href);
      console.log('✅ Callback handled. Redirecting to home...');
      window.location.assign('/'); // Force a hard reload to home to clear state
      return; 
    }

    // 2. Normal Auth Check
    const authenticated = await logto.isAuthenticated();
    console.log('🔐 Authenticated:', authenticated);

    if (authenticated) {
      if (signInBtn) signInBtn.style.display = 'none';
      if (userInfo) userInfo.style.display = 'flex';
      if (systemMeta) systemMeta.style.display = 'flex';
      if (workspace) {
        workspace.style.opacity = '1';
        workspace.style.pointerEvents = 'auto';
      }

      const claims = await logto.getIdTokenClaims();
      if (userName) userName.textContent = claims.name || claims.username || 'User';

      const overlay = document.getElementById('auth-overlay');
      if (overlay) overlay.remove();

      if (!dashboardInitialized) {
        dashboardInitialized = true;
        await initDashboard();
        initAgentSidebar();
      }
    } else {
      console.log('🚫 Not authenticated. Showing Mission Control...');
      showAuthOverlay();
    }
  } catch (error) {
    console.error('❌ Auth Error:', error);
    // Don't show overlay if we are still on the callback page to avoid flickering
    if (window.location.pathname !== '/callback') {
      showAuthOverlay();
    }
  }
}

function showAuthOverlay() {
  if (document.getElementById('auth-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.innerHTML = `
    <div style="background: var(--bg-card, #141414); padding: 48px; border-radius: 12px; border: 1px solid var(--border, #262626); text-align: center; max-width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
      <div style="width: 48px; height: 48px; background: #6366f1; border-radius: 12px; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px; color: white;">CM</div>
      <h3 style="margin-bottom: 8px; color: white;">Mission Control</h3>
      <p style="color: #a3a3a3; margin-bottom: 32px; font-size: 14px; line-height: 1.5;">Access to the C-M Analytics Portal is restricted to authorized personnel. Please sign in to continue.</p>
      <button id="overlay-sign-in" class="auth-btn" style="width: 100%; padding: 12px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Sign In</button>
    </div>
  `;
  overlay.style = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; z-index: 1000; background: rgba(10,10,10,0.85); backdrop-filter: blur(12px);';
  document.body.appendChild(overlay);

  document.getElementById('overlay-sign-in').onclick = () => {
    logto.signIn(`${window.location.origin}/callback`);
  };
}

// --- Utility Functions ---

function parseMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
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
  const accessToken = await logto.getAccessToken('https://api.cm-portal.io');
  const response = await fetch('/api/metabase-token', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Token generation failed.');
  return payload;
}

// --- UI Rendering ---

function addMessage(log, text, role = 'bot', opts = {}) {
  const node = document.createElement('div');
  node.className = `message message-${role}`;

  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = `${role.toUpperCase()} • ${getTimestamp()}`;
  node.appendChild(meta);

  const contentNode = document.createElement('div');
  contentNode.className = 'message-text';
  contentNode.innerHTML = role === 'bot' ? parseMarkdown(text) : text;
  node.appendChild(contentNode);

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
}

// --- Initialization ---

async function initDashboard() {
  const fallback = document.getElementById('dashboard-fallback');
  const status = document.getElementById('connection-status');
  const host = document.getElementById('metabase-dashboard-host');

  try {
    const { token } = await loadToken();
    const dashboard = document.createElement('metabase-dashboard');
    dashboard.setAttribute('with-title', 'true');
    dashboard.setAttribute('with-downloads', 'true');
    dashboard.setAttribute('token', token);
    
    host.replaceChildren(dashboard);
    if (fallback) fallback.style.display = 'none';
    if (status) status.innerHTML = `<span class="status-dot"></span> Online`;
  } catch (error) {
    if (status) status.innerHTML = `<span class="status-dot" style="background: #ef4444;"></span> Metabase Error`;
  }
}

async function initAgentSidebar() {
  const form = document.getElementById('agent-form');
  const input = document.getElementById('agent-input');
  const log = document.getElementById('chat-log');
  const quickButtons = document.querySelectorAll('[data-prompt]');

  quickButtons.forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.prompt || '';
      input.focus();
    });
  });

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message) return;

      addMessage(log, message, 'user');
      input.value = '';
      setTyping(true);

      try {
        const accessToken = await logto.getAccessToken('https://api.cm-portal.io');
        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ message, context: { source: 'enterprise-portal-v3' } }),
        });

        const payload = await response.json();
        setTyping(false);
        addMessage(log, payload.reply || 'Request processed.', 'bot', { dashboard: payload.dashboard });
      } catch (error) {
        setTyping(false);
        addMessage(log, `**ERROR:** ${error.message}`, 'bot');
      }
    });
  }
}

// Global Auth Handlers
const signInAction = () => logto.signIn(`${window.location.origin}/callback`);
const signOutAction = () => logto.signOut(`${window.location.origin}`);

if (document.getElementById('sign-in')) document.getElementById('sign-in').onclick = signInAction;
if (document.getElementById('sign-out')) document.getElementById('sign-out').onclick = signOutAction;

// Entry Point
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuth);
} else {
  initAuth();
}
