import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadTracker, localDateKey, normalizeTracker, saveTracker, trackerToJson } from "./data";
import { daysUntil, drivesThisWeek, durationLabel, paceStatus, routeCounts, routeMetadata } from "./metrics";
import {
  forgetSyncCode,
  formatSyncCode,
  generateSyncCode,
  isValidSyncCode,
  lastSyncTime,
  normalizeSyncCode,
  storeSyncCode,
  storedSyncCode,
  syncAvailable,
} from "./sync/client";
import { useSync } from "./sync/useSync";
import type { DriveRecord, DriveType, TrackerDocument } from "./types";

type View = "dashboard" | "logbook" | "garage" | "settings";

const DRIVE_LABELS: Record<DriveType, string> = {
  functional: "Functional",
  practice: "Practice",
  manoeuvres: "Manoeuvres",
};

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatDate(dateKey: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", options ?? { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${dateKey}T12:00:00`));
}

function optionalPositiveNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function routeMetadataSummary(metadata: ReturnType<typeof routeMetadata>): string | undefined {
  const parts: string[] = [];
  if (metadata.distanceKm !== undefined) parts.push(`${metadata.distanceSource === "average" ? "Avg " : ""}${metadata.distanceKm.toFixed(1)} km`);
  if (metadata.durationMinutes !== undefined) parts.push(`${metadata.durationSource === "average" ? "Avg " : ""}${durationLabel(Math.round(metadata.durationMinutes))}`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function App() {
  const [tracker, setTracker] = useState(loadTracker);
  const [view, setView] = useState<View>("dashboard");
  const [toast, setToast] = useState("");
  const [suggestedRouteId, setSuggestedRouteId] = useState<string>();
  const [rouletteSpinning, setRouletteSpinning] = useState(false);
  const [rouletteRound, setRouletteRound] = useState(0);
  const [prefilledRouteId, setPrefilledRouteId] = useState<string>();
  const rouletteTimer = useRef<number | undefined>(undefined);

  const applyMerged = useCallback((merged: TrackerDocument) => setTracker(saveTracker(merged)), []);
  const sync = useSync(tracker, applyMerged);
  const commit = useCallback((next: TrackerDocument) => {
    const saved = saveTracker(next);
    setTracker(saved);
    sync.schedulePush(saved);
  }, [sync]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => current === message ? "" : current), 3600);
  };

  const week = drivesThisWeek(tracker.drives);
  const practiceCount = week.filter((drive) => drive.type === "practice").length;
  const manoeuvreCount = week.filter((drive) => drive.practicedManoeuvres || drive.type === "manoeuvres").length;
  const pace = paceStatus(tracker);
  const countdown = daysUntil(tracker.settings.examDate);
  const counts = routeCounts(tracker);
  const suggestedRoute = tracker.routes.find((route) => route.id === suggestedRouteId);

  useEffect(() => () => window.clearTimeout(rouletteTimer.current), []);

  function chooseRandomRoute() {
    if (rouletteSpinning) return;
    if (tracker.routes.length === 0) {
      setView("garage");
      flash("Add your first route before spinning the route box.");
      return;
    }
    const alternatives = tracker.routes.filter((route) => route.id !== suggestedRouteId);
    const pool = alternatives.length > 0 ? alternatives : tracker.routes;
    setRouletteSpinning(true);
    rouletteTimer.current = window.setTimeout(() => {
      const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
      setSuggestedRouteId(pool[Math.floor(random * pool.length)].id);
      setRouletteRound((round) => round + 1);
      setRouletteSpinning(false);
    }, 700);
  }

  function useSuggestedRoute() {
    if (!suggestedRoute) return;
    setPrefilledRouteId(suggestedRoute.id);
    document.getElementById("log-drive")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function saveDrive(drive: Omit<DriveRecord, "id" | "updatedAt">) {
    const stamp = new Date().toISOString();
    commit({ ...tracker, drives: [{ ...drive, id: id("drive"), updatedAt: stamp }, ...tracker.drives] });
    setPrefilledRouteId(undefined);
    flash("Drive logged — another lap closer to ready!");
  }

  function deleteDrive(drive: DriveRecord) {
    if (!window.confirm(`Delete the ${formatDate(drive.date)} drive?`)) return;
    const stamp = new Date().toISOString();
    commit({
      ...tracker,
      drives: tracker.drives.filter((item) => item.id !== drive.id),
      deletions: { ...tracker.deletions, [drive.id]: stamp },
    });
    flash("Drive removed from the logbook.");
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setView("dashboard")}>
          <span className="brand-badge" aria-hidden="true"><WheelIcon /></span>
          <span><strong>LICENCE QUEST</strong><small>Train · Track · Pass</small></span>
        </button>
        <nav aria-label="Primary navigation">
          <NavButton active={view === "dashboard"} onClick={() => setView("dashboard")} icon={<HomeIcon />}>Home</NavButton>
          <NavButton active={view === "logbook"} onClick={() => setView("logbook")} icon={<FlagIcon />}>Logbook</NavButton>
          <NavButton active={view === "garage"} onClick={() => setView("garage")} icon={<MapIcon />}>Garage</NavButton>
          <NavButton active={view === "settings"} onClick={() => setView("settings")} icon={<CogIcon />}>Settings</NavButton>
        </nav>
        {sync.state !== "disabled" && (
          <button className={`sync-pill ${sync.state}`} type="button" onClick={() => setView("settings")}> 
            <span />{sync.state === "syncing" ? "Syncing" : sync.state === "synced" ? "Synced" : "Sync"}
          </button>
        )}
      </header>

      <main id="main" tabIndex={-1}>
        {view === "dashboard" && (
          <Dashboard
            tracker={tracker}
            countdown={countdown}
            pace={pace}
            practiceCount={practiceCount}
            manoeuvreCount={manoeuvreCount}
            suggestedRoute={suggestedRoute}
            routeCount={suggestedRoute ? counts.get(suggestedRoute.id) ?? 0 : 0}
            rouletteSpinning={rouletteSpinning}
            rouletteRound={rouletteRound}
            onRandomRoute={chooseRandomRoute}
            onUseRoute={useSuggestedRoute}
            onViewLogbook={() => setView("logbook")}
            onManageRoutes={() => setView("garage")}
          />
        )}
        {view === "dashboard" && (
          <DriveForm
            key={prefilledRouteId ?? "fresh"}
            tracker={tracker}
            routeId={prefilledRouteId}
            onSave={saveDrive}
          />
        )}
        {view === "logbook" && <Logbook tracker={tracker} onDelete={deleteDrive} />}
        {view === "garage" && <Garage tracker={tracker} counts={counts} onCommit={commit} flash={flash} />}
        {view === "settings" && <Settings tracker={tracker} onCommit={commit} sync={sync} flash={flash} />}
      </main>

      {toast && <div className="toast" role="status"><span aria-hidden="true">★</span>{toast}<button type="button" onClick={() => setToast("")} aria-label="Dismiss notification">×</button></div>}
      <footer><span><WheelIcon /> Licence Quest</span><p>Small drives. Big finish.</p></footer>
    </div>
  );
}

