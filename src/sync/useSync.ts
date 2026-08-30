import { useCallback, useEffect, useRef, useState } from "react";
import type { SyncState, TrackerDocument } from "../types";
import { mergeTrackers, sameTracker } from "./merge";
import {
  pullTracker,
  pushTracker,
  storedSyncCode,
  syncAvailable,
  syncConfigured,
  SyncAuthError,
} from "./client";

const PUSH_DEBOUNCE_MS = 900;

export interface SyncApi {
  state: SyncState;
  message: string;
  run: (tracker: TrackerDocument) => Promise<void>;
  schedulePush: (tracker: TrackerDocument) => void;
  refresh: () => void;
}

export function useSync(tracker: TrackerDocument, onMerged: (tracker: TrackerDocument) => void): SyncApi {
  const [state, setState] = useState<SyncState>(syncConfigured() ? "idle" : "disabled");
  const [message, setMessage] = useState("");
  const running = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(tracker);
  latest.current = tracker;

  const refresh = useCallback(() => {
    setState(syncConfigured() ? "idle" : "disabled");
    setMessage("");
  }, []);

  const run = useCallback(async (current: TrackerDocument) => {
    const code = storedSyncCode();
    if (!syncAvailable() || !code || running.current) return;
    running.current = true;
    setState("syncing");
    try {
      const remote = await pullTracker(code);
      const merged = remote ? mergeTrackers(current, remote) : current;
      if (remote && !sameTracker(merged, current)) onMerged(merged);
      if (!remote || !sameTracker(merged, remote)) await pushTracker(code, merged);
      setState("synced");
      setMessage("");
    } catch (error) {
      if (error instanceof SyncAuthError) {
        setState("auth-error");
        setMessage(error.message);
      } else if (error instanceof TypeError) {
        setState("offline");
        setMessage("Offline — changes are safe on this device.");
      } else {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Sync failed.");
      }
    } finally { running.current = false; }
  }, [onMerged]);

  const schedulePush = useCallback((next: TrackerDocument) => {
    if (!syncConfigured()) return;
    latest.current = next;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void run(latest.current), PUSH_DEBOUNCE_MS);
  }, [run]);

  const enabled = state !== "disabled";

  useEffect(() => {
    if (!enabled || !syncConfigured()) return;
    void run(latest.current);
    const syncNow = () => { if (!document.hidden) void run(latest.current); };
    window.addEventListener("focus", syncNow);
    window.addEventListener("online", syncNow);
    document.addEventListener("visibilitychange", syncNow);
    return () => {
      window.removeEventListener("focus", syncNow);
      window.removeEventListener("online", syncNow);
      document.removeEventListener("visibilitychange", syncNow);
    };
  }, [run, enabled]);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { state, message, run, schedulePush, refresh };
}
