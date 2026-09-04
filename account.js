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
  let entitlements = new Set(); // games the signed-in user has cloud sync access to

  // Games where cloud sync is the paid feature (free codes / purchase required).
  // Anything not listed here stays free for everyone, signed in or not — add a
  // game once its monetization is actually live.
  const GATED_GAMES = new Set(['oblivion', 'skyrim', 'fallout4', 'newvegas']);
  function requiresEntitlement(game) { return GATED_GAMES.has(game); }

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
    // persistSession/autoRefreshToken are already supabase-js's defaults (backed by
    // localStorage), spelled out here so it's obvious the "stay signed in" behavior
    // is intentional, not incidental. If sign-in still doesn't survive a restart, the
    // usual cause is a browser setting like "clear cookies/site data on close" —
    // that wipes localStorage too and no client-side code can override it.
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage },
    });
    const { data } = await client.auth.getSession();
    session = data.session;
    if (session) await refreshEntitlements();
    client.auth.onAuthStateChange(async (_event, s) => {
      session = s;
      entitlements = new Set();
      if (session) await refreshEntitlements();
      setStatus(session ? 'signed-in' : 'signed-out');
      emitSync(session ? 'signed-in' : 'signed-out');
      if (session && typeof window.__jawAccountOnSignedIn === 'function') window.__jawAccountOnSignedIn();
    });
    buildWidget();
    setStatus(session ? 'signed-in' : 'signed-out');
    emitSync(session ? 'signed-in' : 'signed-out');
  }

  // Pulls every game this account has cloud-sync access to, so hasEntitlement()
  // is a cheap local check rather than a network round-trip per call.
  async function refreshEntitlements() {
    if (!client || !session) return;
    const { data, error } = await client.from('entitlements').select('game');
    if (error) { console.error('JawAccount entitlements load failed', error); return; }
    entitlements = new Set((data || []).map(r => r.game));
  }

  function hasEntitlement(game) {
    return entitlements.has(game);
  }

  // Redeems a free-access code for `game`. Returns true on success; throws
  // with a user-facing message otherwise.
  async function redeem(code, game) {
    if (!client || !session) throw new Error('Sign in first.');
    const { data, error } = await client.rpc('redeem_code', { p_code: code, p_game: game });
    if (error) throw error;
    const messages = {
      ok: null,
      invalid_code: 'That code isn’t valid.',
      inactive_code: 'That code has been deactivated.',
      wrong_game: 'That code is for a different journal.',
      exhausted_code: 'That code has already been used up.',
      not_signed_in: 'Sign in first.',
    };
    if (data !== 'ok') throw new Error(messages[data] || 'Could not redeem that code.');
    await refreshEntitlements();
    return true;
  }

  async function signIn(email) {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    if (error) throw error;
  }

  // Verifies the 6-digit code from that email and completes sign-in.
  async function verifyCode(email, code) {
    const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw error;
  }

  async function signOut() {
    await client.auth.signOut();
  }

  function displayName() {
    return (session && session.user && session.user.user_metadata && session.user.user_metadata.display_name) || null;
  }

  // Some journals follow one fixed, non-customizable protagonist (Geralt in Witcher 3;
  // Arthur/John in RDR2), so a free-text "character name" doesn't make sense there. A page
  // can set window.JAW_CHARACTER_NAME_OVERRIDE to a string, or to a function returning one
  // (for a name that can change at runtime, e.g. an Arthur/John toggle) — when present, it
  // replaces the editable display name everywhere it would otherwise show, and the name
  // field in the account panel becomes a read-only note instead of an input.
  function overrideName() {
    const o = window.JAW_CHARACTER_NAME_OVERRIDE;
    try { return (typeof o === 'function' ? o() : o) || null; } catch (e) { return null; }
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Renames the signed-in account (shown in the widget instead of the email once set).
  // Stored directly on the Supabase auth user — no separate table needed.
  async function setDisplayName(name) {
    const { data, error } = await client.auth.updateUser({ data: { display_name: name } });
    if (error) throw error;
    if (data && data.user) session = Object.assign({}, session, { user: data.user });
  }

  // Pulls this game's progress row for the signed-in user, or null if signed out / no row yet.
  async function load(game) {
    if (!client || !session) return null;
    if (requiresEntitlement(game) && !hasEntitlement(game)) return null;
    const { data, error } = await client
      .from('progress')
      .select('payload, updated_at')
      .eq('game', game)
      .maybeSingle();
    if (error) { console.error('JawAccount load failed', error); return null; }
    if (!data) return null;
    return Object.assign({}, data.payload, { updatedAt: new Date(data.updated_at).getTime() });
  }

  // Announces what account sync is actually doing, so the status pill in
  // sync.js can report the truth instead of only ever describing the older
  // Gist path. Nothing depends on anyone listening.
  function emitSync(state, extra) {
    try {
      window.dispatchEvent(new CustomEvent('jaw:account-sync', {
        detail: Object.assign({ state: state }, extra || {})
      }));
    } catch (e) { /* very old browser — status just stays neutral */ }
  }

  // Upserts this game's progress row for the signed-in user. Payload should be a plain object
  // (not yet JSON-stringified) — updated_at is set server-side via now().
  async function save(game, payloadObj) {
    if (!client || !session) return;
    // Silently doing nothing here is what made sync look broken: signed in,
    // but the journal isn't unlocked on this account, so nothing ever
    // uploaded and the pill just sat at "off". Say so instead.
    if (requiresEntitlement(game) && !hasEntitlement(game)) { emitSync('locked', { game: game }); return; }
    emitSync('saving', { game: game });
    const { error } = await client
      .from('progress')
      .upsert({ user_id: session.user.id, game, payload: payloadObj, updated_at: new Date().toISOString() }, { onConflict: 'user_id,game' });
    if (error) {
      console.error('JawAccount save failed', error);
      emitSync('error', { game: game });
      return;
    }
    emitSync('saved', { game: game, at: Date.now() });
  }

  function isSignedIn() { return !!session; }

  // True when this game will actually sync for the current user: signed in,
  // and entitled if the game is gated.
  function syncsFor(game) {
    if (!session) return false;
    return !requiresEntitlement(game) || hasEntitlement(game);
  }

  // Sets a status line's text and colors it — 'ok' green, 'err' red, omitted = neutral dim.
  function setMsg(el, text, kind) {
    el.textContent = text;
    el.classList.remove('ok', 'err');
    if (kind) el.classList.add(kind);
  }

  // --- shared styling for the widget + modal, injected once ---
  // Kept as one <style> block (classes) instead of giant inline style strings on every
  // element — easier to read/adjust, and lets hover/focus states work without JS.
  function injectStyles() {
    if (document.getElementById('jaw-account-styles')) return;
    const style = document.createElement('style');
    style.id = 'jaw-account-styles';
    style.textContent = `
      :root {
        --jaw-bg: #201b14; --jaw-bg-raised: #17130e; --jaw-border: #40382a;
        --jaw-text: #ede4d1; --jaw-text-dim: #b5a888; --jaw-gold: #d4af37;
        --jaw-gold-hover: #e2c158; --jaw-green: #5cba60; --jaw-red: #e5595e;
      }
      .jaw-acc-widget {
        position: fixed; top: 14px; right: 14px; z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px; display: flex; align-items: center; gap: 8px;
        background: var(--jaw-bg); color: var(--jaw-text); border: 1px solid var(--jaw-border);
        border-radius: 999px; padding: 7px 14px 7px 10px; cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,.35); transition: border-color .15s, transform .15s;
      }
      .jaw-acc-widget:hover { border-color: var(--jaw-gold); transform: translateY(-1px); }
      .jaw-acc-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--jaw-text-dim); flex: none; transition: background .2s; }
      .jaw-acc-overlay {
        position: fixed; inset: 0; z-index: 100000; background: rgba(10,8,5,.7);
        backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 16px;
      }
      .jaw-acc-card {
        background: var(--jaw-bg); color: var(--jaw-text); border: 1px solid var(--jaw-border);
        border-radius: 14px; padding: 26px; max-width: 380px; width: 100%;
        box-shadow: 0 20px 60px rgba(0,0,0,.5);
      }
      .jaw-acc-h { margin: 0 0 10px; font-size: 18px; font-weight: 600; letter-spacing: .2px; }
      .jaw-acc-p { font-size: 13px; color: var(--jaw-text-dim); margin: 0 0 16px; line-height: 1.55; }
      .jaw-acc-label { font-size: 12px; color: var(--jaw-text-dim); display: block; margin-bottom: 6px; }
      .jaw-acc-input {
        width: 100%; box-sizing: border-box; padding: 11px 12px; margin-bottom: 12px;
        background: var(--jaw-bg-raised); border: 1px solid var(--jaw-border); color: var(--jaw-text);
        border-radius: 8px; font-size: 14px; transition: border-color .15s, box-shadow .15s;
      }
      .jaw-acc-input:focus { outline: none; border-color: var(--jaw-gold); box-shadow: 0 0 0 3px rgba(212,175,55,.18); }
      .jaw-acc-input.code { display: none; text-align: center; letter-spacing: 4px; font-size: 16px; }
      .jaw-acc-msg { font-size: 12px; color: var(--jaw-text-dim); margin-bottom: 10px; min-height: 16px; }
      .jaw-acc-msg.ok { color: var(--jaw-green); }
      .jaw-acc-msg.err { color: var(--jaw-red); }
      .jaw-acc-note { font-size: 11px; color: var(--jaw-text-dim); opacity: .75; margin: -6px 0 16px; line-height: 1.5; }
      .jaw-acc-row { display: flex; gap: 10px; justify-content: flex-end; }
      .jaw-acc-row.split { justify-content: space-between; }
      .jaw-acc-btn {
        padding: 9px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;
        border: 1px solid transparent; transition: filter .15s, background .15s;
      }
      .jaw-acc-btn:hover { filter: brightness(1.08); }
      .jaw-acc-btn:disabled { opacity: .55; cursor: default; filter: none; }
      .jaw-acc-btn.primary { background: var(--jaw-gold); color: #1a1508; }
      .jaw-acc-btn.ghost { background: transparent; border-color: var(--jaw-border); color: var(--jaw-text); }
      .jaw-acc-btn.danger { background: var(--jaw-red); color: #1a1508; }
      .jaw-acc-divider { border-top: 1px solid var(--jaw-border); margin: 14px 0; padding-top: 14px; }
    `;
    document.head.appendChild(style);
  }

  // --- tiny status/sign-in widget, top-right on every page that includes this script ---
  let statusEl, dotEl;
  function buildWidget() {
    injectStyles();
    const wrap = document.createElement('div');
    wrap.className = 'jaw-acc-widget';
    dotEl = document.createElement('span');
    dotEl.className = 'jaw-acc-dot';
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
      'signed-in': ['#5cba60', overrideName() || displayName() || (session && session.user ? session.user.email : 'Signed in')],
    };
    const [color, label] = map[state] || map['signed-out'];
    dotEl.style.background = color;
    statusEl.textContent = label;
  }

  function openPanel() {
    const existing = document.getElementById('jaw-account-modal');
    if (existing) { existing.remove(); return; }
    injectStyles();
    const modal = document.createElement('div');
    modal.id = 'jaw-account-modal';
    modal.className = 'jaw-acc-overlay';
    if (session) {
      const game = window.JAW_GAME || null;
      const gated = game && requiresEntitlement(game);
      const owned = gated && hasEntitlement(game);
      const syncSection = !gated ? '' : owned ? `
          <div class="jaw-acc-msg ok" style="margin-bottom:16px;">✓ Cloud sync unlocked for this journal.</div>` : `
          <div class="jaw-acc-divider">
            <p class="jaw-acc-p" style="margin-bottom:8px;">Cloud sync for this journal isn't unlocked on this account yet. Got a code?</p>
            <div style="display:flex;gap:8px;">
              <input id="jaw-account-redeem-code" class="jaw-acc-input" type="text" placeholder="Enter code" maxlength="24"
                style="margin-bottom:0;flex:1;letter-spacing:1px;text-transform:uppercase;" />
              <button id="jaw-account-redeem-btn" class="jaw-acc-btn primary">Redeem</button>
            </div>
            <div id="jaw-account-redeem-msg" class="jaw-acc-msg" style="margin-top:6px;margin-bottom:0;"></div>
          </div>`;
      const fixedName = overrideName();
      const nameSection = fixedName ? `
          <label class="jaw-acc-label">Character name</label>
          <div class="jaw-acc-input" style="opacity:.85;cursor:default;">${escapeHtml(fixedName)}</div>
          <p class="jaw-acc-note" style="margin:-6px 0 12px;">This journal follows a fixed protagonist, so the name shown here isn't editable — look for a toggle in the journal itself if it has more than one.</p>` : `
          <label class="jaw-acc-label">Character name (shown here instead of your email)</label>
          <input id="jaw-account-name" class="jaw-acc-input" type="text" maxlength="40" placeholder="e.g. Dovahkiin" value="${displayName() ? String(displayName()).replace(/"/g, '&quot;') : ''}" />
          <div id="jaw-account-name-msg" class="jaw-acc-msg"></div>`;
      const nameRow = fixedName ? `
          <div class="jaw-acc-row" style="margin-top:16px;">
            <button id="jaw-account-close" class="jaw-acc-btn ghost">Close</button>
            <button id="jaw-account-signout" class="jaw-acc-btn danger">Sign out</button>
          </div>` : `
          <div class="jaw-acc-row split" style="margin-top:16px;">
            <button id="jaw-account-save-name" class="jaw-acc-btn primary">Save name</button>
            <div style="display:flex;gap:10px;">
              <button id="jaw-account-close" class="jaw-acc-btn ghost">Close</button>
              <button id="jaw-account-signout" class="jaw-acc-btn danger">Sign out</button>
            </div>
          </div>`;
      modal.innerHTML = `
        <div class="jaw-acc-card">
          <h3 class="jaw-acc-h">Signed in</h3>
          <p class="jaw-acc-p" style="margin-bottom:16px;">${session.user.email}</p>
          ${nameSection}
          ${syncSection}
          ${nameRow}
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      document.getElementById('jaw-account-close').addEventListener('click', () => modal.remove());
      document.getElementById('jaw-account-signout').addEventListener('click', async () => { await signOut(); modal.remove(); });
      const saveNameBtn = document.getElementById('jaw-account-save-name');
      if (saveNameBtn) saveNameBtn.addEventListener('click', async () => {
        const nameMsg = document.getElementById('jaw-account-name-msg');
        const name = document.getElementById('jaw-account-name').value.trim();
        setMsg(nameMsg, 'Saving…');
        try {
          await setDisplayName(name);
          setStatus('signed-in');
          setMsg(nameMsg, 'Saved.', 'ok');
        } catch (e) {
          console.error('Could not save name', e);
          setMsg(nameMsg, 'Could not save — try again.', 'err');
        }
      });
      const redeemBtn = document.getElementById('jaw-account-redeem-btn');
      if (redeemBtn) {
        redeemBtn.addEventListener('click', async () => {
          const codeInput = document.getElementById('jaw-account-redeem-code');
          const msg = document.getElementById('jaw-account-redeem-msg');
          const code = codeInput.value.trim();
          if (!code) { setMsg(msg, 'Enter a code first.', 'err'); return; }
          setMsg(msg, 'Redeeming…');
          try {
            await redeem(code, game);
            setMsg(msg, 'Unlocked! Reopening…', 'ok');
            if (typeof window.__jawAccountOnSignedIn === 'function') window.__jawAccountOnSignedIn();
            setTimeout(() => { modal.remove(); openPanel(); }, 500);
          } catch (e) {
            console.error('Redeem failed', e);
            setMsg(msg, e.message || 'Could not redeem that code.', 'err');
          }
        });
      }
      return;
    }
    modal.innerHTML = `
      <div class="jaw-acc-card">
        <h3 class="jaw-acc-h">Sign in</h3>
        <p id="jaw-account-step1-copy" class="jaw-acc-p">
          Enter your email and we'll send you a sign-in code. No password
          needed — your progress follows your account across any device.
        </p>
        <input id="jaw-account-email" class="jaw-acc-input" type="email" placeholder="you@example.com" />
        <input id="jaw-account-code" class="jaw-acc-input code" type="text" inputmode="numeric" placeholder="Enter code" maxlength="12" />
        <div id="jaw-account-msg" class="jaw-acc-msg"></div>
        <p class="jaw-acc-note">You'll stay signed in on this device until you sign out — no need to re-enter your email or code next time, unless your browser clears site data on close.</p>
        <div class="jaw-acc-row">
          <button id="jaw-account-close" class="jaw-acc-btn ghost">Close</button>
          <button id="jaw-account-send" class="jaw-acc-btn primary">Send code</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById('jaw-account-close').addEventListener('click', () => modal.remove());

    let codeSentFor = null;
    document.getElementById('jaw-account-send').addEventListener('click', async () => {
      const email = document.getElementById('jaw-account-email').value.trim();
      const codeInput = document.getElementById('jaw-account-code');
      const sendBtn = document.getElementById('jaw-account-send');
      const msg = document.getElementById('jaw-account-msg');
      if (!email) { setMsg(msg, 'Enter an email first.', 'err'); return; }

      if (codeSentFor !== email) {
        // Step 1: request the code.
        setMsg(msg, 'Sending…');
        try {
          await signIn(email);
          codeSentFor = email;
          document.getElementById('jaw-account-step1-copy').textContent = 'Enter the code we just emailed you.';
          document.getElementById('jaw-account-email').disabled = true;
          codeInput.style.display = 'block';
          codeInput.focus();
          sendBtn.textContent = 'Verify';
          setMsg(msg, 'Code sent — check your email.', 'ok');
        } catch (e) {
          console.error('Sign-in failed', e);
          setMsg(msg, 'Could not send code — try again.', 'err');
        }
        return;
      }

      // Step 2: verify the code.
      const code = codeInput.value.trim();
      if (!code) { setMsg(msg, 'Enter the code from your email.', 'err'); return; }
      setMsg(msg, 'Verifying…');
      try {
        await verifyCode(email, code);
        setMsg(msg, 'Signed in — you\'re all set on this device.', 'ok');
        setTimeout(() => modal.remove(), 600);
      } catch (e) {
        console.error('Code verification failed', e);
        setMsg(msg, 'Invalid or expired code — try again.', 'err');
      }
    });
  }

  // Re-renders the widget's current label — call this after changing whatever
  // window.JAW_CHARACTER_NAME_OVERRIDE resolves to (e.g. an in-journal protagonist toggle),
  // so the widget updates immediately instead of waiting for the next sign-in/out.
  function refresh() { setStatus(session ? 'signed-in' : 'signed-out'); }

  window.JawAccount = { init, load, save, isSignedIn, hasEntitlement, syncsFor, redeem, refresh, openPanel };
  document.addEventListener('DOMContentLoaded', init);
})();
