/**
 * JAW Digital Almanac Chat Worker
 * ---------------------------------------------------------------------------
 * A tiny Cloudflare Worker that proxies chat requests from a static journal
 * (Fallout 76's Finder tab, and later others) to the Anthropic API.
 *
 * WHY THIS EXISTS: the journals are static HTML/JS hosted on GitHub Pages.
 * An API key can never be embedded in that client-side code — anyone who
 * views the page source could copy it and run up your bill. This Worker is
 * the one small piece of "real backend" that holds the key server-side; the
 * page only ever talks to this Worker's public URL, never to Anthropic
 * directly.
 *
 * SETUP: see README.md in this folder for the full step-by-step. Short
 * version: `wrangler secret put ANTHROPIC_API_KEY`, then `wrangler deploy`.
 *
 * ENDPOINT: POST /chat
 *   body: { message: string, context?: string, history?: [{role, content}] }
 *   returns: { reply: string } on success, { error: string } on failure
 */

// Change this to your GitHub Pages origin once deployed, to stop other sites
// from riding on your API quota. "*" works for local testing.
const ALLOWED_ORIGIN = "https://stepalter-dev.github.io";

// Cheap, fast model — plenty for a companion-app Q&A assistant. Bump to a
// larger model in wrangler.toml's [vars] MODEL if you want smarter answers
// and don't mind the extra cost.
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 700;
const MAX_MESSAGE_LEN = 2000;
const MAX_HISTORY_TURNS = 6; // last N turns kept, to bound token usage

const SYSTEM_PROMPT = `You are the in-app assistant for "Vault Dweller's Almanac", a fan-made
Fallout 76 companion journal built by JAW Digital. You have two jobs:

1. Answer the player's Fallout 76 questions directly and helpfully — weapons, perks, quests,
   events, crafting, lore, mechanics — using your general knowledge of the game.
2. Help the person maintain the almanac itself: if they describe something (an item, a quest, a
   creature, a weapon) and ask "is this in the app" or "should this be added", tell them plainly
   whether it sounds like something the app's Finder search should already cover, and if not,
   suggest concretely what a new entry for it should say (name, category, a one-line description)
   so they can hand that straight to whoever maintains the app's code.

Keep answers concise and skimmable (short paragraphs or a few bullet points, not walls of text).
Bethesda patches Fallout 76 constantly — flag when something you're saying might be stale or
have changed with a recent update, rather than stating it with false confidence.`;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowOrigin = ALLOWED_ORIGIN === "*" || origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(allowOrigin) });
    }
    if (request.method !== "POST") {
      return json({ error: "POST only" }, 405, allowOrigin);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "Server misconfigured: ANTHROPIC_API_KEY secret not set." }, 500, allowOrigin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, 400, allowOrigin);
    }

    const message = (body.message || "").toString().slice(0, MAX_MESSAGE_LEN).trim();
    if (!message) return json({ error: "Empty message." }, 400, allowOrigin);

    const context = (body.context || "").toString().slice(0, 4000);
    const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_TURNS * 2) : [];

    const messages = history
      .filter(h => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
      .map(h => ({ role: h.role, content: h.content.slice(0, MAX_MESSAGE_LEN) }));
    messages.push({
      role: "user",
      content: context ? `[Context from the app: ${context}]\n\n${message}` : message,
    });

    let anthropicRes;
    try {
      anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: env.MODEL || DEFAULT_MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages,
        }),
      });
    } catch (e) {
      return json({ error: "Could not reach Anthropic API." }, 502, allowOrigin);
    }

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => "");
      return json({ error: `Anthropic API error (${anthropicRes.status}): ${errText.slice(0, 300)}` }, 502, allowOrigin);
    }

    const data = await anthropicRes.json();
    const reply = (data.content || []).map(b => b.text || "").join("").trim() || "(no response)";
    return json({ reply }, 200, allowOrigin);
  },
};