function Dashboard({
  tracker, countdown, pace, practiceCount, manoeuvreCount, suggestedRoute, routeCount,
  rouletteSpinning, rouletteRound, onRandomRoute, onUseRoute, onViewLogbook, onManageRoutes,
}: {
  tracker: TrackerDocument;
  countdown: number;
  pace: ReturnType<typeof paceStatus>;
  practiceCount: number;
  manoeuvreCount: number;
  suggestedRoute?: TrackerDocument["routes"][number];
  routeCount: number;
  rouletteSpinning: boolean;
  rouletteRound: number;
  onRandomRoute: () => void;
  onUseRoute: () => void;
  onViewLogbook: () => void;
  onManageRoutes: () => void;
}) {
  const practiceDone = practiceCount >= tracker.settings.weeklyPracticeGoal;
  const manoeuvreDone = manoeuvreCount >= tracker.settings.weeklyManoeuvreGoal;
  const suggestedMetadata = suggestedRoute ? routeMetadata(tracker, suggestedRoute) : undefined;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker"><span>★</span> Next checkpoint</p>
          <h1>{countdown === 0 ? "Exam day is here!" : <><strong>{countdown}</strong> days to<br />the starting line.</>}</h1>
          <p>Your practical exam is <b>{formatDate(tracker.settings.examDate, { weekday: "long", day: "numeric", month: "long" })}</b>. Keep collecting kilometres and confidence.</p>
          <div className="hero-actions">
            <a className="primary-button" href="#log-drive">Log a drive <ArrowIcon /></a>
            <button className="text-button" type="button" onClick={onViewLogbook}>View logbook</button>
          </div>
        </div>
        <picture className="course-art">
          <source
            type="image/avif"
            srcSet={`${import.meta.env.BASE_URL}images/kart-hero-768.avif 768w, ${import.meta.env.BASE_URL}images/kart-hero-1536.avif 1536w`}
            sizes="(max-width: 850px) 100vw, 57vw"
          />
          <source
            type="image/webp"
            srcSet={`${import.meta.env.BASE_URL}images/kart-hero-768.webp 768w, ${import.meta.env.BASE_URL}images/kart-hero-1536.webp 1536w`}
            sizes="(max-width: 850px) 100vw, 57vw"
          />
          <img
            src={`${import.meta.env.BASE_URL}images/kart-hero-1536.jpg`}
            srcSet={`${import.meta.env.BASE_URL}images/kart-hero-768.jpg 768w, ${import.meta.env.BASE_URL}images/kart-hero-1536.jpg 1536w`}
            sizes="(max-width: 850px) 100vw, 57vw"
            width="1536"
            height="1024"
            fetchPriority="high"
            alt=""
          />
        </picture>
      </section>

      <section className="dashboard-grid" aria-label="Training overview">
        <article className="panel weekly-card">
          <div className="panel-title"><div><p className="kicker">Weekly cup</p><h2>This week's missions</h2></div><span className="trophy" aria-hidden="true">♛</span></div>
          <Mission done={practiceDone} label="Practice drive" detail={`${practiceCount} of ${tracker.settings.weeklyPracticeGoal} complete`} color="purple" />
          <Mission done={manoeuvreDone} label="Manoeuvres session" detail={`${manoeuvreCount} of ${tracker.settings.weeklyManoeuvreGoal} complete`} color="orange" />
          <div className={`week-status ${practiceDone && manoeuvreDone ? "complete" : ""}`}>
            {practiceDone && manoeuvreDone ? "Weekly cup cleared!" : "Clear both missions to win this week's cup."}
          </div>
        </article>

        <article className="panel km-card">
          <div className="panel-title"><div><p className="kicker">Distance quest</p><h2>{Math.round(pace.totalKm)} <small>/ {tracker.settings.kmGoal} km</small></h2></div><span className="meter-icon" aria-hidden="true">↗</span></div>
          <div className="track-progress"><span style={{ "--progress": `${pace.percent}%` } as React.CSSProperties}><i /></span></div>
          <div className="pace-row">
            <span className={pace.onTrack ? "pace-good" : "pace-behind"}>{pace.onTrack ? "● On track" : "● Pick up the pace"}</span>
            <span>{Math.round(pace.percent)}% complete</span>
          </div>
          <p className="pace-note">{pace.onTrack ? `${Math.round(pace.deltaKm)} km ahead of pace.` : `${Math.round(Math.abs(pace.deltaKm))} km behind pace.`} Aim for <b>{Math.ceil(pace.weeklyKmNeeded)} km/week</b> from here.</p>
        </article>

        <article className={`panel route-card ${rouletteSpinning ? "is-spinning" : ""}`} aria-busy={rouletteSpinning}>
          <div className="route-art" aria-hidden="true"><span>?</span><i /><i /><i /></div>
          <div className="route-copy" key={`${suggestedRoute?.id ?? "empty"}-${rouletteRound}`} aria-live="polite" aria-atomic="true">
            <p className="kicker">Route roulette</p>
            <h2>{rouletteSpinning ? "Shuffling the route deck…" : suggestedRoute ? suggestedRoute.name : "Where are we driving today?"}</h2>
            <p>{rouletteSpinning ? "Mystery box spinning—your next loop is almost ready." : suggestedRoute ? `You've completed this loop ${routeCount} ${routeCount === 1 ? "time" : "times"}.` : tracker.routes.length ? `${tracker.routes.length} routes are waiting in your garage.` : "Add some Google Maps loops, then let the route box decide."}</p>
            {!rouletteSpinning && suggestedRoute && suggestedMetadata && <RouteResultMetadata metadata={suggestedMetadata} />}
            <div className="route-actions">
              <button className="secondary-button" type="button" disabled={rouletteSpinning} onClick={onRandomRoute}><ShuffleIcon /> {rouletteSpinning ? "Shuffling…" : suggestedRoute ? "Spin again" : "Pick a random route"}</button>
              {!rouletteSpinning && suggestedRoute && <button className="text-button" type="button" onClick={onUseRoute}>Use this route</button>}
              {!suggestedRoute && tracker.routes.length === 0 && <button className="text-button" type="button" onClick={onManageRoutes}>Add routes</button>}
            </div>
          </div>
        </article>
      </section>
    </>
  );
}

