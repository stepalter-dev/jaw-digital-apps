/*
 * journal-app.js — turns each journal into something you can open and use
 * straight away: installable to a home screen or taskbar, readable with no
 * connection, and remembered so the studio page can offer to resume it.
 *
 * Drop-in: <script src="../journal-app.js" defer></script>
 * Pairs with the <link rel="manifest"> in each journal's own <head>.
 */
(function () {
  'use strict';

  var LAST_KEY = 'jaw_last_journal';

  var TITLES = {
    skyrim: 'Dragonborn’s Field Journal',
    oblivion: 'The Champion’s Codex',
    fallout76: 'Vault Dweller’s Almanac',
    witcher3: 'The White Wolf’s Journal',
    newvegas: 'The Courier’s Log',
    fallout4: 'The Sole Survivor’s Logbook',
    cyberpunk: 'The Merc’s Shard',
    rdr2: 'Molly’s Field Journal',
    'home-maintenance': 'Home Maintenance Companion'
  };

  var ICONS = {
    skyrim: '🐉', oblivion: '🏛️', fallout76: '📻',
    witcher3: '🐺', newvegas: '🎰', fallout4: '🧊',
    rdr2: '🤠', cyberpunk: '🌃', 'home-maintenance': '🏠'
  };

  function slug() {
    var parts = window.location.pathname.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  // --- Remember which journal was last opened -------------------------
  // Every journal shares an origin with the studio index, so this is
  // readable there without any server involved.
  function recordVisit() {
    var s = slug();
    if (!TITLES[s]) return;
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({
        slug: s,
        title: TITLES[s],
        icon: ICONS[s] || '',
        at: Date.now()
      }));
    } catch (e) { /* private mode, blocked storage — not worth failing over */ }
  }

  // --- Offline support ------------------------------------------------
  function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    // Relative paths so this works under /jaw-digital-apps/ or / alike.
    navigator.serviceWorker.register('../sw.js', { scope: '../' })
      .catch(function () { /* offline support is a bonus; never block the app */ });
  }

  // --- Install prompt -------------------------------------------------
  // Chromium fires beforeinstallprompt and suppresses its own UI. Rather
  // than lose the affordance entirely, hold the event and show one quiet
  // button, dismissible for good.
  var deferredPrompt = null;
  var DISMISS_KEY = 'jaw_install_dismissed';

  function alreadyInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  function dismissed() {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  }

  function showInstallButton() {
    if (document.getElementById('jaw-install')) return;

    var style = document.createElement('style');
    style.textContent = [
      '#jaw-install{position:fixed;right:14px;bottom:14px;z-index:9999;display:flex;align-items:center;',
      ' gap:8px;background:#1b1813;color:#e2c158;border:1px solid #3a3226;border-radius:999px;',
      ' padding:9px 14px;font:600 13px Georgia,"Times New Roman",serif;cursor:pointer;',
      ' box-shadow:0 4px 14px rgba(0,0,0,0.35);}',
      '#jaw-install:hover{color:#f0d795;border-color:#5a4d3a;}',
      '#jaw-install:focus-visible{outline:2px solid #e2c158;outline-offset:3px;}',
      '#jaw-install .x{color:#786b4e;font-weight:400;padding-left:2px;}',
      '#jaw-install .x:hover{color:#e8e0d0;}',
      '@media print{#jaw-install{display:none;}}'
    ].join('');
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = 'jaw-install';
    wrap.setAttribute('role', 'group');
    wrap.innerHTML = '<span role="button" tabindex="0" id="jaw-install-go">Install this journal</span>' +
                     '<span class="x" role="button" tabindex="0" id="jaw-install-x" ' +
                     'aria-label="Don\'t offer this again" title="Don\'t offer this again">×</span>';
    document.body.appendChild(wrap);

    function install() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        wrap.remove();
      });
    }
    function hideForGood() {
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
      wrap.remove();
    }

    var go = document.getElementById('jaw-install-go');
    var x = document.getElementById('jaw-install-x');
    go.addEventListener('click', install);
    go.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); install(); } });
    x.addEventListener('click', function (e) { e.stopPropagation(); hideForGood(); });
    x.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hideForGood(); } });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (!alreadyInstalled() && !dismissed()) showInstallButton();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    var el = document.getElementById('jaw-install');
    if (el) el.remove();
  });

  function start() {
    recordVisit();
    registerWorker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
