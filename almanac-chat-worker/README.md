# Almanac Chat Worker

A tiny Cloudflare Worker that holds your Gemini API key server-side and
proxies chat requests from the Fallout 76 journal's Finder tab (and later,
other journals). The journal itself is static HTML on GitHub Pages — it can
never safely hold an API key, so this Worker is the one small "backend"
piece that does.

You only need to do this once. It's free (both Google's and Cloudflare's
free tiers cover this kind of light personal-app traffic) and takes about
10 minutes.

## 1. Get a Gemini API key

1. Go to <https://aistudio.google.com/apikey> and sign in with a Google
   account.
2. Click **Create API key** and copy it somewhere safe.
3. Google AI Studio's free tier has a generous no-cost quota for a model
   like Gemini Flash — for a single-person companion app this typically
   costs nothing at all. If you outgrow the free tier, usage becomes
   pay-as-you-go on whatever billing you attach in Google AI Studio.

## 2. Get a free Cloudflare account

1. Go to <https://dash.cloudflare.com/sign-up> and create a free account
   (or sign in if you already have one).
2. No credit card is required for the Workers free tier at this scale.

## 3. Create the Worker and set the secret

**Using the Cloudflare dashboard (no command line needed):**

1. In the Cloudflare dashboard, go to **Workers & Pages → Create
   application → Start with Hello World!**, give it a name (e.g.
   `jaw-almanac-chat`), and deploy.
2. Open the new Worker → **Settings → Variables and secrets → Add
   variable**. Set the key to `GEMINI_API_KEY`, toggle **Secret**, and
   paste in the key from step 1. Save (this redeploys automatically).
3. Open **Edit code**, select all the placeholder code, and replace it
   with the contents of `worker.js` from this folder. Click **Deploy**.
4. Your Worker's URL is shown on its Overview page — it looks like:

   ```
   https://jaw-almanac-chat.<your-subdomain>.workers.dev
   ```

   **Copy that URL** — that's what you paste into the journal's chat panel
   settings (the "Worker URL" field) so the page knows where to send your
   questions.

**Using Wrangler (the CLI) instead, if you'd rather:**

```bash
npm install -g wrangler
wrangler login
wrangler secret put GEMINI_API_KEY
wrangler deploy
```

Wrangler will print the same kind of `workers.dev` URL at the end.

## 4. Lock it down to your site (optional but recommended)

Open `worker.js` and edit the list near the top:

```js
const ALLOWED_ORIGINS = [
  "https://stepalter-dev.github.io",
  "https://journals.bw8.dev",
];
```

to match wherever your journal is actually hosted (add every domain it's
served from -- e.g. keep the GitHub Pages URL even after moving to a custom
domain, in case you ever need it), then redeploy. This stops other websites
from quietly using your Worker (and your API quota) from their own pages.

## Updating later

Whenever you edit `worker.js`, just redeploy it (via **Edit code → Deploy**
in the dashboard, or `wrangler deploy` on the CLI) — no need to redo the
secret step unless the key itself changes.

## Costs & limits built in

- Each request is capped at 700 tokens of reply and ~2000 characters of
  input, and only the last few turns of conversation are sent, to keep
  individual requests cheap.
- There's no per-user rate limiting built in (a single-person app doesn't
  usually need it) — if you ever share the Worker URL widely and worry
  about abuse, Cloudflare's dashboard has a free rate-limiting rule you can
  add without touching this code.