function RouteResultMetadata({ metadata }: { metadata: ReturnType<typeof routeMetadata> }) {
  return <dl className="route-result-meta">
    <div><dt>Distance</dt><dd>{metadata.distanceKm === undefined ? "Not recorded" : `${metadata.distanceKm.toFixed(1)} km`}</dd>{metadata.distanceSource && <small>{metadata.distanceSource === "average" ? `Average from ${metadata.loggedDriveCount} logged ${metadata.loggedDriveCount === 1 ? "drive" : "drives"}` : "Set in Garage"}</small>}</div>
    <div><dt>Duration</dt><dd>{metadata.durationMinutes === undefined ? "Not recorded" : durationLabel(Math.round(metadata.durationMinutes))}</dd>{metadata.durationSource && <small>{metadata.durationSource === "average" ? `Average from ${metadata.loggedDriveCount} logged ${metadata.loggedDriveCount === 1 ? "drive" : "drives"}` : "Set in Garage"}</small>}</div>
  </dl>;
}

function Mission({ done, label, detail, color }: { done: boolean; label: string; detail: string; color: string }) {
  return <div className={`mission ${done ? "done" : ""}`}><span className={`mission-icon ${color}`} aria-hidden="true">{done ? "✓" : "○"}</span><div><strong>{label}</strong><small>{detail}</small></div><span className="mission-state">{done ? "Cleared" : "To do"}</span></div>;
}

