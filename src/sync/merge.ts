import type { TrackerDocument } from "../types";

function newest<T extends { updatedAt: string }>(left: T, right: T): T {
  return Date.parse(left.updatedAt) >= Date.parse(right.updatedAt) ? left : right;
}

/** Merges two lists record by record, dropping records deleted after their last change. */
function mergeRecords<T extends { id: string }>(
  local: T[],
  remote: T[],
  deletions: Record<string, string>,
  changedAt: (record: T) => string,
): T[] {
  const records = new Map<string, T>();
  for (const record of [...local, ...remote]) {
    const existing = records.get(record.id);
    records.set(record.id, existing && Date.parse(changedAt(existing)) >= Date.parse(changedAt(record)) ? existing : record);
  }
  return [...records.values()].filter((record) => {
    const deletedAt = deletions[record.id];
    return !deletedAt || Date.parse(changedAt(record)) > Date.parse(deletedAt);
  });
}

export function mergeTrackers(local: TrackerDocument, remote: TrackerDocument): TrackerDocument {
  const base = newest(local, remote);
  const deletions: Record<string, string> = { ...local.deletions };
  for (const [id, stamp] of Object.entries(remote.deletions)) {
    if (!deletions[id] || Date.parse(stamp) > Date.parse(deletions[id])) deletions[id] = stamp;
  }
  const drives = mergeRecords(local.drives, remote.drives, deletions, (drive) => drive.updatedAt)
    .sort((a, b) => b.date.localeCompare(a.date));
  const routes = mergeRecords(local.routes, remote.routes, deletions, (route) => route.updatedAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const manoeuvres = mergeRecords(local.manoeuvres, remote.manoeuvres, deletions, (manoeuvre) => manoeuvre.createdAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { ...base, drives, routes, manoeuvres, deletions, updatedAt: base.updatedAt };
}

export function sameTracker(left: TrackerDocument, right: TrackerDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
