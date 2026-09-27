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

  it("keeps routes added on another device when this device saved more recently", () => {
    const base = createDefaultTracker(new Date("2026-08-01T12:00:00Z"));
    const route = { id: "route-a", name: "Loop", googleMapsUrl: "https://maps.app.goo.gl/x", priorCompletions: 0, createdAt: "2026-08-20T12:00:00Z", updatedAt: "2026-08-20T12:00:00Z" };
    const remote = { ...base, routes: [route], updatedAt: "2026-08-20T12:00:00Z" };
    const local = { ...base, routes: [], updatedAt: "2026-08-25T12:00:00Z" };
    expect(mergeTrackers(local, remote).routes).toEqual([route]);
    expect(mergeTrackers(remote, local).routes).toEqual([route]);
  });

  it("keeps the newest version of an edited route", () => {
    const base = createDefaultTracker(new Date("2026-08-01T12:00:00Z"));
    const route = { id: "route-a", name: "Loop", googleMapsUrl: "https://maps.app.goo.gl/x", priorCompletions: 0, createdAt: "2026-08-20T12:00:00Z", updatedAt: "2026-08-20T12:00:00Z" };
    const edited = { ...route, name: "Renamed loop", updatedAt: "2026-08-22T12:00:00Z" };
    const local = { ...base, routes: [route], updatedAt: "2026-08-25T12:00:00Z" };
    const remote = { ...base, routes: [edited], updatedAt: "2026-08-22T12:00:00Z" };
    expect(mergeTrackers(local, remote).routes).toEqual([edited]);
  });

  it("does not resurrect deleted routes or manoeuvres", () => {
    const base = createDefaultTracker(new Date("2026-08-01T12:00:00Z"));
    const route = { id: "route-a", name: "Loop", googleMapsUrl: "https://maps.app.goo.gl/x", priorCompletions: 0, createdAt: "2026-08-20T12:00:00Z", updatedAt: "2026-08-20T12:00:00Z" };
    const [removed, ...kept] = base.manoeuvres;
    const local = { ...base, routes: [], manoeuvres: kept, deletions: { "route-a": "2026-08-22T12:00:00Z", [removed.id]: "2026-08-22T12:00:00Z" } };
    const remote = { ...base, routes: [route], updatedAt: "2026-08-30T12:00:00Z" };
    const merged = mergeTrackers(local, remote);
    expect(merged.routes).toHaveLength(0);
    expect(merged.manoeuvres.map((manoeuvre) => manoeuvre.id)).toEqual(kept.map((manoeuvre) => manoeuvre.id));
  });
});
