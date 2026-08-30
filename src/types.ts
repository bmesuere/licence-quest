export type DriveType = "functional" | "practice" | "manoeuvres";

export interface DriveRecord {
  id: string;
  date: string;
  distanceKm: number;
  durationMinutes: number;
  type: DriveType;
  routeId?: string;
  practicedManoeuvres: boolean;
  manoeuvreIds: string[];
  notes?: string;
  updatedAt: string;
}

export interface PracticeRoute {
  id: string;
  name: string;
  googleMapsUrl: string;
  priorCompletions: number;
  distanceKm?: number;
  durationMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Manoeuvre {
  id: string;
  name: string;
  createdAt: string;
}

export interface TrackerSettings {
  examDate: string;
  kmGoal: number;
  weeklyPracticeGoal: number;
  weeklyManoeuvreGoal: number;
}

export interface TrackerDocument {
  version: 1;
  createdAt: string;
  updatedAt: string;
  drives: DriveRecord[];
  deletions: Record<string, string>;
  routes: PracticeRoute[];
  manoeuvres: Manoeuvre[];
  settings: TrackerSettings;
}

export type SyncState =
  | "disabled"
  | "idle"
  | "syncing"
  | "synced"
  | "offline"
  | "auth-error"
  | "error";
