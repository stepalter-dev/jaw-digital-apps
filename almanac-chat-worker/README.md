# Almanac Chat Worker

A tiny Cloudflare Worker that holds your Anthropic API key server-side and
proxies chat requests from the Fallout 76 journal's Finder tab (and later,
other journals). The journal itself is static HTML on GitHub Pages — it can
never safely hold an API key, so this Worker is the one small "backend"
piece that does.

You only need to do this once. It's free (Cloudflare's free tier covers
this kind of light personal-app traffic) and takes about 10 minutes.

## 1. Get an Anthropic API key

1. Go to <https://console.anthropic.com/> and sign in (or create an account).
2. Go to **API Keys** and create a new key. Copy it somewhere safe — you
   won't be able to see it again after this.
3. Anthropic API usage is pay-as-you-go, billed to whatever payment method
   you add there. This Worker uses a small/cheap model (Claude Haiku) and
   caps each reply, so casual personal use should run to well under a
   dollar a month — but it's your account and your card, so keep an eye on
   <https://console.anthropic.com/settings/usage> if you're curious.

## 2. Get a free Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up> and create a free account
   (or sign in if you already have one).
2. No credit card is required for the Workers free tier at this scale.

## 3. Install Wrangler (Cloudflare's CLI) and deploy

From this `almanac-chat-worker` folder, run:

```bash
npm install -g wrangler
wrangler login
```

`wrangler login` opens your browser to authorize the CLI against your
Cloudflare account — do that there, then come back to the terminal.

Then set your Anthropic key as a secret (this stores it encrypted in
Cloudflare, never in this repo or in the deployed code):

```bash
wrangler secret put ANTHROPIC_API_KEY
```

Paste the key from step 1 when prompted.

Finally, deploy:

```bash
wrangler deploy
```

Wrangler will print a URL that looks like:

```
https://jaw-almanac-chat.<your-subdomain>.workers.dev
```

**Copy that URL** — that's what you paste into the journal's chat panel
settings (a "Assistant endpoint" field) so the page knows where to send
your questions. It's a public URL but reveals nothing sensitive on its own;
only requests with a valid message get an answer, and the API key itself
never leaves Cloudflare.

## 4. Lock it down to your site (optional but recommended)

Open `worker.js` and change this line near the top:

```js
const ALLOWED_ORIGIN = "https://stepalter-dev.github.io";
```

to match wherever your journal is actually hosted, if it's different, then
run `wrangler deploy` again. This stops other websites from quietly using
your Worker (and your API quota) from their own pages.

## Updating later

Whenever you edit `worker.js`, just run `wrangler deploy` again — no need
to redo the login or secret steps.

## Costs & limits built in

- Each request is capped at 700 tokens of reply and ~2000 characters of
  input, and only the last few turns of conversation are sent, to keep
  individual requests cheap.
- There's no per-user rate limiting built in (a single-person app doesn't
  usually need it) — if you ever share the Worker URL widely and worry
  about abuse, Cloudflare's dashboard has a free rate-limiting rule you can
  add without touching this code.
