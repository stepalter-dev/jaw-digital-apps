/**
 * JAW Digital Almanac Chat Worker
 * ---------------------------------------------------------------------------
 * A tiny Cloudflare Worker that proxies chat requests from a static journal
 * (Fallout 76's Finder tab, and later others) to the Google Gemini API.
 *
 * WHY THIS EXISTS: the journals are static HTML/JS hosted on GitHub Pages.
 * An API key can never be embedded in that client-side code -- anyone who
 * views the page source could copy it and run up your bill. This Worker is
 * the one small piece of "real backend" that holds the key server-side; the
 * page only ever talks to this Worker's public URL, never to Google directly.
 *
 * SETUP: see README.md in this folder for the full step-by-step. Short
 * version: get a Gemini API key from https://aistudio.google.com/apikey,
 * save it as the GEMINI_API_KEY secret on this Worker, deploy.
 *
 * ENDPOINT: POST /chat
 *   body: { message: string, context?: string, history?: [{role, content}] }
 *   returns: { reply: string } on success, { error: string } on failure
 */

// Change this to your GitHub Pages origin once deployed, to stop other sites
// from riding on your API quota. "*" works for local testing.
const ALLOWED_ORIGIN = "https://stepalter-dev.github.io";

// Cheap, fast model -- plenty for a companion-app Q&A assistant. Override via
// the MODEL environment variable if you want a different one.
const DEFAULT_MODEL = "gemini-3.6-flash";
const MAX_TOKENS = 1536;
const MAX_MESSAGE_LEN = 2000;
const MAX_HISTORY_TURNS = 6; // last N turns kept, to bound token usage

const SYSTEM_PROMPT = `You are VERA (Vault-Tec Emergency Response Assistant), the in-app assistant
for "Vault Dweller's Almanac", a fan-made Fallout 76 companion journal built by JAW Digital. If
asked your name, you are VERA. You have two jobs:

1. Answer the player's Fallout 76 questions directly and helpfully -- weapons, perks, quests,
   events, crafting, lore, mechanics -- using your general knowledge of the game.
2. Help the person maintain the almanac itself: if they describe something (an item, a quest, a
   creature, a weapon) and ask "is this in the app" or "should this be added", tell them plainly
   whether it sounds like something the app's Finder search should already cover, and if not,
   suggest concretely what a new entry for it should say (name, category, a one-line description)
   so they can hand that straight to whoever maintains the app's code.

Answer directly -- start with the actual content, never with a preamble describing how you're
about to structure or format the reply. Keep answers concise and skimmable: short paragraphs or a
few markdown bullet points (lines starting with "- "), not walls of text, and use **bold** only
for names of perks/items/quests. Bethesda patches Fallout 76 constantly -- flag when something
you're saying might be stale or have changed with a recent update, rather than stating it with
false confidence.`;

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
    if (!env.GEMINI_API_KEY) {
      return json({ error: "Server misconfigured: GEMINI_API_KEY secret not set." }, 500, allowOrigin);
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

    // Gemini uses "user" / "model" roles (not "assistant") and a {parts:[{text}]} shape.
    const contents = history
      .filter(h => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string")
      .map(h => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content.slice(0, MAX_MESSAGE_LEN) }],
      }));
    contents.push({
      role: "user",
      parts: [{ text: context ? `[Context from the app: ${context}]\n\n${message}` : message }],
    });

    const model = env.MODEL || DEFAULT_MODEL;
    let geminiRes;
    try {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": env.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            generationConfig: { maxOutputTokens: MAX_TOKENS },
          }),
        }
      );
    } catch (e) {
      return json({ error: "Could not reach the Gemini API." }, 502, allowOrigin);
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      return json({ error: `Gemini API error (${geminiRes.status}): ${errText.slice(0, 300)}` }, 502, allowOrigin);
    }

    const data = await geminiRes.json();
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    const reply = parts.map(p => p.text || "").join("").trim() || "(no response)";
    return json({ reply }, 200, allowOrigin);
  },
};
