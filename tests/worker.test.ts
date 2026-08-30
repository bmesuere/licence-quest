import { beforeAll, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../worker/src/index";

const SYNC_CODE = "ab".repeat(32);
let syncCodeHash = "";

beforeAll(async () => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(SYNC_CODE),
  );
  syncCodeHash = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
});

function request(code: string, method: "GET" | "PUT" = "GET"): Request {
  return new Request("https://sync.example/doc", {
    method,
    headers: {
      Authorization: `Bearer ${code}`,
      "Content-Type": "application/json",
      Origin: "https://bmesuere.github.io",
    },
    body: method === "PUT" ? JSON.stringify({ version: 1 }) : undefined,
  });
}

function environment(rateLimitSuccess = true) {
  const get = vi.fn(async () => null);
  const put = vi.fn(async () => undefined);
  const limit = vi.fn(async () => ({ success: rateLimitSuccess }));
  const env: Env = {
    DRIVING_SYNC: { get, put },
    ALLOWED_ORIGINS: "https://bmesuere.github.io",
    SYNC_CODE_HASH: syncCodeHash,
    WRITE_RATE_LIMITER: { limit },
  };
  return { env, get, put, limit };
}

describe("sync Worker protection", () => {
  it("rejects invented sync codes before touching KV", async () => {
    const { env, get, put, limit } = environment();
    const response = await worker.fetch(request("cd".repeat(32)), env);
    expect(response.status).toBe(401);
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(limit).not.toHaveBeenCalled();
  });

  it("always stores authorised data under one fixed key", async () => {
    const { env, put, limit } = environment();
    const response = await worker.fetch(request(SYNC_CODE, "PUT"), env);
    expect(response.status).toBe(200);
    expect(limit).toHaveBeenCalledWith({ key: "doc:primary" });
    expect(put).toHaveBeenCalledWith("doc:primary", JSON.stringify({ version: 1 }));
  });

  it("rate limits authorised writes", async () => {
    const { env, put } = environment(false);
    const response = await worker.fetch(request(SYNC_CODE, "PUT"), env);
    expect(response.status).toBe(429);
    expect(put).not.toHaveBeenCalled();
  });
});
