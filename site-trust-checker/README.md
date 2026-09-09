# Site Trust Checker

A Manifest V3 browser extension that gives a quick 0–100 trustworthiness
score for the site in your active tab, based on the architecture in
[Site Trustworthiness Evaluator: Architectural Blueprint & Browser Extension
Implementation](https://docs.google.com/document/d/1u8vJhQXkf6BUvPhPnyimKFInAr8hYOiSKSzMeArSxc4/edit).

## What it checks (client-side, no API keys required)

| Signal group | Weight | What it looks at |
| --- | --- | --- |
| Domain age & stability | 45% | Registration date via a public [RDAP](https://rdap.org) lookup |
| Transport security | 25% | Whether the page is served over HTTPS |
| Syntactic / structural integrity | 30% | Raw IP-address hosts, punycode/homograph domains, excessive subdomain depth |

Scores map to:

- **80–100** — Verified / Safe
- **50–79** — Caution / Unverified
- **0–49** — High Risk

> The full design in the source doc also scores threat-intel feeds (Google
> Safe Browsing, VirusTotal) at 40% weight. Those require server-side API
> keys, so they're intentionally left out of this pure client-side build —
> see [Next steps](#next-steps).

## Install locally (Developer Mode)

1. Clone this repo.
2. Open a Chromium browser (Chrome, Brave, Edge) and go to `chrome://extensions`.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this repo's folder.
5. Pin the extension, visit any site, and click the icon to scan it.

## Project structure

```
manifest.json   Extension manifest (MV3, activeTab + storage permissions)
popup.html      Popup UI markup/styles
popup.js        Scan logic: RDAP lookup, TLS check, syntactic heuristics
```

## Next steps

These are the expansion milestones from the original design doc, not yet
implemented here:

- **Google Safe Browsing v4 Lookup API** — needs a background service
  worker and an API key; should not be called directly from the popup to
  avoid exposing the key.
- **VirusTotal** integration for a second threat-feed opinion.
- **DNSSEC / DMARC / SPF checks** — not exposed to browser extensions
  directly; would need a small backend that performs DNS lookups.
- **Backend gateway** (Node.js/FastAPI + Redis) to cache threat-feed
  queries and keep API keys off the client, as described in the source
  design doc.

## Disclaimer

This is a heuristic scanner for quick situational awareness, not a
substitute for dedicated threat-intelligence tooling. A high score does not
guarantee a site is safe, and a low score can result from a legitimate but
newly-registered or self-hosted (IP-based) site.

## License

MIT — see [LICENSE](LICENSE).
