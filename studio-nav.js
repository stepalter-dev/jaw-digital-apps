/*
 * studio-nav.js — the strip that ties the journals back to the studio.
 *
 * Each journal is otherwise a dead end: someone who arrives from a search
 * result or a shared link has no way to find the studio or the other
 * journals. This appends one shared bar to every app so they read as a
 * suite rather than seven unrelated pages.
 *
 * Drop-in: <script src="../studio-nav.js" defer></script>
 * Adds no dependencies and touches nothing the host page already styles —
 * every rule below is scoped to .jaw-studio-bar.
 */
(function () {
  'use strict';

  // Publicly listed journals. RDR2 is deliberately absent: it stays online
  // for the person it was made for, but is unlisted everywhere else.
  var JOURNALS = [
    { slug: 'skyrim',    icon: '🐉', name: "Dragonborn's Field Journal", game: 'Skyrim' },
    { slug: 'oblivion',  icon: '🏛️', name: "The Champion's Codex", game: 'Oblivion' },
    { slug: 'fallout76', icon: '📻', name: "Vault Dweller's Almanac", game: 'Fallout 76' },
    { slug: 'witcher3',  icon: '🐺', name: "The White Wolf's Journal", game: 'Witcher 3' },
    { slug: 'newvegas',  icon: '🎰', name: "The Courier's Log", game: 'New Vegas' },
    { slug: 'fallout4',  icon: '🧊', name: "The Sole Survivor's Logbook", game: 'Fallout 4' }
  ];

  var STUDIO_MARK =
    '<svg class="jaw-mark" viewBox="0 0 1024 1024" aria-hidden="true" focusable="false">' +
      '<circle cx="512" cy="512" r="300" fill="#7a3230"/>' +
      '<g transform="translate(512 512)" fill="none" stroke="#e6c988" stroke-width="46" ' +
         'stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M 0 -150 L 0 120"/><path d="M 0 -150 L -70 -70"/><path d="M 0 -150 L 70 -70"/>' +
        '<path d="M -55 -25 L 0 40 L 55 -25"/><path d="M -55 75 L 0 140 L 55 75"/>' +
      '</g>' +
    '</svg>';

  var CSS = [
    '.jaw-studio-bar{',
    '  background:#131110;color:#a89b7f;',
    '  font-family:Georgia,"Times New Roman",serif;font-size:13.5px;line-height:1.5;',
    '  border-top:1px solid #2a251c;padding:22px 20px 26px;margin:0;',
    '}',
    '.jaw-studio-bar *{box-sizing:border-box;}',
    '.jaw-studio-inner{max-width:1080px;margin:0 auto;display:flex;flex-wrap:wrap;',
    '  gap:18px 28px;align-items:center;justify-content:space-between;}',
    '.jaw-studio-home{display:inline-flex;align-items:center;gap:9px;text-decoration:none;',
    '  color:#e2c158;letter-spacing:0.07em;font-size:12.5px;font-weight:bold;white-space:nowrap;}',
    '.jaw-studio-home .jaw-mark{width:22px;height:22px;flex:none;display:block;}',
    '.jaw-studio-home span.sub{color:#786b4e;font-weight:normal;letter-spacing:0.03em;}',
    '.jaw-studio-home:hover{color:#f0d795;}',
    '.jaw-studio-others{display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-end;}',
    '.jaw-studio-others .lbl{color:#786b4e;font-size:11.5px;letter-spacing:0.09em;',
    '  text-transform:uppercase;margin-right:4px;}',
    '.jaw-studio-others a{display:inline-flex;align-items:center;gap:6px;text-decoration:none;',
    '  color:#a89b7f;border:1px solid #2a251c;border-radius:999px;padding:5px 12px;font-size:12.5px;',
    '  white-space:nowrap;transition:color .15s ease,border-color .15s ease;}',
    '.jaw-studio-others a:hover{color:#e8e0d0;border-color:#3a3226;}',
    '.jaw-studio-others a .ico{font-family:system-ui,"Segoe UI Emoji","Apple Color Emoji",sans-serif;',
    '  font-size:13px;line-height:1;}',
    '.jaw-studio-bar a:focus-visible{outline:2px solid #e2c158;outline-offset:3px;}',
    '@media (max-width:640px){',
    '  .jaw-studio-inner{justify-content:flex-start;}',
    '  .jaw-studio-others{justify-content:flex-start;}',
    '}',
    '@media (prefers-reduced-motion:reduce){',
    '  .jaw-studio-bar *{transition-duration:0.001ms !important;}',
    '}'
  ].join('\n');

  function currentSlug() {
    var parts = window.location.pathname.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  }

  function build() {
    if (document.querySelector('.jaw-studio-bar')) return;

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var here = currentSlug();
    var others = JOURNALS.filter(function (j) { return j.slug !== here; });

    var links = others.map(function (j) {
      return '<a href="../' + j.slug + '/" title="' + j.name + '">' +
               '<span class="ico" aria-hidden="true">' + j.icon + '</span>' + j.game +
             '</a>';
    }).join('');

    var bar = document.createElement('div');
    bar.className = 'jaw-studio-bar';
    bar.innerHTML =
      '<div class="jaw-studio-inner">' +
        '<a class="jaw-studio-home" href="../">' + STUDIO_MARK +
          'JAW DIGITAL <span class="sub">· studio</span></a>' +
        '<nav class="jaw-studio-others" aria-label="Other companion journals">' +
          '<span class="lbl">More journals</span>' + links +
        '</nav>' +
      '</div>';

    document.body.appendChild(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
