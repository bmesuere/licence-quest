import type {
  DriveRecord,
  Manoeuvre,
  PracticeRoute,
  TrackerDocument,
} from "./types";

export const STORAGE_KEY = "licence-quest.tracker.v1";
const LEGACY_STORAGE_KEY = "road-to-ready.tracker.v1";
export const SCHEMA_VERSION = 1;
const DELETION_RETENTION_DAYS = 180;

export const FLANDERS_MANOEUVRES = [
  { id: "flanders-parallel-right", group: 1 as const, name: "Parallel parking on the right between two vehicles" },
  { id: "flanders-parallel-left", group: 1 as const, name: "Parallel parking on the left between two vehicles" },
  { id: "flanders-perpendicular-reverse", group: 1 as const, name: "Reverse into a perpendicular parking space" },
  { id: "flanders-perpendicular-forward", group: 2 as const, name: "Drive forward into a perpendicular parking space" },
  { id: "flanders-reverse-straight", group: 2 as const, name: "Reverse in a straight line" },
  { id: "flanders-turn-narrow-street", group: 2 as const, name: "Turn around in a narrow street" },
] as const;

export function createFlandersManoeuvres(timestamp = new Date().toISOString()): Manoeuvre[] {
  return FLANDERS_MANOEUVRES.map((manoeuvre) => ({ ...manoeuvre, createdAt: timestamp }));
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function nextExamDate(now = new Date()): string {
  const year = now.getFullYear();
  const candidate = new Date(year, 0, 19, 12);
  if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0)) {
    candidate.setFullYear(year + 1);
  }
  return localDateKey(candidate);
}