function DriveForm({ tracker, routeId, onSave }: { tracker: TrackerDocument; routeId?: string; onSave: (drive: Omit<DriveRecord, "id" | "updatedAt">) => void }) {
  const [type, setType] = useState<DriveType>(routeId ? "practice" : "functional");
  const [date, setDate] = useState(localDateKey());
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [selectedRoute, setSelectedRoute] = useState(routeId ?? "");
  const [practiced, setPracticed] = useState(false);
  const [manoeuvreIds, setManoeuvreIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    onSave({
      date,
      distanceKm: Number(distance),
      durationMinutes: Number(duration),
      type,
      routeId: type === "practice" && selectedRoute ? selectedRoute : undefined,
      practicedManoeuvres: practiced || type === "manoeuvres",
      manoeuvreIds: (practiced || type === "manoeuvres") ? manoeuvreIds : [],
      notes: notes.trim() || undefined,
    });
    setDistance(""); setDuration(""); setNotes(""); setPracticed(false); setManoeuvreIds([]);
  }

  const showManoeuvres = practiced || type === "manoeuvres";
  return (
    <section className="log-section" id="log-drive">
      <div className="section-heading"><p className="kicker">Pit stop</p><h2>Log a drive</h2><p>Every trip counts. Add the details while they're still fresh.</p></div>
      <form className="drive-form" onSubmit={submit} action="/" method="post">
        <fieldset className="drive-types">
          <legend>What kind of drive was it?</legend>
          {(["functional", "practice", "manoeuvres"] as DriveType[]).map((value) => (
            <label key={value} className={type === value ? "selected" : ""}>
              <input type="radio" name="drive-type" value={value} checked={type === value} onChange={() => setType(value)} />
              <span className={`type-icon ${value}`} aria-hidden="true">{value === "functional" ? "↗" : value === "practice" ? "★" : "↔"}</span>
              <strong>{DRIVE_LABELS[value]}</strong>
              <small>{value === "functional" ? "Getting somewhere" : value === "practice" ? "A planned loop" : "Focused skills"}</small>
            </label>
          ))}
        </fieldset>
        <div className="form-grid">
          <label><span>Date</span><input name="date" type="date" max={localDateKey()} required value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label><span>Distance</span><span className="unit-input"><input name="distance" type="number" inputMode="decimal" min="0.1" max="1000" step="0.1" required placeholder="32" value={distance} onChange={(e) => setDistance(e.target.value)} /><b>km</b></span></label>
          <label><span>Time</span><span className="unit-input"><input name="duration" type="number" inputMode="numeric" min="1" max="1440" step="1" required placeholder="45" value={duration} onChange={(e) => setDuration(e.target.value)} /><b>min</b></span></label>
          {type === "practice" && <label><span>Practice route</span><select name="route" value={selectedRoute} onChange={(e) => setSelectedRoute(e.target.value)}><option value="">No saved route</option>{tracker.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>}
        </div>
        {type !== "manoeuvres" && <label className="big-check"><input type="checkbox" name="practiced-manoeuvres" checked={practiced} onChange={(e) => setPracticed(e.target.checked)} /><span>✓</span><div><strong>I also practised manoeuvres</strong><small>Bonus skills during this drive</small></div></label>}
        {showManoeuvres && tracker.manoeuvres.length > 0 && (
          <fieldset className="manoeuvre-checks"><legend>Which manoeuvres?</legend>{tracker.manoeuvres.map((manoeuvre) => <label key={manoeuvre.id}><input type="checkbox" checked={manoeuvreIds.includes(manoeuvre.id)} onChange={(e) => setManoeuvreIds((ids) => e.target.checked ? [...ids, manoeuvre.id] : ids.filter((item) => item !== manoeuvre.id))} /> <span>{manoeuvre.name}</span></label>)}</fieldset>
        )}
        <label className="notes-field"><span>Notes <small>optional</small></span><textarea name="notes" maxLength={500} rows={3} placeholder="What went well? What needs another lap?" value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <button className="primary-button save-drive" type="submit">Save drive <FlagIcon /></button>
      </form>
    </section>
  );
}

function Logbook({ tracker, onDelete }: { tracker: TrackerDocument; onDelete: (drive: DriveRecord) => void }) {
  const [filter, setFilter] = useState<"all" | DriveType>("all");
  const filtered = filter === "all" ? tracker.drives : tracker.drives.filter((drive) => drive.type === filter);
  const routeById = useMemo(() => new Map(tracker.routes.map((route) => [route.id, route])), [tracker.routes]);
  return (
    <section className="page-view">
      <div className="page-hero"><div><p className="kicker">Race history</p><h1>Your logbook</h1><p>Every kilometre, mission, and skill session in one place.</p></div><span aria-hidden="true"><FlagIcon /></span></div>
      <div className="filter-row" aria-label="Filter drives">{(["all", "functional", "practice", "manoeuvres"] as const).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "all" ? "All drives" : DRIVE_LABELS[value]}</button>)}</div>
      {filtered.length === 0 ? <EmptyState icon="◇" title="No drives on this track yet" text="Log a drive from Home and it will appear here." /> : (
        <ol className="drive-list">{filtered.map((drive) => {
          const route = drive.routeId ? routeById.get(drive.routeId) : undefined;
          return <li key={drive.id} className="drive-row"><span className={`type-icon ${drive.type}`} aria-hidden="true">{drive.type === "functional" ? "↗" : drive.type === "practice" ? "★" : "↔"}</span><div className="drive-main"><div><strong>{DRIVE_LABELS[drive.type]}</strong><time dateTime={drive.date}>{formatDate(drive.date)}</time></div><p>{route ? route.name : drive.practicedManoeuvres ? "Manoeuvres practised" : "No route attached"}{drive.notes ? ` · ${drive.notes}` : ""}</p></div><dl><div><dt>Distance</dt><dd>{drive.distanceKm.toFixed(1)} km</dd></div><div><dt>Time</dt><dd>{durationLabel(drive.durationMinutes)}</dd></div></dl><button className="icon-button danger" type="button" onClick={() => onDelete(drive)} aria-label={`Delete ${formatDate(drive.date)} drive`}><TrashIcon /></button></li>;
        })}</ol>
      )}
    </section>
  );
}

