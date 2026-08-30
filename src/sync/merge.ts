import type { DriveRecord, TrackerDocument } from "../types";

function newest<T extends { updatedAt: string }>(left: T, right: T): T {
  return Date.parse(left.updatedAt) >= Date.parse(right.updatedAt) ? left : right;
}

export function mergeTrackers(local: TrackerDocument, remote: TrackerDocument): TrackerDocument {
  const base = newest(local, remote);
  const records = new Map<string, DriveRecord>();
  for (const drive of [...local.drives, ...remote.drives]) {
    const existing = records.get(drive.id);
    records.set(drive.id, existing ? newest(existing, drive) : drive);
  }
  const deletions: Record<string, string> = { ...local.deletions };
  for (const [id, stamp] of Object.entries(remote.deletions)) {
    if (!deletions[id] || Date.parse(stamp) > Date.parse(deletions[id])) deletions[id] = stamp;
  }
  const drives = [...records.values()].filter((drive) => {
    const deletedAt = deletions[drive.id];
    return !deletedAt || Date.parse(drive.updatedAt) > Date.parse(deletedAt);
  }).sort((a, b) => b.date.localeCompare(a.date));
  return { ...base, drives, deletions, updatedAt: newest(local, remote).updatedAt };
}

export function sameTracker(left: TrackerDocument, right: TrackerDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
