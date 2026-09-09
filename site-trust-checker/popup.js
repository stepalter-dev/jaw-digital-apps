// Site Trust Checker — popup logic
//
// Runs entirely client-side. Combines three signal groups that don't
// require an API key or backend proxy:
//   - Transport & DNS hygiene   (25%)
//   - Domain age / stability    (45%, via public RDAP lookup)
//   - Syntactic / structural    (30%: punycode, raw IPs, obvious tricks)
//
// Threat-feed signals (Google Safe Browsing / VirusTotal, 40% weight in
// the full design) require server-side API keys and are intentionally
// left out of this client-only build — see README "Next steps".

const RDAP_ENDPOINT = 'https://rdap.org/domain/';

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    renderError('No active tab URL available.');
    return;
  }

  let url;
  try {
    url = new URL(tab.url);
  } catch {
    renderError('Could not parse this page\'s URL.');
    return;
  }

  if (!/^https?:$/.test(url.protocol)) {
    renderError(`Not a web page (${url.protocol})`);
    return;
  }

  const domain = url.hostname;
  document.getElementById('domain').innerText = domain;

  const findings = [];

  // --- Transport & DNS hygiene (25 pts) ---------------------------------
  let transportScore = 25;
  if (url.protocol !== 'https:') {
    transportScore = 0;
    findings.push({ ok: false, text: 'Unencrypted connection (HTTP)' });
  } else {
    findings.push({ ok: true, text: 'Secure connection (HTTPS)' });
  }

  // --- Syntactic / structural integrity (30 pts) ------------------------
  let syntaxScore = 30;
  const isRawIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain) || domain.includes(':');
  if (isRawIp) {
    syntaxScore -= 20;
    findings.push({ ok: false, text: 'Direct IP address used as host' });
  }

  const isPunycode = domain.split('.').some((label) => label.startsWith('xn--'));
  if (isPunycode) {
    syntaxScore -= 15;
    findings.push({ ok: false, text: 'Punycode / internationalized domain (possible homograph attack)' });
  }

  const labels = domain.split('.');
  if (labels.length >= 5) {
    syntaxScore -= 5;
    findings.push({ ok: false, text: 'Unusually deep subdomain structure' });
  }

  if (!isRawIp && !isPunycode && labels.length < 5) {
    findings.push({ ok: true, text: 'No obfuscation or raw-IP hosting detected' });
  }
  syntaxScore = Math.max(0, syntaxScore);

  // --- Domain age via RDAP (45 pts) --------------------------------------
  let ageScore = 22; // neutral default if lookup fails/unsupported
  if (isRawIp) {
    ageScore = 0;
    findings.push({ ok: false, text: 'Domain age check skipped (raw IP host)' });
  } else {
    try {
      const registrableDomain = getRegistrableDomain(domain);
      const res = await fetch(RDAP_ENDPOINT + registrableDomain, {
        headers: { Accept: 'application/rdap+json' },
      });

      if (res.ok) {
        const data = await res.json();
        const registration = (data.events || []).find((e) => e.eventAction === 'registration');
        if (registration && registration.eventDate) {
          const ageDays = (Date.now() - new Date(registration.eventDate).getTime()) / 86400000;
          if (ageDays >= 730) {
            ageScore = 45;
            findings.push({ ok: true, text: `Domain registered ${Math.floor(ageDays / 365)}+ years ago` });
          } else if (ageDays >= 90) {
            ageScore = 30;
            findings.push({ ok: true, text: `Domain registered ~${Math.floor(ageDays / 30)} months ago` });
          } else if (ageDays >= 0) {
            ageScore = 5;
            findings.push({ ok: false, text: `Domain registered only ${Math.floor(ageDays)} days ago` });
          }
        } else {
          findings.push({ ok: true, text: 'RDAP record found, but no registration date exposed' });
        }
      } else if (res.status === 404) {
        findings.push({ ok: false, text: 'No RDAP record found for this domain' });
        ageScore = 10;
      } else {
        findings.push({ ok: true, text: 'RDAP lookup unavailable (registry not queried)' });
      }
    } catch {
      findings.push({ ok: true, text: 'RDAP lookup failed (network or unsupported TLD)' });
    }
  }

  const score = Math.round(transportScore + syntaxScore + ageScore);
  renderResult(score, findings);
});

/** Best-effort registrable domain (strips one leading subdomain level). */
function getRegistrableDomain(hostname) {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

function renderResult(score, findings) {
  const scoreEl = document.getElementById('score');
  const badge = document.getElementById('badge');

  scoreEl.innerText = String(score);

  let cls = 'safe';
  let label = 'Verified / Safe';
  if (score < 50) {
    cls = 'danger';
    label = 'High Risk';
  } else if (score < 80) {
    cls = 'suspicious';
    label = 'Caution';
  }
  badge.className = cls;
  badge.innerText = label;

  const list = document.getElementById('details');
  list.innerHTML = findings
    .map((f) => `<li class="${f.ok ? 'ok' : 'flag'}">${escapeHtml(f.text)}</li>`)
    .join('');
}

function renderError(message) {
  document.getElementById('domain').innerText = message;
  document.getElementById('score').innerText = '--';
  const badge = document.getElementById('badge');
  badge.className = 'suspicious';
  badge.innerText = 'N/A';
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
