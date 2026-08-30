import { describe, expect, it } from "vitest";
import { createDefaultTracker, nextExamDate, normalizeTracker } from "../src/data";

describe("tracker data", () => {
  it("defaults to the next January 19", () => {
    expect(nextExamDate(new Date(2026, 7, 30))).toBe("2027-01-19");
    expect(nextExamDate(new Date(2027, 0, 19, 8))).toBe("2027-01-19");
    expect(nextExamDate(new Date(2027, 0, 20))).toBe("2028-01-19");
  });

  it("starts with a 1000 km target and weekly practice goals", () => {
    const tracker = createDefaultTracker(new Date(2026, 7, 30));
    expect(tracker.settings).toMatchObject({
      examDate: "2027-01-19",
      kmGoal: 1000,
      weeklyPracticeGoal: 1,
      weeklyManoeuvreGoal: 1,
    });
  });

  it("drops malformed drives while keeping valid records", () => {
    const tracker = createDefaultTracker(new Date("2026-08-30T12:00:00Z"));
    const normalized = normalizeTracker({
      ...tracker,
      drives: [
        { id: "bad", date: "nope", distanceKm: -2 },
        {
          id: "good",
          date: "2026-08-30",
          distanceKm: 12.5,
          durationMinutes: 30,
          type: "functional",
          practicedManoeuvres: false,
          manoeuvreIds: [],
          updatedAt: "2026-08-30T12:00:00Z",
        },
      ],
    });
    expect(normalized.drives.map((drive) => drive.id)).toEqual(["good"]);
  });

  it("adds safe defaults to older routes and keeps valid route metadata", () => {
    const tracker = createDefaultTracker(new Date("2026-08-30T12:00:00Z"));
    const normalized = normalizeTracker({
      ...tracker,
      routes: [
        { id: "legacy", name: "Legacy loop", googleMapsUrl: "https://maps.google.com/legacy", createdAt: "2026-08-01T12:00:00Z" },
        { id: "known", name: "Known loop", googleMapsUrl: "https://maps.google.com/known", priorCompletions: 7, distanceKm: 18.4, durationMinutes: 42, createdAt: "2026-08-02T12:00:00Z", updatedAt: "2026-08-03T12:00:00Z" },
      ],
    });
    expect(normalized.routes[0]).toMatchObject({ id: "legacy", priorCompletions: 0, updatedAt: "2026-08-01T12:00:00Z" });
    expect(normalized.routes[1]).toMatchObject({ id: "known", priorCompletions: 7, distanceKm: 18.4, durationMinutes: 42 });
  });
});