export function createDefaultTracker(now = new Date()): TrackerDocument {
  const timestamp = now.toISOString();
  return {
    version: SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    drives: [],
    deletions: {},
    routes: [],
    manoeuvres: createFlandersManoeuvres(timestamp),
    settings: {
      examDate: nextExamDate(now),
      kmGoal: 1000,
      weeklyPracticeGoal: 1,
      weeklyManoeuvreGoal: 1,
    },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeDrives(value: unknown, fallbackTimestamp: string): DriveRecord[] {
  if (!Array.isArray(value)) return [];
  const records = new Map<string, DriveRecord>();
  for (const item of value) {
    if (!isObject(item)) continue;
    if (
      typeof item.id !== "string" ||
      !isDateKey(item.date) ||
      !isFiniteNumber(item.distanceKm) ||
      item.distanceKm < 0 ||
      item.distanceKm > 1000 ||
      !isFiniteNumber(item.durationMinutes) ||
      item.durationMinutes < 0 ||
      item.durationMinutes > 1440 ||
      !["functional", "practice", "manoeuvres"].includes(String(item.type))
    ) continue;
    records.set(item.id, {
      id: item.id,
      date: item.date,
      distanceKm: item.distanceKm,
      durationMinutes: item.durationMinutes,
      type: item.type as DriveRecord["type"],
      routeId: typeof item.routeId === "string" ? item.routeId : undefined,
      practicedManoeuvres: Boolean(item.practicedManoeuvres),
      manoeuvreIds: Array.isArray(item.manoeuvreIds)
        ? item.manoeuvreIds.filter((id): id is string => typeof id === "string")
        : [],
      notes: typeof item.notes === "string" ? item.notes.slice(0, 500) : undefined,
      updatedAt: isTimestamp(item.updatedAt) ? item.updatedAt : fallbackTimestamp,
    });
  }
  return [...records.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function normalizeNamedList<T extends PracticeRoute | Manoeuvre>(
  value: unknown,
  kind: "route" | "manoeuvre",
): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): T[] => {
    if (!isObject(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
    const common = {
      id: item.id,
      name: item.name.trim().slice(0, 100),
      createdAt: isTimestamp(item.createdAt) ? item.createdAt : new Date().toISOString(),
    };
    if (!common.name) return [];
    if (kind === "route") {
      if (typeof item.googleMapsUrl !== "string") return [];
      try {
        const url = new URL(item.googleMapsUrl);
        if (!/^https?:$/.test(url.protocol)) return [];
      } catch { return []; }
      const priorCompletions = isFiniteNumber(item.priorCompletions) && item.priorCompletions >= 0
        ? Math.min(10_000, Math.round(item.priorCompletions))
        : 0;
      const distanceKm = isFiniteNumber(item.distanceKm) && item.distanceKm > 0 && item.distanceKm <= 1000
        ? item.distanceKm
        : undefined;
      const durationMinutes = isFiniteNumber(item.durationMinutes) && item.durationMinutes > 0 && item.durationMinutes <= 1440
        ? Math.round(item.durationMinutes)
        : undefined;
      return [{
        ...common,
        googleMapsUrl: item.googleMapsUrl,
        priorCompletions,
        distanceKm,
        durationMinutes,
        updatedAt: isTimestamp(item.updatedAt) ? item.updatedAt : common.createdAt,
      } as T];
    }
    return [{ ...common, group: item.group === 1 || item.group === 2 ? item.group : undefined } as T];
  });
}

export function normalizeTracker(value: unknown): TrackerDocument {
  if (!isObject(value) || value.version !== SCHEMA_VERSION) {
    throw new Error("This file does not contain supported Licence Quest data.");
  }
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  const fallback = isTimestamp(value.updatedAt) ? value.updatedAt : timestamp;
  const settings = isObject(value.settings) ? value.settings : {};
  const deletionHorizon = now - DELETION_RETENTION_DAYS * 86_400_000;
  const deletions = isObject(value.deletions)
    ? Object.fromEntries(Object.entries(value.deletions).filter(
        ([id, stamp]) => id && isTimestamp(stamp) && Date.parse(stamp) >= deletionHorizon,
      )) as Record<string, string>
    : {};
  return {
    version: SCHEMA_VERSION,
    createdAt: isTimestamp(value.createdAt) ? value.createdAt : timestamp,
    updatedAt: fallback,
    drives: normalizeDrives(value.drives, fallback).filter(
      (drive) => !deletions[drive.id] || Date.parse(drive.updatedAt) > Date.parse(deletions[drive.id]),
    ),
    deletions,
    routes: normalizeNamedList<PracticeRoute>(value.routes, "route"),
    manoeuvres: normalizeNamedList<Manoeuvre>(value.manoeuvres, "manoeuvre"),
    settings: {
      examDate: isDateKey(settings.examDate) ? settings.examDate : nextExamDate(),
      kmGoal: isFiniteNumber(settings.kmGoal) && settings.kmGoal > 0 ? settings.kmGoal : 1000,
      weeklyPracticeGoal: isFiniteNumber(settings.weeklyPracticeGoal) && settings.weeklyPracticeGoal >= 0 ? Math.round(settings.weeklyPracticeGoal) : 1,
      weeklyManoeuvreGoal: isFiniteNumber(settings.weeklyManoeuvreGoal) && settings.weeklyManoeuvreGoal >= 0 ? Math.round(settings.weeklyManoeuvreGoal) : 1,
    },
  };
}

export function loadTracker(): TrackerDocument {
  const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return createDefaultTracker();
  try { return normalizeTracker(JSON.parse(raw)); }
  catch { return createDefaultTracker(); }
}

export function saveTracker(tracker: TrackerDocument): TrackerDocument {
  const saved = { ...tracker, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  return saved;
}

export function parseTracker(raw: string): TrackerDocument {
  try { return normalizeTracker(JSON.parse(raw)); }
  catch (error) {
    throw new Error(error instanceof Error ? error.message : "That data could not be read.");
  }
}

export function trackerToJson(tracker: TrackerDocument): string {
  return `${JSON.stringify(tracker, null, 2)}\n`;
}
