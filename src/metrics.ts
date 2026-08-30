import type { DriveRecord, PracticeRoute, TrackerDocument } from "./types";
import { localDateKey } from "./data";

const DAY_MS = 86_400_000;

function localNoon(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

export function daysUntil(dateKey: string, now = new Date()): number {
  const today = localNoon(localDateKey(now));
  return Math.max(0, Math.round((localNoon(dateKey).getTime() - today.getTime()) / DAY_MS));
}

export function weekStartKey(now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return localDateKey(date);
}

export function drivesThisWeek(drives: DriveRecord[], now = new Date()): DriveRecord[] {
  const start = weekStartKey(now);
  return drives.filter((drive) => drive.date >= start && drive.date <= localDateKey(now));
}

export function totalKm(drives: DriveRecord[]): number {
  return drives.reduce((sum, drive) => sum + drive.distanceKm, 0);
}

export function routeCounts(tracker: TrackerDocument): Map<string, number> {
  const counts = new Map(tracker.routes.map((route) => [route.id, route.priorCompletions]));
  for (const drive of tracker.drives) {
    if (drive.routeId) counts.set(drive.routeId, (counts.get(drive.routeId) ?? 0) + 1);
  }
  return counts;
}

export interface RouteMetadata {
  distanceKm?: number;
  durationMinutes?: number;
  distanceSource?: "manual" | "average";
  durationSource?: "manual" | "average";
  loggedDriveCount: number;
}

export function routeMetadata(tracker: TrackerDocument, route: PracticeRoute): RouteMetadata {
  const drives = tracker.drives.filter((drive) => drive.routeId === route.id);
  return {
    distanceKm: route.distanceKm ?? (drives.length > 0 ? drives.reduce((sum, drive) => sum + drive.distanceKm, 0) / drives.length : undefined),
    durationMinutes: route.durationMinutes ?? (drives.length > 0 ? drives.reduce((sum, drive) => sum + drive.durationMinutes, 0) / drives.length : undefined),
    distanceSource: route.distanceKm !== undefined ? "manual" : drives.length > 0 ? "average" : undefined,
    durationSource: route.durationMinutes !== undefined ? "manual" : drives.length > 0 ? "average" : undefined,
    loggedDriveCount: drives.length,
  };
}

export interface PaceStatus {
  totalKm: number;
  expectedKm: number;
  percent: number;
  deltaKm: number;
  onTrack: boolean;
  weeklyKmNeeded: number;
}

export function paceStatus(tracker: TrackerDocument, now = new Date()): PaceStatus {
  const driven = totalKm(tracker.drives);
  const created = new Date(tracker.createdAt);
  const start = localNoon(localDateKey(created));
  const today = localNoon(localDateKey(now));
  const exam = localNoon(tracker.settings.examDate);
  const totalDuration = Math.max(DAY_MS, exam.getTime() - start.getTime());
  const elapsed = Math.max(0, Math.min(totalDuration, today.getTime() - start.getTime()));
  const expected = tracker.settings.kmGoal * (elapsed / totalDuration);
  const remainingWeeks = Math.max(1 / 7, (exam.getTime() - today.getTime()) / (7 * DAY_MS));
  return {
    totalKm: driven,
    expectedKm: expected,
    percent: Math.min(100, (driven / tracker.settings.kmGoal) * 100),
    deltaKm: driven - expected,
    onTrack: driven + 0.05 >= expected,
    weeklyKmNeeded: Math.max(0, tracker.settings.kmGoal - driven) / remainingWeeks,
  };
}

export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder} min`;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}