function Garage({ tracker, counts, onCommit, flash }: { tracker: TrackerDocument; counts: Map<string, number>; onCommit: (tracker: TrackerDocument) => void; flash: (message: string) => void }) {
  const [routeName, setRouteName] = useState("");
  const [routeUrl, setRouteUrl] = useState("");
  const [routePriorCompletions, setRoutePriorCompletions] = useState("0");
  const [routeDistance, setRouteDistance] = useState("");
  const [routeDuration, setRouteDuration] = useState("");
  const [editingRouteId, setEditingRouteId] = useState<string>();
  const [manoeuvreName, setManoeuvreName] = useState("");
  function addRoute(event: FormEvent) {
    event.preventDefault();
    const stamp = new Date().toISOString();
    const route = {
      id: id("route"),
      name: routeName.trim(),
      googleMapsUrl: routeUrl.trim(),
      priorCompletions: Number(routePriorCompletions),
      distanceKm: optionalPositiveNumber(routeDistance),
      durationMinutes: optionalPositiveNumber(routeDuration),
      createdAt: stamp,
      updatedAt: stamp,
    };
    onCommit({ ...tracker, routes: [...tracker.routes, route] });
    setRouteName(""); setRouteUrl(""); setRoutePriorCompletions("0"); setRouteDistance(""); setRouteDuration(""); flash("Route added to the garage.");
  }
  function updateRoute(route: TrackerDocument["routes"][number]) {
    onCommit({ ...tracker, routes: tracker.routes.map((item) => item.id === route.id ? route : item) });
    setEditingRouteId(undefined);
    flash("Route details saved.");
  }
  function addManoeuvre(event: FormEvent) {
    event.preventDefault();
    onCommit({ ...tracker, manoeuvres: [...tracker.manoeuvres, { id: id("manoeuvre"), name: manoeuvreName.trim(), createdAt: new Date().toISOString() }] }); setManoeuvreName(""); flash("Manoeuvre added to your skill deck.");
  }
  return <section className="page-view"><div className="page-hero garage-hero"><div><p className="kicker">Loadout</p><h1>Route garage</h1><p>Build your loop collection and configure the skills you want to practise.</p></div><span aria-hidden="true"><MapIcon /></span></div>
    <div className="garage-grid">
      <section className="panel manage-panel"><div className="panel-title"><div><p className="kicker">Practice loops</p><h2>Saved routes</h2></div><span className="count-badge">{tracker.routes.length}</span></div>
        <form className="stack-form route-add-form" onSubmit={addRoute} action="/" method="post">
          <label htmlFor="new-route-name"><span>Route name</span><input id="new-route-name" name="route-name" required maxLength={100} placeholder="e.g. City centre loop" value={routeName} onChange={(e) => setRouteName(e.target.value)} /></label>
          <label htmlFor="new-route-url"><span>Google Maps link</span><input id="new-route-url" name="route-url" required type="url" inputMode="url" placeholder="https://maps.app.goo.gl/..." value={routeUrl} onChange={(e) => setRouteUrl(e.target.value)} /></label>
          <div className="route-detail-fields">
            <label htmlFor="new-route-count"><span>Previous completions</span><input id="new-route-count" name="previous-completions" type="number" inputMode="numeric" min="0" max="10000" step="1" required value={routePriorCompletions} onChange={(e) => setRoutePriorCompletions(e.target.value)} /></label>
            <label htmlFor="new-route-distance"><span>Distance <small>optional</small></span><span className="unit-input"><input id="new-route-distance" name="distance-km" type="number" inputMode="decimal" min="0.1" max="1000" step="0.1" value={routeDistance} onChange={(e) => setRouteDistance(e.target.value)} /><b>km</b></span></label>
            <label htmlFor="new-route-duration"><span>Duration <small>optional</small></span><span className="unit-input"><input id="new-route-duration" name="duration-minutes" type="number" inputMode="numeric" min="1" max="1440" step="1" value={routeDuration} onChange={(e) => setRouteDuration(e.target.value)} /><b>min</b></span></label>
          </div>
          <p className="form-hint">Leave distance or duration blank to use the average from logged drives.</p>
          <button className="secondary-button" type="submit">+ Add route</button>
        </form>
        {tracker.routes.length === 0 ? <EmptyState icon="?" title="Your garage is empty" text="Add a Google Maps loop to start route roulette." /> : <ul className="manage-list route-list">{tracker.routes.map((route) => {
          const totalCount = counts.get(route.id) ?? route.priorCompletions;
          const loggedCount = Math.max(0, totalCount - route.priorCompletions);
          const metadata = routeMetadata(tracker, route);
          const metadataText = routeMetadataSummary(metadata);
          return <li className="route-list-item" key={route.id}><div className="route-list-row"><span className="route-number" aria-hidden="true">{totalCount}</span><div className="route-list-copy"><strong>{route.name}</strong><small>{totalCount} completed {totalCount === 1 ? "lap" : "laps"} · {route.priorCompletions} before tracking + {loggedCount} logged</small><small>{metadataText ?? "Distance and duration will be derived after the first logged drive."}</small></div><button className="route-edit-button" type="button" aria-expanded={editingRouteId === route.id} aria-controls={`edit-${route.id}`} onClick={() => setEditingRouteId((current) => current === route.id ? undefined : route.id)}>{editingRouteId === route.id ? "Close" : "Edit"}</button><a className="icon-button" href={route.googleMapsUrl} target="_blank" rel="noreferrer" aria-label={`Open ${route.name} in Google Maps`}><ExternalIcon /></a><button className="icon-button danger" type="button" aria-label={`Delete ${route.name}`} onClick={() => { if (window.confirm(`Delete “${route.name}”? Existing drives stay in the logbook.`)) onCommit({ ...tracker, routes: tracker.routes.filter((item) => item.id !== route.id) }); }}><TrashIcon /></button></div>{editingRouteId === route.id && <RouteEditForm key={route.updatedAt} route={route} onSave={updateRoute} onCancel={() => setEditingRouteId(undefined)} />}</li>;
        })}</ul>}
      </section>
      <section className="panel manage-panel"><div className="panel-title"><div><p className="kicker">Skill deck</p><h2>Manoeuvres</h2></div><span className="count-badge orange">{tracker.manoeuvres.length}</span></div>
        <form className="inline-form" onSubmit={addManoeuvre} action="/" method="post"><label><span>Manoeuvre name</span><input required maxLength={100} placeholder="e.g. Parallel parking" value={manoeuvreName} onChange={(e) => setManoeuvreName(e.target.value)} /></label><button className="secondary-button" type="submit">+ Add</button></form>
        {tracker.manoeuvres.length === 0 ? <EmptyState icon="↔" title="No skills configured" text="Add the manoeuvres from your exam checklist." /> : <ul className="manage-list compact">{tracker.manoeuvres.map((manoeuvre) => <li key={manoeuvre.id}><span className="skill-dot" aria-hidden="true">✓</span><div><strong>{manoeuvre.name}</strong></div><button className="icon-button danger" type="button" aria-label={`Delete ${manoeuvre.name}`} onClick={() => onCommit({ ...tracker, manoeuvres: tracker.manoeuvres.filter((item) => item.id !== manoeuvre.id) })}><TrashIcon /></button></li>)}</ul>}
      </section>
    </div>
  </section>;
}

