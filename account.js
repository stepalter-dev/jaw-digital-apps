/*
 * JawAccount — real user accounts backing progress sync, built for the paid
 * version of a journal (starting with Skyrim). Unlike sync.js (which needs a
 * GitHub personal access token — fine for one person, not for customers),
 * this uses Supabase email magic-link sign-in: a buyer just enters their
 * email and clicks a link. Progress is stored server-side in a `progress`
 * table locked down by Row Level Security, so each account only ever sees
 * its own row no matter how many people use the app.
 *
 * Public values below (project URL + publishable key) are safe to ship in
 * client code — they only grant what Row Level Security policies allow.
 */
(function () {
  const SUPABASE_URL = 'https://klqjspicelhvtyjhfhjf.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_XnnFZ1Scd506-xJoTeutOw_SumXx9om';

  let client = null;
  let session = null;

  function loadSupabaseJs() {
    return new Promise((resolve, reject) => {
      if (window.supabase && window.supabase.createClient) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load supabase-js'));
      document.head.appendChild(s);
    });
  }

  async function init() {
    await loadSupabaseJs();
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const { data } = await client.auth.getSession();
    session = data.session;
    client.auth.onAuthStateChange((_event, s) => {
      session = s;
      setStatus(session ? 'signed-in' : 'signed-out');
      if (session && typeof window.__jawAccountOnSignedIn === 'function') window.__jawAccountOnSignedIn();
    });
    buildWidget();
    setStatus(session ? 'signed-in' : 'signed-out');
  }

  async function signIn(email) {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    if (error) throw error;
  }

  async function signOut() {
    await client.auth.signOut();
  }

  // Pulls this game's progress row for the signed-in user, or null if signed out / no row yet.
  async function load(game) {
    if (!client || !session) return null;
    const { data, error } = await client
      .from('progress')
      .select('payload, updated_at')
      .eq('game', game)
      .maybeSingle();
    if (error) { console.error('JawAccount load failed', error); return null; }
    if (!data) return null;
    return Object.assign({}, data.payload, { updatedAt: new Date(data.updated_at).getTime() });
  }

  // Upserts this game's progress row for the signed-in user. Payload should be a plain object
  // (not yet JSON-stringified) — updated_at is set server-side via now().
  async function save(game, payloadObj) {
    if (!client || !session) return;
    const { error } = await client
      .from('progress')
      .upsert({ user_id: session.user.id, game, payload: payloadObj, updated_at: new Date().toISOString() }, { onConflict: 'user_id,game' });
    if (error) console.error('JawAccount save failed', error);
  }

  function isSignedIn() { return !!session; }

  // --- tiny status/sign-in widget, top-right on every page that includes this script ---
  let statusEl, dotEl;
  function buildWidget() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;top:14px;right:14px;z-index:99999;font-family:system-ui,sans-serif;font-size:12px;display:flex;align-items:center;gap:6px;background:#1c1812;color:#e8e0d0;border:1px solid #3a3226;border-radius:20px;padding:6px 10px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4);';
    dotEl = document.createElement('span');
    dotEl.style.cssText = 'width:8px;height:8px;border-radius:50%;background:#786b4e;flex:none;';
    statusEl = document.createElement('span');
    statusEl.textContent = 'Account';
    wrap.appendChild(dotEl);
    wrap.appendChild(statusEl);
    wrap.addEventListener('click', openPanel);
    document.body.appendChild(wrap);
  }
  function setStatus(state) {
    if (!dotEl) return;
    const map = {
      'signed-out': ['#786b4e', 'Sign in'],
      'signed-in': ['#4caf50', session && session.user ? session.user.email : 'Signed in'],
    };
    const [color, label] = map[state] || map['signed-out'];
    dotEl.style.background = color;
    statusEl.textContent = label;
  }

  function openPanel() {
    const existing = document.getElementById('jaw-account-modal');
    if (existing) { existing.remove(); return; }
    const modal = document.createElement('div');
    modal.id = 'jaw-account-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;';
    if (session) {
      modal.innerHTML = `
        <div style="background:#1c1812;color:#e8e0d0;border:1px solid #3a3226;border-radius:8px;padding:20px;max-width:360px;width:90%;">
          <h3 style="margin:0 0 8px;font-size:15px;">Signed in</h3>
          <p style="font-size:12px;color:#a89b7f;margin:0 0 16px;">${session.user.email}</p>
          <div style="display:flex;gap:8px;justify-content:flex-end;">
            <button id="jaw-account-close" style="padding:6px 12px;background:transparent;border:1px solid #3a3226;color:#e8e0d0;border-radius:4px;cursor:pointer;font-size:12px;">Close</button>
            <button id="jaw-account-signout" style="padding:6px 12px;background:#e5484d;border:none;color:#151515;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">Sign out</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      document.getElementById('jaw-account-close').addEventListener('click', () => modal.remove());
      document.getElementById('jaw-account-signout').addEventListener('click', async () => { await signOut(); modal.remove(); });
      return;
    }
    modal.innerHTML = `
      <div style="background:#1c1812;color:#e8e0d0;border:1px solid #3a3226;border-radius:8px;padding:20px;max-width:360px;width:90%;">
        <h3 style="margin:0 0 8px;font-size:15px;">Sign in</h3>
        <p style="font-size:12px;color:#a89b7f;margin:0 0 12px;line-height:1.5;">
          Enter your email and we'll send a sign-in link. No password needed —
          your progress follows your account across any device.
        </p>
        <input id="jaw-account-email" type="email" placeholder="you@example.com"
          style="width:100%;box-sizing:border-box;padding:8px;margin-bottom:12px;background:#151515;border:1px solid #3a3226;color:#e8e0d0;border-radius:4px;font-size:12px;" />
        <div id="jaw-account-msg" style="font-size:11px;color:#a89b7f;margin-bottom:8px;min-height:14px;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="jaw-account-close" style="padding:6px 12px;background:transparent;border:1px solid #3a3226;color:#e8e0d0;border-radius:4px;cursor:pointer;font-size:12px;">Close</button>
          <button id="jaw-account-send" style="padding:6px 12px;background:#c9a227;border:none;color:#151515;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">Send link</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById('jaw-account-close').addEventListener('click', () => modal.remove());
    document.getElementById('jaw-account-send').addEventListener('click', async () => {
      const email = document.getElementById('jaw-account-email').value.trim();
      const msg = document.getElementById('jaw-account-msg');
      if (!email) { msg.textContent = 'Enter an email first.'; return; }
      msg.textContent = 'Sending…';
      try {
        await signIn(email);
        msg.textContent = 'Check your email for the sign-in link.';
      } catch (e) {
        console.error('Sign-in failed', e);
        msg.textContent = 'Could not send link — try again.';
      }
    });
  }

  window.JawAccount = { init, load, save, isSignedIn };
  document.addEventListener('DOMContentLoaded', init);
})();
