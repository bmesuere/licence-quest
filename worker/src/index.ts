export interface SyncStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DRIVING_SYNC: SyncStore;
  ALLOWED_ORIGINS: string;
  /** SHA-256 hex digest of the only sync code allowed to use this Worker. */
  SYNC_CODE_HASH?: string;
  WRITE_RATE_LIMITER: RateLimit;
}

const MAX_PAYLOAD_BYTES = 1_000_000;
const DOCUMENT_KEY = "doc:primary";

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());
  if (!allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function bearerToken(request: Request): string | undefined {
  return /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("Authorization") ?? "")?.[1];
}

async function sha256Hex(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (new URL(request.url).pathname !== "/doc") return json({ error: "Not found" }, 404, cors);
    if (Object.keys(cors).length === 0) return json({ error: "Origin not allowed" }, 403, {});
    const token = bearerToken(request);
    if (!token) return json({ error: "Missing or malformed sync code" }, 401, cors);

    const configuredHash = env.SYNC_CODE_HASH?.trim().toLowerCase();
    if (!configuredHash || !/^[0-9a-f]{64}$/.test(configuredHash)) {
      return json({ error: "Sync is not configured" }, 503, cors);
    }
    if (!constantTimeEqual(await sha256Hex(token), configuredHash)) {
      return json({ error: "Sync code rejected" }, 401, cors);
    }

    if (request.method === "GET") {
      const payload = await env.DRIVING_SYNC.get(DOCUMENT_KEY);
      return payload === null ? json({ error: "No document stored" }, 404, cors) : new Response(payload, { status: 200, headers: { "Content-Type": "application/json", ...cors } });
    }
    if (request.method === "PUT") {
      const { success } = await env.WRITE_RATE_LIMITER.limit({ key: DOCUMENT_KEY });
      if (!success) return json({ error: "Too many sync updates" }, 429, cors);

      const payload = await request.text();
      if (!payload) return json({ error: "Missing payload" }, 400, cors);
      if (new TextEncoder().encode(payload).byteLength > MAX_PAYLOAD_BYTES) return json({ error: "Payload too large" }, 413, cors);
      try { JSON.parse(payload); } catch { return json({ error: "Body must be JSON" }, 400, cors); }
      await env.DRIVING_SYNC.put(DOCUMENT_KEY, payload);
      return json({ ok: true }, 200, cors);
    }
    return json({ error: "Method not allowed" }, 405, cors);
  },
};
