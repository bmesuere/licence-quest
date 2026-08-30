import { describe, expect, it } from "vitest";
import { createDefaultTracker } from "../src/data";
import { daysUntil, drivesThisWeek, paceStatus, weekStartKey } from "../src/metrics";
import type { DriveRecord } from "../src/types";

function drive(date: string, distanceKm = 20): DriveRecord {
  return {
    id: `drive-${date}`,
    date,
    distanceKm,
    durationMinutes: 45,
    type: "practice",
    practicedManoeuvres: false,
    manoeuvreIds: [],
    updatedAt: `${date}T12:00:00.000Z`,
  };
}

describe("calendar metrics", () => {
  it("counts calendar days to the exam", () => {
    expect(daysUntil("2027-01-19", new Date("2026-08-30T22:00:00+02:00"))).toBe(142);
    expect(daysUntil("2026-08-29", new Date("2026-08-30T12:00:00+02:00"))).toBe(0);
  });

  it("starts weeks on Monday and filters the current week", () => {
    const now = new Date(2026, 7, 30, 12);
    expect(weekStartKey(now)).toBe("2026-08-24");
    expect(drivesThisWeek([drive("2026-08-23"), drive("2026-08-24"), drive("2026-08-30")], now)).toHaveLength(2);
  });
});

describe("kilometre pace", () => {
  it("compares completed kilometres with elapsed time", () => {
    const tracker = createDefaultTracker(new Date("2026-01-01T12:00:00Z"));
    tracker.settings.examDate = "2026-01-11";
    tracker.settings.kmGoal = 100;
    tracker.drives = [drive("2026-01-03", 60)];
    const status = paceStatus(tracker, new Date("2026-01-06T12:00:00Z"));
    expect(status.expectedKm).toBeCloseTo(50);
    expect(status.totalKm).toBe(60);
    expect(status.onTrack).toBe(true);
    expect(status.deltaKm).toBeCloseTo(10);
  });
});
