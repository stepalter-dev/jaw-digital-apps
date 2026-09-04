/*
 * JawSync — auto-syncs each field journal's progress to a private GitHub Gist,
 * so it survives cleared browser storage, reinstalls, and new devices.
 *
 * How it works:
 *  - Each app keeps saving to localStorage as before (fast, works offline).
 *  - On every save, JawSync also queues a debounced push of that same JSON
 *    payload to a file in one shared private Gist (one file per game, keyed
 *    by that game's storageKey()).
 *  - On load, JawSync.pull() fetches the Gist's copy of that file so the app
 *    can compare its updatedAt timestamp against the local copy and adopt
 *    whichever is newer (see the loadProgress()/syncPullAndReconcile()
 *    wiring in each game's index.html).
 *
 * Requires a GitHub personal access token with the "gist" scope. Nothing
 * syncs until one is entered via the widget's gear icon (top-right corner
 * of every page). The token and gist id are stored in localStorage under
 * "jaw-sync-config" — losing *that* only means re-pasting the token or gist
 * URL; it does not touch the progress data sitting in the Gist itself.
 */
(function () {
  const API_BASE = 'https://api.github.com';
  const CONFIG_KEY = 'jaw-sync-config'; // { token, gistId }
  const PUSH_DEBOUNCE_MS = 2500;

  function getConfig() {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function setConfig(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }

  function ghHeaders(token) {
    return { 'Authorization': 'token ' + token, 'Accept': 'application/vnd.github+json' };
  }

  let pending = {};      // fileKey -> content string, awaiting push
  let pushTimer = null;

  async function ensureGist() {
    const cfg = getConfig();
    if (!cfg.token) throw new Error('no token configured');
    if (cfg.gistId) return cfg.gistId;
    const res = await fetch(API_BASE + '/gists', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders(cfg.token)),
      body: JSON.stringify({
        description: 'JAW Digital — game journal progress (auto-synced, do not edit by hand)',
        public: false,
        files: { 'README.md': { content: 'Progress data for JAW Digital field journals (Skyrim, RDR2, Oblivion). Managed automatically by sync.js.' } },
      }),
    });
    if (!res.ok) throw new Error('gist create failed: ' + res.status);
    const gist = await res.json();
    cfg.gistId = gist.id;
    setConfig(cfg);
    return gist.id;
  }

  async function pull(fileKey) {
    const cfg = getConfig();
    if (!cfg.token || !cfg.gistId) return null;
    const res = await fetch(API_BASE + '/gists/' + cfg.gistId, { headers: ghHeaders(cfg.token) });
    if (!res.ok) throw new Error('gist read failed: ' + res.status);
    const gist = await res.json();
    const file = gist.files[fileKey + '.json'];
    return file ? file.content : null;
  }

  function save(fileKey, content) {
    pending[fileKey] = content;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flush, PUSH_DEBOUNCE_MS);
    setStatus('pending');
  }

  async function flush() {
    const cfg = getConfig();
    if (!cfg.token) { setStatus('unconfigured'); return; }
    const files = pending;
    pending = {};
    setStatus('syncing');
    try {
      const gistId = await ensureGist();
      const payload = {};
      Object.keys(files).forEach(k => { payload[k + '.json'] = { content: files[k] }; });
      const res = await fetch(API_BASE + '/gists/' + gistId, {
        method: 'PATCH',
        headers: Object.assign({ 'Content-Type': 'application/json' }, ghHeaders(cfg.token)),
        body: JSON.stringify({ files: payload }),
      });
      if (!res.ok) throw new Error('gist push failed: ' + res.status);
      setStatus('synced');
    } catch (e) {
      console.error('JawSync push failed', e);
      Object.assign(pending, files); // retry on next save
      setStatus('error');
    }
  }

  // --- tiny status widget, top-right, tucked under the account pill ---
  let statusEl, dotEl, wrapEl;

  // The account widget (account.js, .jaw-acc-widget) also sits at top:14px
  // right:14px, and is only built once supabase-js has loaded — so it can
  // appear after this one. Measure it when it turns up rather than assuming a
  // fixed offset, and fall back to the corner on pages without account.js.
  function placeWidget() {
    if (!wrapEl) return;
    const acc = document.querySelector('.jaw-acc-widget');
    const top = acc ? Math.round(acc.getBoundingClientRect().bottom + 10) : 14;
    wrapEl.style.top = top + 'px';
  }

  function watchForAccountWidget() {
    if (document.querySelector('.jaw-acc-widget')) { placeWidget(); return; }
    if (typeof MutationObserver !== 'function') return;
    const obs = new MutationObserver(function () {
      if (document.querySelector('.jaw-acc-widget')) {
        placeWidget();
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Don't observe forever on pages that never load account.js.
    setTimeout(function () { obs.disconnect(); }, 15000);
  }

  function buildWidget() {
    const wrap = document.createElement('div');
    wrapEl = wrap;
    wrap.style.cssText = 'position:fixed;top:14px;right:14px;z-index:99998;font-family:system-ui,sans-serif;font-size:12px;display:flex;align-items:center;gap:6px;background:#1c1812;color:#e8e0d0;border:1px solid #3a3226;border-radius:20px;padding:6px 10px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);';
    dotEl = document.createElement('span');
    dotEl.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#786b4e;flex:none;';
    statusEl = document.createElement('span');
    statusEl.textContent = 'Sync';
    wrap.appendChild(dotEl);
    wrap.appendChild(statusEl);
    wrap.addEventListener('click', onWidgetClick);
    document.body.appendChild(wrap);
    placeWidget();
    watchForAccountWidget();
    window.addEventListener('resize', placeWidget);
    render();
  }

  // Two sync paths exist: this file's GitHub Gist backup (needs a personal
  // access token) and account.js's Supabase account sync (needs a sign-in).
  // The pill used to report only the Gist one, so a signed-in user whose
  // progress *was* syncing still saw a permanent "Sync: off". Whichever path
  // is actually live now wins, and the account path takes precedence.
  let gistState = 'unconfigured';
  let accountState = null;

  const GIST_LABELS = {
    unconfigured: ['#786b4e', 'Sync: off'],
    pending: ['#c9a227', 'Sync: pending…'],
    syncing: ['#c9a227', 'Syncing…'],
    synced: ['#4caf50', 'Synced'],
    error: ['#e5484d', 'Sync error'],
  };

  const ACCOUNT_LABELS = {
    'signed-in': ['#4caf50', 'Sync on'],
    saving: ['#c9a227', 'Saving…'],
    saved: ['#4caf50', 'Synced'],
    error: ['#e5484d', 'Sync error'],
    // Signed in, but this journal isn't unlocked on the account — the case
    // that previously failed silently.
    locked: ['#c9a227', 'Sync: not unlocked'],
  };

  function accountSignedIn() {
    return !!(window.JawAccount && window.JawAccount.isSignedIn && window.JawAccount.isSignedIn());
  }

  function render() {
    if (!dotEl) return;
    let pair;
    if (accountSignedIn() && accountState && accountState !== 'signed-out') {
      pair = ACCOUNT_LABELS[accountState] || ACCOUNT_LABELS['signed-in'];
    } else {
      pair = GIST_LABELS[gistState] || GIST_LABELS.unconfigured;
    }
    dotEl.style.background = pair[0];
    statusEl.textContent = pair[1];
  }

  function setStatus(state) {
    gistState = state;
    render();
  }

  window.addEventListener('jaw:account-sync', function (ev) {
    accountState = (ev && ev.detail && ev.detail.state) || null;
    render();
  });

  // Clicking should open whichever thing the pill is describing.
  function onWidgetClick() {
    if (accountSignedIn() && window.JawAccount.openPanel) {
      window.JawAccount.openPanel();
      return;
    }
    openSettings();
  }

  function openSettings() {
    const cfg = getConfig();
    const existing = document.getElementById('jaw-sync-modal');
    if (existing) { existing.remove(); return; }
    const modal = document.createElement('div');
    modal.id = 'jaw-sync-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;';
    modal.innerHTML = `
      <div style="background:#1c1812;color:#e8e0d0;border:1px solid #3a3226;border-radius:8px;padding:20px;max-width:420px;width:90%;">
        <h3 style="margin:0 0 8px;font-size:15px;">Progress sync</h3>
        <p style="font-size:12px;color:#a89b7f;margin:0 0 12px;line-height:1.5;">
          Paste a GitHub personal access token with <code>gist</code> scope
          (create one at github.com/settings/tokens) to back up progress on
          every game journal to a private Gist. Once set, this survives
          cleared browser storage.
        </p>
        <input id="jaw-sync-token" type="password" placeholder="GitHub token (gist scope)" value="${cfg.token ? cfg.token : ''}"
          style="width:100%;box-sizing:border-box;padding:8px;margin-bottom:8px;background:#151515;border:1px solid #3a3226;color:#e8e0d0;border-radius:4px;font-size:12px;" />
        <input id="jaw-sync-gist" type="text" placeholder="Gist id (leave blank to create one)" value="${cfg.gistId || ''}"
          style="width:100%;box-sizing:border-box;padding:8px;margin-bottom:12px;background:#151515;border:1px solid #3a3226;color:#e8e0d0;border-radius:4px;font-size:12px;" />
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="jaw-sync-cancel" style="padding:6px 12px;background:transparent;border:1px solid #3a3226;color:#e8e0d0;border-radius:4px;cursor:pointer;font-size:12px;">Close</button>
          <button id="jaw-sync-save" style="padding:6px 12px;background:#c9a227;border:none;color:#151515;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">Save</button>
        </div>
        ${cfg.gistId ? `<p style="font-size:11px;color:#786b4e;margin-top:10px;">Gist: <a href="https://gist.github.com/${cfg.gistId}" target="_blank" style="color:#a89b7f;">gist.github.com/${cfg.gistId}</a></p>` : ''}
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById('jaw-sync-cancel').addEventListener('click', () => modal.remove());
    document.getElementById('jaw-sync-save').addEventListener('click', () => {
      const token = document.getElementById('jaw-sync-token').value.trim();
      const gistId = document.getElementById('jaw-sync-gist').value.trim();
      setConfig({ token, gistId: gistId || undefined });
      setStatus(token ? 'synced' : 'unconfigured');
      modal.remove();
      if (typeof window.__jawSyncOnConfigured === 'function') window.__jawSyncOnConfigured();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildWidget();
    setStatus(getConfig().token ? 'synced' : 'unconfigured');
  });

  window.JawSync = { save, pull, openSettings };
})();
