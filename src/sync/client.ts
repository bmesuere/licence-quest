import { parseTracker, trackerToJson } from "../data";
import type { TrackerDocument } from "../types";

export const SYNC_ENDPOINT: string = (import.meta.env.VITE_SYNC_ENDPOINT ?? "").replace(/\/$/, "");
const CODE_KEY = "licence-quest.sync.code";
const LAST_SYNC_KEY = "licence-quest.sync.last-success";
const LEGACY_CODE_KEY = "road-to-ready.sync.code";
const LEGACY_LAST_SYNC_KEY = "road-to-ready.sync.last-success";

export function syncAvailable(): boolean { return SYNC_ENDPOINT !== ""; }
export function syncConfigured(): boolean { return syncAvailable() && Boolean(storedSyncCode()); }
export function storedSyncCode(): string | undefined { return localStorage.getItem(CODE_KEY) ?? localStorage.getItem(LEGACY_CODE_KEY) ?? undefined; }
export function storeSyncCode(code: string): void { localStorage.setItem(CODE_KEY, normalizeSyncCode(code)); }
export function forgetSyncCode(): void { localStorage.removeItem(CODE_KEY); localStorage.removeItem(LAST_SYNC_KEY); localStorage.removeItem(LEGACY_CODE_KEY); localStorage.removeItem(LEGACY_LAST_SYNC_KEY); }
export function lastSyncTime(): string | undefined { return localStorage.getItem(LAST_SYNC_KEY) ?? localStorage.getItem(LEGACY_LAST_SYNC_KEY) ?? undefined; }

export function normalizeSyncCode(code: string): string {
  return code.toLowerCase().replace(/[^0-9a-f]/g, "");
}

export function isValidSyncCode(code: string): boolean {
  return /^[0-9a-f]{64}$/.test(normalizeSyncCode(code));
}

export function formatSyncCode(code: string): string {
  return normalizeSyncCode(code).match(/.{1,8}/g)?.join("-") ?? "";
}

export function generateSyncCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class SyncAuthError extends Error {}

async function request(code: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${SYNC_ENDPOINT}/doc`, {
    ...init,
    cache: "no-store",
    headers: { ...init?.headers, Authorization: `Bearer ${normalizeSyncCode(code)}` },
  });
  if (response.status === 401 || response.status === 403) throw new SyncAuthError("The sync server rejected this code.");
  if (!response.ok && response.status !== 404) throw new Error(`The sync server replied with ${response.status}.`);
  return response;
}

export async function pullTracker(code: string): Promise<TrackerDocument | undefined> {
  const response = await request(code);
  if (response.status === 404) return undefined;
  const payload = await response.text();
  return parseTracker(payload);
}

export async function pushTracker(code: string, tracker: TrackerDocument): Promise<void> {
  await request(code, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: trackerToJson(tracker),
  });
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}