function RouteEditForm({ route, onSave, onCancel }: { route: TrackerDocument["routes"][number]; onSave: (route: TrackerDocument["routes"][number]) => void; onCancel: () => void }) {
  const [name, setName] = useState(route.name);
  const [url, setUrl] = useState(route.googleMapsUrl);
  const [priorCompletions, setPriorCompletions] = useState(String(route.priorCompletions));
  const [distance, setDistance] = useState(route.distanceKm === undefined ? "" : String(route.distanceKm));
  const [duration, setDuration] = useState(route.durationMinutes === undefined ? "" : String(route.durationMinutes));
  const prefix = `edit-${route.id}`;
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({ ...route, name: name.trim(), googleMapsUrl: url.trim(), priorCompletions: Number(priorCompletions), distanceKm: optionalPositiveNumber(distance), durationMinutes: optionalPositiveNumber(duration), updatedAt: new Date().toISOString() });
  }
  return <form id={prefix} className="route-edit-form" onSubmit={submit} action="/" method="post">
    <div className="route-edit-grid">
      <label htmlFor={`${prefix}-name`}><span>Route name</span><input id={`${prefix}-name`} name="route-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label htmlFor={`${prefix}-url`}><span>Google Maps link</span><input id={`${prefix}-url`} name="route-url" required type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
      <label htmlFor={`${prefix}-count`}><span>Previous completions</span><input id={`${prefix}-count`} name="previous-completions" type="number" inputMode="numeric" min="0" max="10000" step="1" required value={priorCompletions} onChange={(e) => setPriorCompletions(e.target.value)} /></label>
      <label htmlFor={`${prefix}-distance`}><span>Distance <small>optional</small></span><span className="unit-input"><input id={`${prefix}-distance`} name="distance-km" type="number" inputMode="decimal" min="0.1" max="1000" step="0.1" value={distance} onChange={(e) => setDistance(e.target.value)} /><b>km</b></span></label>
      <label htmlFor={`${prefix}-duration`}><span>Duration <small>optional</small></span><span className="unit-input"><input id={`${prefix}-duration`} name="duration-minutes" type="number" inputMode="numeric" min="1" max="1440" step="1" value={duration} onChange={(e) => setDuration(e.target.value)} /><b>min</b></span></label>
    </div>
    <p className="form-hint">Previous completions are added to logged drives. Clear distance or duration to use the logged-drive average.</p>
    <div className="route-edit-actions"><button className="secondary-button" type="submit">Save changes</button><button className="text-button" type="button" onClick={onCancel}>Cancel</button></div>
  </form>;
}

