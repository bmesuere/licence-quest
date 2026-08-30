import { describe, expect, it } from "vitest";
import { createDefaultTracker } from "../src/data";
import { mergeTrackers } from "../src/sync/merge";

describe("cross-device merge", () => {
  it("keeps independent drives from both devices", () => {
    const base = createDefaultTracker(new Date("2026-08-01T12:00:00Z"));
    const local = { ...base, drives: [{ id: "a", date: "2026-08-20", distanceKm: 20, durationMinutes: 30, type: "practice" as const, practicedManoeuvres: false, manoeuvreIds: [], updatedAt: "2026-08-20T12:00:00Z" }] };
    const remote = { ...base, drives: [{ id: "b", date: "2026-08-21", distanceKm: 15, durationMinutes: 25, type: "functional" as const, practicedManoeuvres: false, manoeuvreIds: [], updatedAt: "2026-08-21T12:00:00Z" }] };
    expect(mergeTrackers(local, remote).drives.map((drive) => drive.id)).toEqual(["b", "a"]);
  });

  it("does not resurrect a deleted drive", () => {
    const base = createDefaultTracker(new Date("2026-08-01T12:00:00Z"));
    const record = { id: "a", date: "2026-08-20", distanceKm: 20, durationMinutes: 30, type: "practice" as const, practicedManoeuvres: false, manoeuvreIds: [], updatedAt: "2026-08-20T12:00:00Z" };
    const local = { ...base, drives: [], deletions: { a: "2026-08-22T12:00:00Z" } };
    const remote = { ...base, drives: [record] };
    expect(mergeTrackers(local, remote).drives).toHaveLength(0);
  });
});
