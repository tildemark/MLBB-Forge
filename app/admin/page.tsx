"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  Shield,
  RefreshCw,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  Star,
  Database,
  Sword,
  Package,
  Zap,
  Layers,
  BookOpen,
  Sparkles,
  AlertTriangle,
  Clock,
  Wifi,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "overview" | "scraping" | "patches";
type JobKey = "heroes" | "items" | "spells" | "emblems" | "skills" | "seed";
type LogEntry = { text: string; type: "log" | "error" | "done" };

interface PatchRow {
  id: string;
  version: string;
  isLatest: boolean;
  createdAt: string;
}

interface HeroEntry {
  name: string;
  slug: string;
  imageFile: string;
  role: string[];
  lane: string;
}

interface Stats {
  heroes: number;
  items: number;
  spells: number;
  emblems: number;
  builds: number;
  buildsPublic: number;
  skills: number;
  patches: PatchRow[];
  roleCounts: Record<string, number>;
  heroList: HeroEntry[];
  heroWithStats: number;
  heroWithSkills: number;
}

interface VersionInfo {
  liveSeasonLabel: string | null;
  liveAppVersion: string | null;
  liveAppVersionDate: string | null;
  liveUpdatedAt: {
    builds: number | null;
    items: number | null;
    spells: number | null;
    emblems: number | null;
  };
  dbPatchVersion: string | null;
  dbPatchCreatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Job definitions
// ---------------------------------------------------------------------------

const JOBS: Array<{
  key: JobKey;
  label: string;
  desc: string;
  icon: React.ElementType;
}> = [
  {
    key: "heroes",
    label: "Heroes",
    desc: "Fetch hero data + portraits from openmlbb API & MLBB wiki. Updates stats, roles, and images.",
    icon: Sword,
  },
  {
    key: "items",
    label: "Items",
    desc: "Fetch item stats + icons from openmlbb API. Mirrors icons to OCI CDN.",
    icon: Package,
  },
  {
    key: "spells",
    label: "Battle Spells",
    desc: "Fetch battle spells from openmlbb API. Mirrors spell icons to CDN.",
    icon: Zap,
  },
  {
    key: "emblems",
    label: "Emblems",
    desc: "Scrape emblem trees + talent nodes from MLBB Fandom wiki.",
    icon: Layers,
  },
  {
    key: "skills",
    label: "Skills",
    desc: "Fetch hero skills from openmlbb API. Run after heroes are scraped.",
    icon: BookOpen,
  },
  {
    key: "seed",
    label: "Seed from JSON",
    desc: "Load pre-scraped seeds from data/seeds/ into the database. Fast — no external requests.",
    icon: Sparkles,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Version / Season status card
// ---------------------------------------------------------------------------

function fmtTs(ms: number | null): string {
  if (!ms) return "unknown";
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function DataTypeRow({
  label,
  liveTs,
  dbDate,
}: {
  label: string;
  liveTs: number | null;
  dbDate: string | null;
}) {
  const isStale =
    liveTs && dbDate ? liveTs > new Date(dbDate).getTime() : false;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-zinc-800/50 last:border-0 text-sm">
      <span className="text-zinc-300 w-24">{label}</span>
      <span className="text-zinc-400 flex items-center gap-1.5 text-xs">
        <Wifi className="h-3 w-3 text-zinc-500" />
        {fmtTs(liveTs)}
      </span>
      <span className="text-zinc-400 flex items-center gap-1.5 text-xs">
        <Database className="h-3 w-3 text-zinc-500" />
        {fmtDate(dbDate)}
      </span>
      <span>
        {isStale ? (
          <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium">
            <AlertTriangle className="h-3 w-3" />
            Stale
          </span>
        ) : liveTs ? (
          <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium">
            <CheckCircle className="h-3 w-3" />
            OK
          </span>
        ) : (
          <span className="text-zinc-600 text-xs">—</span>
        )}
      </span>
    </div>
  );
}

function VersionStatusCard({
  info,
  loading,
}: {
  info: VersionInfo | null;
  loading: boolean;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Clock className="h-3.5 w-3.5" />
        Version / Season Status
      </h2>

      <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Fetching live data…
          </div>
        ) : !info ? (
          <p className="text-sm text-zinc-500">Could not fetch version info.</p>
        ) : (
          <>
            {/* Live app version + DB patch row */}
            <div className="flex flex-wrap items-center gap-6 mb-5">
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Live App (APKMirror)</div>
                <div className="text-lg font-bold text-white">
                  {info.liveAppVersion ?? "—"}
                </div>
                {info.liveAppVersionDate && (
                  <div className="text-xs text-zinc-500 mt-0.5">
                    Released {fmtDate(info.liveAppVersionDate)}
                  </div>
                )}
              </div>
              <div className="text-zinc-700 text-xl font-light">vs</div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Your DB patch</div>
                <div className="text-lg font-bold text-white">
                  {info.dbPatchVersion ?? "—"}
                </div>
              </div>
              {info.liveSeasonLabel && (
                <div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Season (openmlbb)</div>
                  <div className="text-sm font-semibold text-zinc-300">
                    {info.liveSeasonLabel}
                  </div>
                </div>
              )}
              {info.dbPatchCreatedAt && (
                <div className="ml-auto text-right">
                  <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Last scraped</div>
                  <div className="text-sm text-zinc-300">{fmtDate(info.dbPatchCreatedAt)}</div>
                </div>
              )}
            </div>

            {/* Per-type staleness table */}
            <div>
              <div className="flex items-center justify-between text-xs text-zinc-600 uppercase tracking-wider pb-1.5 border-b border-zinc-700/50 mb-1">
                <span className="w-24">Data type</span>
                <span>API updated</span>
                <span>DB scraped</span>
                <span>Status</span>
              </div>
              <DataTypeRow
                label="Builds"
                liveTs={info.liveUpdatedAt.builds}
                dbDate={info.dbPatchCreatedAt}
              />
              <DataTypeRow
                label="Items"
                liveTs={info.liveUpdatedAt.items}
                dbDate={info.dbPatchCreatedAt}
              />
              <DataTypeRow
                label="Spells"
                liveTs={info.liveUpdatedAt.spells}
                dbDate={info.dbPatchCreatedAt}
              />
              <DataTypeRow
                label="Emblems"
                liveTs={info.liveUpdatedAt.emblems}
                dbDate={info.dbPatchCreatedAt}
              />
            </div>

            <p className="text-xs text-zinc-600 mt-4">
              "Stale" means the openmlbb API refreshed that data after your last DB scrape date.
              Run the corresponding scraper to update.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function StatCard({ label, value, loading }: { label: string; value?: number; loading: boolean }) {
  return (
    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-5 text-center">
      <div className="text-3xl font-bold text-white tabular-nums">
        {loading ? <span className="text-zinc-600">—</span> : (value ?? "—")}
      </div>
      <div className="text-xs text-zinc-400 mt-1.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AdminPage() {
  // Auth state
  const [secretInput, setSecretInput] = useState("");
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // UI state
  const [tab, setTab] = useState<Tab>("overview");

  // Overview
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);

  // Scraping
  const [runningJob, setRunningJob] = useState<JobKey | null>(null);
  const [jobStatus, setJobStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [patchInput, setPatchInput] = useState("1.8.88");
  const logRef = useRef<HTMLDivElement>(null);

  // Patches
  const [newPatchInput, setNewPatchInput] = useState("");
  const [patchActionLoading, setPatchActionLoading] = useState(false);

  // Hero roster filters
  const [rosterRoleFilter, setRosterRoleFilter] = useState<string | null>(null);
  const [rosterLaneFilter, setRosterLaneFilter] = useState<string | null>(null);

  const authHeader = { Authorization: `Bearer ${secret}` };

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const loadStats = useCallback(async () => {
    if (!secret) return;
    setStatsLoading(true);
    try {
      const res = await fetch("/api/admin/stats", { headers: authHeader });
      if (res.ok) {
        const data = (await res.json()) as Stats;
        setStats(data);
        const latest = data.patches.find((p) => p.isLatest);
        if (latest) setPatchInput(latest.version);
      }
    } finally {
      setStatsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  const loadVersion = useCallback(async () => {
    if (!secret) return;
    setVersionLoading(true);
    try {
      const res = await fetch("/api/admin/version", { headers: authHeader });
      if (res.ok) setVersionInfo((await res.json()) as VersionInfo);
    } finally {
      setVersionLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  useEffect(() => {
    if (authed) {
      void loadStats();
      void loadVersion();
    }
  }, [authed, loadStats, loadVersion]);

  // Auto-scroll log panel
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: secretInput }),
      });
      if (res.ok) {
        setSecret(secretInput);
        setAuthed(true);
      } else {
        setAuthError("Invalid secret.");
      }
    } finally {
      setAuthLoading(false);
    }
  }

  function runJob(job: JobKey) {
    if (runningJob) return;
    setRunningJob(job);
    setJobStatus("running");
    setLogs([]);
    setTab("scraping");

    const t = encodeURIComponent(secret);
    const patch = encodeURIComponent(patchInput.trim() || "1.8.88");
    const es = new EventSource(`/api/admin/run?job=${job}&patch=${patch}&t=${t}`);

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as {
          text?: string;
          type?: string;
          done?: boolean;
          code?: number;
        };
        if (data.text) {
          setLogs((prev) => [
            ...prev,
            { text: data.text!, type: (data.type as LogEntry["type"]) ?? "log" },
          ]);
        }
        if (data.done) {
          es.close();
          setRunningJob(null);
          setJobStatus(data.code === 0 ? "success" : "error");
          void loadStats();
          void loadVersion();
        }
      } catch {
        // ignore malformed frames
      }
    };

    es.onerror = () => {
      es.close();
      setRunningJob(null);
      setJobStatus("error");
      setLogs((prev) => [
        ...prev,
        { text: "Connection lost — check server logs.", type: "error" },
      ]);
    };
  }

  async function setLatestPatch(id: string) {
    setPatchActionLoading(true);
    try {
      await fetch("/api/admin/patches", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setLatest", id }),
      });
      await loadStats();
    } finally {
      setPatchActionLoading(false);
    }
  }

  async function createPatch() {
    if (!newPatchInput.trim()) return;
    setPatchActionLoading(true);
    try {
      await fetch("/api/admin/patches", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", version: newPatchInput.trim() }),
      });
      setNewPatchInput("");
      await loadStats();
    } finally {
      setPatchActionLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Login screen
  // ---------------------------------------------------------------------------

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <form
          onSubmit={(e) => void handleLogin(e)}
          className="w-full max-w-sm space-y-4 p-8 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl"
        >
          <div className="flex items-center gap-2.5 mb-6">
            <Shield className="h-6 w-6 text-amber-400" />
            <h1 className="text-lg font-semibold text-white">Admin Access</h1>
          </div>
          <input
            type="password"
            placeholder="Admin secret"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            autoFocus
            className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
          />
          {authError && <p className="text-red-400 text-sm">{authError}</p>}
          <button
            type="submit"
            disabled={authLoading || !secretInput}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {authLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            Unlock
          </button>
        </form>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Authenticated layout
  // ---------------------------------------------------------------------------

  const latestPatch = stats?.patches.find((p) => p.isLatest);

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-amber-400" />
          <span className="font-semibold text-white">MLBB Forge Admin</span>
          {latestPatch && (
            <span className="px-2 py-0.5 text-xs bg-zinc-800 text-zinc-400 rounded-md border border-zinc-700">
              patch {latestPatch.version}
            </span>
          )}
        </div>
        <button
          onClick={() => { void loadStats(); void loadVersion(); }}
          disabled={statsLoading || versionLoading}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", (statsLoading || versionLoading) && "animate-spin")} />
          Refresh
        </button>
      </header>

      {/* ── Tabs ── */}
      <div className="px-6 pt-5 pb-0 border-b border-zinc-800 flex gap-1">
        {(["overview", "scraping", "patches"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm rounded-t-lg capitalize transition-colors",
              tab === t
                ? "bg-zinc-900 text-white border border-b-zinc-900 border-zinc-800 -mb-px"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <main className="p-6 max-w-5xl">
        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="space-y-8">
            {/* Version / Season Status */}
            <VersionStatusCard info={versionInfo} loading={versionLoading} />

            <section>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                Database
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
                <StatCard label="Heroes"  value={stats?.heroes}  loading={statsLoading} />
                <StatCard label="Items"   value={stats?.items}   loading={statsLoading} />
                <StatCard label="Spells"  value={stats?.spells}  loading={statsLoading} />
                <StatCard label="Emblems" value={stats?.emblems} loading={statsLoading} />
                <StatCard label="Skills"  value={stats?.skills}  loading={statsLoading} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Builds (total)"  value={stats?.builds}       loading={statsLoading} />
                <StatCard label="Builds (public)" value={stats?.buildsPublic} loading={statsLoading} />
                <StatCard label="Builds (draft)"  value={stats ? stats.builds - stats.buildsPublic : undefined} loading={statsLoading} />
              </div>
            </section>

            {/* Hero roster */}
            <section>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Sword className="h-3.5 w-3.5" />
                Hero Roster
              </h2>

              {/* Role + Lane icon filter */}
              {!statsLoading && stats && (
                <div className="flex items-center gap-1 mb-3">
                  {([
                    ["Fighter", "fighter.png"],
                    ["Assassin", "assassin.png"],
                    ["Mage", "mage.png"],
                    ["Marksman", "marksman.png"],
                    ["Support", "support.png"],
                    ["Tank", "tank.png"],
                  ] as [string, string][]).map(([role, file]) => {
                    const active = rosterRoleFilter === role;
                    const count = stats.roleCounts[role] ?? 0;
                    return (
                      <button
                        key={role}
                        title={`${role} (${count})`}
                        onClick={() => { setRosterRoleFilter(active ? null : role); setRosterLaneFilter(null); }}
                        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded transition-all ${
                          active ? "ring-2 ring-amber-500 bg-amber-500/10" : "opacity-40 hover:opacity-80"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${process.env.NEXT_PUBLIC_CDN_URL ?? ""}roles/${file}`} alt={role} className="h-5 w-5 object-contain" />
                        {active && (
                          <span className="absolute -top-1 -right-1 h-3.5 min-w-3.5 rounded-full bg-amber-500 text-[8px] font-bold text-black flex items-center justify-center px-0.5">
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <span className="mx-1 h-4 w-px bg-white/10" />

                  {([
                    ["Gold Lane", "gold-lane.svg", "gold lane"],
                    ["Exp Lane", "exp-lane.svg", "exp lane"],
                    ["Mid Lane", "mid-lane.svg", "mid lane"],
                    ["Roaming", "roam.svg", "roaming"],
                    ["Jungle", "jungle.svg", "jungle"],
                  ] as [string, string, string][]).map(([label, file, value]) => {
                    const active = rosterLaneFilter === value;
                    return (
                      <button
                        key={value}
                        title={label}
                        onClick={() => { setRosterLaneFilter(active ? null : value); setRosterRoleFilter(null); }}
                        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded transition-all ${
                          active ? "ring-2 ring-amber-400/70 bg-amber-500/10" : "opacity-40 hover:opacity-80"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`${process.env.NEXT_PUBLIC_CDN_URL ?? ""}lanes/${file}`} alt={label} className="h-6 w-6 object-contain" />
                      </button>
                    );
                  })}

                  {(rosterRoleFilter || rosterLaneFilter) && (
                    <button
                      title="Clear filter"
                      onClick={() => { setRosterRoleFilter(null); setRosterLaneFilter(null); }}
                      className="ml-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                      ✕
                    </button>
                  )}

                  <span className="ml-auto text-xs text-zinc-500">
                    {(() => {
                      if (!stats.heroList) return "";
                      const filtered = stats.heroList.filter((h) => {
                        if (rosterRoleFilter) return h.role.some((r) => r.toLowerCase() === rosterRoleFilter.toLowerCase());
                        if (rosterLaneFilter) return h.lane?.toLowerCase().includes(rosterLaneFilter.toLowerCase());
                        return true;
                      });
                      return `${filtered.length} / ${stats.heroes}`;
                    })()}
                  </span>
                </div>
              )}

              {/* Portrait grid */}
              <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-xl p-4">
                {statsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading heroes…
                  </div>
                ) : !stats?.heroList?.length ? (
                  <p className="text-sm text-zinc-500">No heroes in DB yet — run the Heroes scraper.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {stats.heroList
                      .filter((h) => {
                        if (rosterRoleFilter) return h.role.some((r) => r.toLowerCase() === rosterRoleFilter.toLowerCase());
                        if (rosterLaneFilter) return h.lane?.toLowerCase().includes(rosterLaneFilter.toLowerCase());
                        return true;
                      })
                      .map((h) => (
                        <div key={h.slug} className="relative group" title={h.name}>
                          <Image
                            src={`${process.env.NEXT_PUBLIC_CDN_URL ?? ""}heroes/${h.imageFile}`}
                            alt={h.name}
                            width={40}
                            height={40}
                            className="rounded-lg object-cover w-10 h-10 ring-1 ring-zinc-700 group-hover:ring-amber-500 transition-all"
                            unoptimized
                          />
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </section>

            <section>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                Quick Run
              </h2>
              <div className="flex items-center gap-3 mb-4">
                <label className="text-xs text-zinc-400">Patch:</label>
                <input
                  value={patchInput}
                  onChange={(e) => setPatchInput(e.target.value)}
                  className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-md text-white text-xs w-28 focus:outline-none focus:border-amber-500"
                  placeholder="1.8.88"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {JOBS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => runJob(key)}
                    disabled={!!runningJob}
                    className="flex items-center gap-2.5 px-4 py-3 bg-zinc-800/60 hover:bg-zinc-700/60 border border-zinc-700/50 hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm text-left transition-all"
                  >
                    <Icon className="h-4 w-4 text-amber-400 flex-shrink-0" />
                    <span className="truncate">{label}</span>
                    {runningJob === key && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto text-amber-400" />
                    )}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ── Scraping ── */}
        {tab === "scraping" && (
          <div className="space-y-6">
            {/* Patch version row */}
            <div className="flex items-end gap-4">
              <div>
                <label className="text-xs text-zinc-400 block mb-1.5">
                  Patch version for all jobs
                </label>
                <input
                  value={patchInput}
                  onChange={(e) => setPatchInput(e.target.value)}
                  className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm w-36 focus:outline-none focus:border-amber-500"
                  placeholder="1.8.88"
                />
              </div>
              <p className="text-xs text-zinc-500 pb-2">
                Applied to newly scraped data as the patch tag
              </p>
            </div>

            {/* Job cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {JOBS.map(({ key, label, desc, icon: Icon }) => (
                <div
                  key={key}
                  className={cn(
                    "bg-zinc-800/60 border rounded-xl p-4 flex items-start justify-between gap-4 transition-colors",
                    runningJob === key
                      ? "border-amber-500/40 bg-amber-500/5"
                      : "border-zinc-700/50",
                  )}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Icon className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-medium text-sm text-white">{label}</div>
                      <div className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{desc}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => runJob(key)}
                    disabled={!!runningJob}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0 transition-all",
                      runningJob === key
                        ? "bg-amber-500/20 text-amber-400 cursor-wait"
                        : "bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-40 disabled:cursor-not-allowed",
                    )}
                  >
                    {runningJob === key ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Running
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3" />
                        Run
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Log output */}
            {(logs.length > 0 || jobStatus !== "idle") && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span className="font-medium">Output</span>
                    {jobStatus === "running" && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                    )}
                    {jobStatus === "success" && (
                      <CheckCircle className="h-3.5 w-3.5 text-green-400" />
                    )}
                    {jobStatus === "error" && (
                      <XCircle className="h-3.5 w-3.5 text-red-400" />
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setLogs([]);
                      setJobStatus("idle");
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div
                  ref={logRef}
                  className="h-96 overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-xs space-y-0.5 scroll-smooth"
                >
                  {logs.map((entry, i) => (
                    <div
                      key={i}
                      className={cn(
                        "leading-5 whitespace-pre-wrap break-all",
                        entry.type === "error"
                          ? "text-red-400"
                          : entry.type === "done"
                            ? "text-green-400 font-semibold"
                            : "text-zinc-300",
                      )}
                    >
                      {entry.text}
                    </div>
                  ))}
                  {jobStatus === "running" && (
                    <div className="text-zinc-600 animate-pulse">█</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Patches ── */}
        {tab === "patches" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                Create / Activate Patch
              </h2>
              <div className="flex items-end gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1.5">Version string</label>
                  <input
                    value={newPatchInput}
                    onChange={(e) => setNewPatchInput(e.target.value)}
                    placeholder="e.g. 1.9.10"
                    className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm w-40 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <button
                  onClick={() => void createPatch()}
                  disabled={!newPatchInput.trim() || patchActionLoading}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {patchActionLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create &amp; Set Latest
                </button>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                If the version already exists it will just be set as the active patch.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Database className="h-3.5 w-3.5" />
                Patch Versions
              </h2>

              {!stats?.patches.length ? (
                <p className="text-sm text-zinc-500">No patch versions in database.</p>
              ) : (
                <div className="border border-zinc-800 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-900 text-left text-xs text-zinc-500 uppercase tracking-wider">
                        <th className="px-4 py-3 font-medium">Version</th>
                        <th className="px-4 py-3 font-medium">Created</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {stats.patches.map((p) => (
                        <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-white">{p.version}</td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">
                            {new Date(p.createdAt).toLocaleDateString("en-US", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>
                          <td className="px-4 py-3">
                            {p.isLatest ? (
                              <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium">
                                <Star className="h-3 w-3 fill-amber-400" />
                                Latest
                              </span>
                            ) : (
                              <span className="text-zinc-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {!p.isLatest && (
                              <button
                                onClick={() => void setLatestPatch(p.id)}
                                disabled={patchActionLoading}
                                className="text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-40"
                              >
                                Set latest
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
