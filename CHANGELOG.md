# Changelog

Cross-project log of notable changes to the JAW Digital site and journals, kept here
(inside the Drive-synced repo folder) so it's easy to skim without going through GitHub.
Each journal also carries its own PIP-OS/version badge in its header for that journal's
own revision history.

## 2026-09-18

- **Fallout 76 content:** added Legendary Scrip economy and Treasury Notes & Gold Bullion
  reference entries to Repeatable Quests / Systems (flat 50-Scrip Mod Box cost, Purveyor
  Murmrgh modules, the scrap/exchange-machine loop, Gold Press conversion rate and daily
  cap, and where to spend Bullion). PIP-OS v2.9.0.
- **VERA (Fallout 76 chat assistant):** chat history now persists to localStorage instead
  of living only in memory, so it survives page reloads (a "Clear" button resets it on
  purpose). Also tightened the Worker's system prompt to stop it inventing specific
  identifiers (relay tower codes, coordinates) it isn't actually sure about, and to call
  out conflicts with earlier answers instead of silently asserting a new version. PIP-OS v2.8.4.
- **Site brand mark:** replaced the header/footer glyph and favicon with a new compass
  emblem. One tick on the bezel sits at a bearing of exactly 15 degrees off true
  north — no cardinal purpose, just a private, countable detail. Source: `brand/compass-emblem.svg`
  (header/favicon, two-tone) and `brand/compass-emblem-footer.svg` (footer, monochrome).
- **Fallout 76 — Finder tab:** removed the redundant hint paragraph under the search bar
  and the "VERA — Vault-Tec Emergency Response Assistant" tagline under the chat header;
  both duplicated text shown elsewhere. PIP-OS v2.8.3.

## 2026-09-17 and earlier (this project's recent history)

- **VERA (Fallout 76 chat assistant):** shipped a default Cloudflare Worker endpoint so
  VERA works with zero setup in a new browser, with a "Change"/"Reset to default" escape
  hatch; fixed a CORS bug where the Worker's origin allowlist hadn't been updated for the
  new custom domain. PIP-OS v2.8.2.
- **Custom domain:** the journals site moved off `stepalter-dev.github.io` to
  **https://journals.bw8.dev/** (Cloudflare DNS + GitHub Pages custom domain + HTTPS).
- **Field Kit Auditor:** homepage CTA now points at its live domain,
  `https://fieldkit.bw8.dev`, instead of the old Vercel preview URL.
- **Season End countdown (Fallout 76):** ships with a real estimated default date instead
  of requiring manual entry, tagged "Estimated" vs "Set" vs "Not set" in the Overview tab.
- **Fallout 76 content:** added the Legendary Mod overhaul, Legacy Seasons ticket-sharing,
  and The Slasher seasonal questline to the Repeatable Quests / Systems section.
- **Palette pass:** resolved visual-identity color overlaps between Fallout 76 and RDR2,
  and between Fallout 4 and Cyberpunk, so each journal's palette stays unique across the suite.
