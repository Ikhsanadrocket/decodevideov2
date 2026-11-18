// Cloudflare Worker (Static Assets): UI statis dari /public + proxy aman ke Claude API.
// API key tidak pernah sampai ke browser.
const J = { "content-type": "application/json" };
const err = (message, status) => new Response(JSON.stringify({ error: { message } }), { status, headers: J });

async function analyze(request, env) {
  if (!env.APP_PASSWORD || !env.ANTHROPIC_API_KEY) return err("Secret belum diset di Worker", 500);
  if (request.headers.get("x-app-key") !== env.APP_PASSWORD) return err("Kata sandi salah", 401);
  let body;
  try { body = await request.json(); } catch { return err("JSON tidak valid", 400); }
  const { system, content, max_tokens } = body;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { ...J, "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: env.MODEL || "claude-sonnet-5-5",
      max_tokens: Math.min(+max_tokens || 1500, 4000),
      system,
      messages: [{ role: "user", content }],
    }),
  });
  return new Response(await r.text(), { status: r.status, headers: J });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/analyze") {
      return request.method === "POST" ? analyze(request, env) : err("Method not allowed", 405);
    }
    return env.ASSETS.fetch(request); // file statis
  },
};