function Settings({ tracker, onCommit, sync, flash }: { tracker: TrackerDocument; onCommit: (tracker: TrackerDocument) => void; sync: ReturnType<typeof useSync>; flash: (message: string) => void }) {
  const [examDate, setExamDate] = useState(tracker.settings.examDate);
  const [kmGoal, setKmGoal] = useState(String(tracker.settings.kmGoal));
  const [practiceGoal, setPracticeGoal] = useState(String(tracker.settings.weeklyPracticeGoal));
  const [manoeuvreGoal, setManoeuvreGoal] = useState(String(tracker.settings.weeklyManoeuvreGoal));
  const [codeDraft, setCodeDraft] = useState(() => storedSyncCode() ? formatSyncCode(storedSyncCode()!) : "");
  const [storageMessage, setStorageMessage] = useState("");

  function saveSettings(event: FormEvent) {
    event.preventDefault();
    onCommit({ ...tracker, settings: { examDate, kmGoal: Number(kmGoal), weeklyPracticeGoal: Number(practiceGoal), weeklyManoeuvreGoal: Number(manoeuvreGoal) } });
    flash("Race settings saved.");
  }
  function connectSync(event: FormEvent) {
    event.preventDefault();
    if (!isValidSyncCode(codeDraft)) { setStorageMessage("A sync code must contain 64 hexadecimal characters."); return; }
    storeSyncCode(codeDraft); setCodeDraft(formatSyncCode(normalizeSyncCode(codeDraft))); sync.refresh(); void sync.run(tracker); setStorageMessage("Sync connected. Keep this code somewhere safe.");
  }
  function newCode() { const code = generateSyncCode(); setCodeDraft(formatSyncCode(code)); setStorageMessage("New code generated. Save and connect it to start syncing."); }
  function download() {
    const blob = new Blob([trackerToJson(tracker)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `licence-quest-${localDateKey()}.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  async function restore(file: File | undefined) {
    if (!file) return;
    try { const restored = normalizeTracker(JSON.parse(await file.text())); if (window.confirm(`Replace current data with ${restored.drives.length} logged drives?`)) { onCommit(restored); setStorageMessage("Backup restored."); } }
    catch (error) { setStorageMessage(error instanceof Error ? error.message : "Backup could not be read."); }
  }
  return <section className="page-view"><div className="page-hero settings-hero"><div><p className="kicker">Control room</p><h1>Race settings</h1><p>Tune the finish line, goals, and data setup.</p></div><span aria-hidden="true"><CogIcon /></span></div>
    <div className="settings-grid">
      <form className="panel settings-panel" onSubmit={saveSettings} action="/" method="post"><div className="panel-title"><div><p className="kicker">Your quest</p><h2>Goals & schedule</h2></div></div><div className="form-grid"><label><span>Practical exam date</span><input type="date" required value={examDate} onChange={(e) => setExamDate(e.target.value)} /></label><label><span>Kilometre goal</span><span className="unit-input"><input type="number" min="1" max="100000" step="1" required value={kmGoal} onChange={(e) => setKmGoal(e.target.value)} /><b>km</b></span></label><label><span>Practice drives each week</span><input type="number" min="0" max="14" required value={practiceGoal} onChange={(e) => setPracticeGoal(e.target.value)} /></label><label><span>Manoeuvre sessions each week</span><input type="number" min="0" max="14" required value={manoeuvreGoal} onChange={(e) => setManoeuvreGoal(e.target.value)} /></label></div><button className="primary-button" type="submit">Save settings</button></form>
      <section className="panel settings-panel"><div className="panel-title"><div><p className="kicker">Cloud save</p><h2>Cloudflare sync</h2></div><span className={`cloud-status ${sync.state}`} aria-hidden="true">●</span></div>
        {!syncAvailable() ? <p className="muted">Sync is not included in this build. Set <code>VITE_SYNC_ENDPOINT</code> when building to connect the Cloudflare Worker.</p> : <><p className="muted">Use the same private code on each device. Cloud sync stores your driving data as readable JSON, so keep this code safe.</p><form className="stack-form" onSubmit={connectSync} action="/" method="post"><label><span>Private sync code</span><textarea className="code-field" rows={2} spellCheck={false} value={codeDraft} onChange={(e) => setCodeDraft(e.target.value)} /></label><div className="button-row"><button className="secondary-button" type="button" onClick={newCode}>Generate code</button><button className="primary-button compact-button" type="submit">Save & sync</button></div></form>{storedSyncCode() && <button className="danger-link" type="button" onClick={() => { forgetSyncCode(); sync.refresh(); setCodeDraft(""); setStorageMessage("This device is disconnected. Cloud data was not deleted."); }}>Disconnect this device</button>}<p className="sync-detail">Status: {sync.message || sync.state}{lastSyncTime() ? ` · Last success ${new Date(lastSyncTime()!).toLocaleString("en-GB")}` : ""}</p></>}
      </section>
      <section className="panel settings-panel wide"><div className="panel-title"><div><p className="kicker">Safety copy</p><h2>Export & restore</h2></div></div><p className="muted">Download a readable JSON copy at any time, or restore one you made earlier.</p><div className="button-row"><button className="secondary-button" type="button" onClick={download}>Download JSON</button><label className="secondary-button file-button">Restore JSON<input type="file" accept="application/json,.json" onChange={(e) => void restore(e.target.files?.[0])} /></label></div>{storageMessage && <p className="settings-message" role="status">{storageMessage}</p>}</section>
    </div>
  </section>;
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) { return <div className="empty-state"><span aria-hidden="true">{icon}</span><strong>{title}</strong><p>{text}</p></div>; }
function NavButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) { return <button className={active ? "active" : ""} type="button" onClick={onClick}>{icon}<span>{children}</span></button>; }

const Icon = ({ children, viewBox = "0 0 24 24" }: { children: React.ReactNode; viewBox?: string }) => <svg viewBox={viewBox} aria-hidden="true" focusable="false">{children}</svg>;
function HomeIcon() { return <Icon><path d="M3 11.5 12 4l9 7.5v8a1 1 0 0 1-1 1h-5.2v-6H9.2v6H4a1 1 0 0 1-1-1z" /></Icon>; }
function FlagIcon() { return <Icon><path d="M5 21V3m1 1h11l-2.2 3L17 10H6" /></Icon>; }
function MapIcon() { return <Icon><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2zm5-2v13m8-10v13" /></Icon>; }
function CogIcon() { return <Icon><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" /><circle cx="12" cy="12" r="3" /></Icon>; }
function WheelIcon() { return <Icon><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v6m0 6v6M3 12h6m6 0h6" /></Icon>; }
function ArrowIcon() { return <Icon><path d="M5 12h14m-5-5 5 5-5 5" /></Icon>; }
function ShuffleIcon() { return <Icon><path d="M4 7h3c4.5 0 5.5 10 10 10h3m-4-3 4 3-4 3M4 17h3c1.8 0 3-1.7 4.1-3.7M14 7.8C15 6.7 16 7 20 7m-3-3 3 3-3 3" /></Icon>; }
function TrashIcon() { return <Icon><path d="M4 7h16M9 3h6l1 4H8zm-2 4 1 14h8l1-14M10 11v6m4-6v6" /></Icon>; }
function ExternalIcon() { return <Icon><path d="M14 4h6v6m0-6-9 9M18 13v6H5V6h6" /></Icon>; }

export default App;
