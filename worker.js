// Servidor intermedio para Eco (Cloudflare Workers).
// Guarda tu clave de la API en el Worker, nunca en la página.
//
// 1. Cambia ALLOWED_ORIGIN por tu dirección de GitHub Pages (sin barra final).
// 2. En el Worker: Settings > Variables and Secrets > añade ANTHROPIC_API_KEY como secreto.

const ALLOWED_ORIGIN = "https://TU-USUARIO.github.io";
const MODEL = "claude-sonnet-5-5";

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type",
      "Vary": "Origin",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...cors, "content-type": "application/json" },
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST" || request.headers.get("Origin") !== ALLOWED_ORIGIN) {
      return json({ error: "No permitido" }, 403);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "JSON inválido" }, 400);
    }

    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .slice(-30)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 8000),
      }))
      .filter((m) => m.content);
    while (messages.length && messages[0].role === "assistant") messages.shift();
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return json({ error: "Mensajes inválidos" }, 400);
    }
    const system = String(body.system || "").slice(0, 2000);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, messages }),
    });
    if (!r.ok) return json({ error: "Error del modelo" }, r.status === 429 ? 429 : 502);

    const data = await r.json();
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return json({ text, truncated: data.stop_reason === "max_tokens" });
  },
};
