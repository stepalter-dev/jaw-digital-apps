# App Store readiness — JAW Digital Companion Journals

Scaffolding for wrapping the umbrella journal app (Skyrim, Oblivion, Fallout 4,
Fallout 76, New Vegas, Witcher 3) with Capacitor for iOS + Android. This machine has no
Node.js, and iOS builds require Xcode on macOS regardless — so the steps below are what
to run on a Mac (for iOS) or any machine with Node (for Android).

## What's done in this pass

- `www/` — the app's web root. Contains **symlinks** to the existing game folders,
  `account.js`, and `sync.js` (not copies — editing a journal in place still works,
  nothing to keep in sync by hand).
- `www/index.html` — new in-app home screen listing all 7 journals. The public
  marketing site at repo-root `index.html` is untouched and still works standalone.
- `www/manifest.json` — PWA manifest (name, icons, standalone display).
- `www/privacy.html`, `www/terms.html` — draft policy pages, linked from both the app
  home and the marketing site footer. **Read the TODOs before shipping** — the contact
  emails are placeholders and need to be real addresses you control.
- `assets/icon.svg` — a 1024×1024 wax-seal icon (oxblood seal, gold branch-and-star
  impression, dark leather ground), chosen from four IP-safe concepts reviewed against
  the actual game trademarks. Good for testing the build pipeline; before final
  submission, convert its shapes to outlined paths (it's already shape-only, no live
  text, so this is mostly a formality) and have a designer polish the linework.
- `package.json`, `capacitor.config.json` — Capacitor project config, app id
  `com.jawdigital.companionjournals`.
- `.gitignore` — excludes `node_modules/`, `ios/`, `android/` (generated, don't commit).

## What you still need to do

### 1. Install and generate the native projects (needs Node)
```bash
cd ~/jaw-digital-apps
npm install
npx cap add ios       # only works to *build* on a Mac with Xcode, but scaffolds fine anywhere
npx cap add android
npx capacitor-assets generate --pwa   # also drops PWA-sized PNGs into www/icons/
npx cap sync
```
`www/index.html` and `www/manifest.json` already reference `www/icons/icon-180.png`,
`icon-192.png`, and `icon-512.png` — the `--pwa` flag above is what actually creates
that `icons/` folder from `assets/icon.svg`; without it those references 404 (harmless
until then, but do it before shipping).

### 2. Replace the placeholder icon
`assets/icon.svg` is a functional stand-in, not final brand art. Design a real 1024×1024
icon (flat color, no transparency, per Apple's guidelines — no rounded corners, Apple
adds those) and drop it in `assets/icon.svg` or `assets/icon.png`, then re-run
`npx capacitor-assets generate`.

### 3. Fix the privacy/terms placeholders
Both pages have `privacy@jawdigital.dev` / `support@jawdigital.dev` as placeholder
contact addresses — replace with real ones you monitor. Apple requires the privacy
policy to be reachable at a public URL you'll paste into App Store Connect (the
marketing site's `www/privacy.html`, once hosted, works for this).

### 4. Add In-App Purchase for the paid unlocks
Apple requires Apple's own IAP (StoreKit) for unlocking digital content inside an iOS
app — an external Stripe/web checkout is against guideline 3.1.1 unless you're
specifically enrolled in the External Purchase entitlement (US-only, has its own
approval process). Concretely:
- Add `@capacitor-community/in-app-purchases` (wraps StoreKit + Google Play Billing).
- Create the corresponding in-app purchase products in App Store Connect and Google
  Play Console, one per gated game (Skyrim, Oblivion, Fallout 4, New Vegas — matches
  `GATED_GAMES` in `account.js`).
- On purchase success, call the same entitlement-granting path `account.js` already
  uses so IAP and any existing web purchase flow land in the same place.
- The pricing section on the marketing site still says "TBD" — decide actual pricing
  before wiring this up.

### 5. Trademark/IP review
Bethesda, Rockstar/Take-Two, and CD Projekt Red all actively enforce trademarks on
their game names. The journal *content* here is original writing, which is the safer
part — the risk is in the App Store *listing*: app name, icon, and screenshots. Don't
use official game logos or box art as app icons/screenshots; keep branding clearly
"JAW Digital's companion journal for [game]," not styled to look like an official
product. Consider running the final app name and icon by a lawyer or at minimum
checking each publisher's fan-content guidelines before submitting — this is the
single likeliest rejection/takedown reason and I can't fully de-risk it for you.

### 6. App Store Connect / Play Console listing prep
Both stores will additionally want, none of which exist yet:
- Screenshots sized per device class (iPhone 6.7", 6.5", iPad if supporting tablets)
- App description, keywords, support URL
- Age rating questionnaire
- Apple: sign in with your Apple Developer account ($99/yr) and set up the app record
- Google: Play Console account ($25 one-time) and Data Safety form (mirrors the
  privacy policy — email + progress data, no ads/tracking)

### 7. Build and test
```bash
npx cap open ios       # opens Xcode — run on simulator/device, then Archive → TestFlight
npx cap open android   # opens Android Studio — run, then generate a signed bundle
```

## Not blocking, but worth knowing
- Supabase publishable key in `account.js` is safe to ship (Row Level Security scopes
  it) — no secret leakage there.
- No analytics/ad SDKs anywhere in the codebase, which simplifies both stores'
  privacy questionnaires.
