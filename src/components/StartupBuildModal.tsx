import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { classes, getClass } from "../data";
import { listSavedBuilds, type SavedBuild } from "../utils/savedBuilds";
import {
  decodeShareToBuild,
  parseBuildCodeFromInput,
} from "../utils/shareBuild";

type SortKey = "lastOpened" | "name" | "level";

type Scope =
  | { kind: "recent" }
  | { kind: "all" }
  | { kind: "class"; classId: string };

interface BuildMeta {
  level: number;
  nodes: number;
  classId: string | null;
  className: string;
  decoded: boolean;
}

interface Props {
  onOpenBuild: (buildId: string) => void;
  onNewBuild: () => void;
  onImport: (snapshot: ReturnType<typeof decodeShareToBuild>) => void;
  onCancel: () => void;
}

const RECENT_LIMIT = 12;

export default function StartupBuildModal({
  onOpenBuild,
  onNewBuild,
  onImport,
  onCancel,
}: Props) {
  const builds = useMemo(() => listSavedBuilds(), []);

  const metaByBuild = useMemo<Record<string, BuildMeta>>(() => {
    const out: Record<string, BuildMeta> = {};
    for (const b of builds) {
      const profile =
        b.profiles.find((p) => p.id === b.activeProfileId) ?? b.profiles[0];
      const cls = b.classId ? getClass(b.classId) : undefined;
      let level = 1;
      let nodes = 0;
      let decoded = false;
      if (profile) {
        const share = decodeShareToBuild(profile.code);
        if (share) {
          level = share.snapshot.level;
          nodes = share.snapshot.allocatedTreeNodes.size;
          decoded = true;
        }
      }
      out[b.id] = {
        level,
        nodes,
        classId: b.classId,
        className: cls?.name ?? "Unknown",
        decoded,
      };
    }
    return out;
  }, [builds]);

  const classCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of builds) {
      if (!b.classId) continue;
      counts[b.classId] = (counts[b.classId] ?? 0) + 1;
    }
    return counts;
  }, [builds]);

  const availableClasses = useMemo(
    () => classes.filter((c) => (classCounts[c.id] ?? 0) > 0),
    [classCounts],
  );

  const [scope, setScope] = useState<Scope>(
    builds.length > 0 ? { kind: "recent" } : { kind: "all" },
  );
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("lastOpened");
  const [preferredId, setPreferredId] = useState<string | null>(
    builds[0]?.id ?? null,
  );
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const visible = useMemo(() => {
    const filter = search.trim().toLowerCase();
    let list = builds.slice();

    if (scope.kind === "class") {
      list = list.filter((b) => b.classId === scope.classId);
    }

    if (filter) {
      list = list.filter((b) => {
        if (b.name.toLowerCase().includes(filter)) return true;
        const meta = metaByBuild[b.id];
        if (meta && meta.className.toLowerCase().includes(filter)) return true;
        if (b.profiles.some((p) => p.name.toLowerCase().includes(filter)))
          return true;
        return false;
      });
    }

    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "level") {
        const la = metaByBuild[a.id]?.level ?? 0;
        const lb = metaByBuild[b.id]?.level ?? 0;
        return lb - la;
      }
      return (
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    });

    if (scope.kind === "recent") list = list.slice(0, RECENT_LIMIT);
    return list;
  }, [builds, metaByBuild, scope, search, sort]);

  const selectedId = useMemo(() => {
    if (preferredId && visible.some((b) => b.id === preferredId))
      return preferredId;
    return visible[0]?.id ?? null;
  }, [visible, preferredId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showImport) {
          setShowImport(false);
          return;
        }
        onCancel();
      }
      if (e.key === "Enter" && !showImport && selectedId) {
        onOpenBuild(selectedId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onOpenBuild, selectedId, showImport]);

  const selectedBuild = selectedId
    ? builds.find((b) => b.id === selectedId)
    : null;
  const selectedMeta = selectedBuild ? metaByBuild[selectedBuild.id] : null;

  const tryImport = (text: string) => {
    const code = parseBuildCodeFromInput(text);
    if (!code) {
      setImportError("Couldn't read a build code from input");
      return;
    }
    const decoded = decodeShareToBuild(code);
    if (!decoded) {
      setImportError("Invalid or corrupted build code");
      return;
    }
    setImportError(null);
    setShowImport(false);
    setImportText("");
    onImport(decoded);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      tryImport(text);
    };
    reader.onerror = () => setImportError("Could not read file");
    reader.readAsText(file);
  };

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[150] flex items-center justify-center backdrop-blur-sm"
      onMouseDown={onCancel}
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(201,165,90,0.08), rgba(0,0,0,0.85) 65%)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select build"
        onMouseDown={(e) => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-[920px] max-w-[94vw] flex-col overflow-hidden rounded-[6px] border border-border"
        style={{
          background:
            "linear-gradient(180deg, var(--color-panel-2), color-mix(in srgb, var(--color-bg) 80%, transparent))",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.02), 0 28px 72px rgba(0,0,0,0.72)",
        }}
      >
        <CornerMarks />

        <header
          className="flex items-start justify-between gap-3 border-b border-border px-6 py-5"
          style={{
            background:
              "linear-gradient(180deg, rgba(201,165,90,0.06), transparent)",
          }}
        >
          <div>
            <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-faint">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rotate-45 bg-accent-hot"
                style={{ boxShadow: "0 0 10px rgba(224,184,100,0.7)" }}
              />
              Library
              <span className="text-accent-hot">{builds.length}</span>
            </div>
            <h2
              className="m-0 text-[20px] font-semibold uppercase tracking-[0.16em] text-accent-hot"
              style={{ textShadow: "0 0 18px rgba(224,184,100,0.18)" }}
            >
              Select Build
            </h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Open a saved build or start a new one
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => {
                setImportError(null);
                setShowImport(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-border-2 bg-panel-2 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
            >
              <UploadIcon />
              Import from file
            </button>
            <button
              type="button"
              onClick={onNewBuild}
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-accent-deep bg-panel-2 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-accent-hot transition-colors hover:border-accent-hot hover:text-[#fff0c4]"
              style={{
                background: "linear-gradient(180deg, #3a2f1a, #2a2418)",
              }}
            >
              <PlusIcon />
              New build
            </button>
          </div>
        </header>

        <div
          className="grid min-h-[28rem] flex-1 overflow-hidden"
          style={{ gridTemplateColumns: "220px 1fr" }}
        >
          <aside
            className="flex flex-col gap-5 overflow-y-auto border-r border-border bg-black/25 px-3 py-4"
            style={{
              backgroundImage:
                "linear-gradient(180deg, rgba(201,165,90,0.03), transparent 30%)",
            }}
          >
            <SidebarSection label="Library">
              <SidebarRow
                label="Recent"
                count={Math.min(builds.length, RECENT_LIMIT)}
                active={scope.kind === "recent"}
                onClick={() => setScope({ kind: "recent" })}
              />
              <SidebarRow
                label="All builds"
                count={builds.length}
                active={scope.kind === "all"}
                onClick={() => setScope({ kind: "all" })}
              />
            </SidebarSection>

            {availableClasses.length > 0 && (
              <SidebarSection label="By class">
                {availableClasses.map((c) => {
                  const active =
                    scope.kind === "class" && scope.classId === c.id;
                  return (
                    <SidebarRow
                      key={c.id}
                      label={c.name}
                      count={classCounts[c.id] ?? 0}
                      active={active}
                      dotColor={classColor(c.id)}
                      onClick={() =>
                        setScope(
                          active
                            ? { kind: "all" }
                            : { kind: "class", classId: c.id },
                        )
                      }
                    />
                  );
                })}
              </SidebarSection>
            )}
          </aside>

          <section className="flex min-w-0 flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <div className="relative min-w-0 flex-1">
                <svg
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, class, or profile…"
                  className="w-full rounded-[3px] border border-border-2 px-3 py-2 pl-9 text-[13px] text-text placeholder:text-faint focus:border-accent-deep focus:outline-none focus:ring-2 focus:ring-accent-hot/15"
                  style={{
                    background:
                      "linear-gradient(180deg, #0d0e12, var(--color-panel-2))",
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
                  }}
                />
              </div>
              <label className="flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                Sort
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="rounded-[3px] border border-border-2 bg-panel-2 px-2 py-1.5 font-mono text-[11px] text-text focus:border-accent-deep focus:outline-none"
                >
                  <option value="lastOpened">Last opened</option>
                  <option value="name">Name</option>
                  <option value="level">Level</option>
                </select>
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {builds.length === 0 ? (
                <EmptyState onNewBuild={onNewBuild} />
              ) : visible.length === 0 ? (
                <div className="p-10 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
                  No matches
                </div>
              ) : (
                <ul className="flex flex-col gap-1.5 p-3">
                  {visible.map((b) => {
                    const meta = metaByBuild[b.id];
                    return (
                      <BuildCard
                        key={b.id}
                        build={b}
                        meta={meta}
                        selected={b.id === selectedId}
                        onSelect={() => setPreferredId(b.id)}
                        onOpen={() => onOpenBuild(b.id)}
                      />
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-black/35 px-5 py-3">
          <div className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
            {selectedBuild ? (
              <>
                <span className="text-accent-hot">{selectedBuild.name}</span>
                <span className="mx-2 text-faint">·</span>
                {selectedMeta?.className ?? "—"}
                <span className="mx-2 text-faint">·</span>
                Lv {selectedMeta?.level ?? "—"}
                <span className="mx-2 text-faint">·</span>
                {selectedBuild.profiles.length}P
              </>
            ) : (
              "No build selected"
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-[3px] border border-border-2 bg-transparent px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedId}
              onClick={() => selectedId && onOpenBuild(selectedId)}
              className="inline-flex items-center gap-2 rounded-[3px] border border-accent-deep px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-hot transition-all hover:border-accent-hot hover:text-[#fff0c4] disabled:cursor-not-allowed disabled:border-border-2 disabled:bg-transparent disabled:text-faint disabled:shadow-none"
              style={{
                background: selectedId
                  ? "linear-gradient(180deg, #3a2f1a, #2a2418)"
                  : undefined,
                boxShadow: selectedId
                  ? "0 0 18px rgba(224,184,100,0.18)"
                  : undefined,
              }}
            >
              Open build
              <span aria-hidden>→</span>
            </button>
          </div>
        </footer>
      </div>

      {showImport && (
        <ImportOverlay
          text={importText}
          error={importError}
          onTextChange={setImportText}
          onClose={() => setShowImport(false)}
          onPickFile={() => fileInputRef.current?.click()}
          onSubmit={() => tryImport(importText)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.hsbuild,.hspb,application/json,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>,
    document.body,
  );
}

function SidebarSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="px-2 pb-1 font-mono text-[9px] uppercase tracking-[0.22em] text-faint">
        {label}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function SidebarRow({
  label,
  count,
  active,
  dotColor,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dotColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex items-center justify-between gap-3 rounded-[3px] px-2.5 py-1.5 text-left text-[12px] transition-colors ${
        active
          ? "bg-accent-hot/10 text-accent-hot"
          : "text-muted hover:bg-white/[0.025] hover:text-text"
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-0 top-1.5 bottom-1.5 w-[2px] transition-opacity ${
          active ? "bg-accent-hot opacity-100" : "opacity-0"
        }`}
        style={
          active ? { boxShadow: "0 0 10px rgba(224,184,100,0.55)" } : undefined
        }
      />
      <span className="flex min-w-0 items-center gap-2">
        {dotColor && (
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{
              backgroundColor: dotColor,
              boxShadow: active ? `0 0 8px ${dotColor}` : undefined,
            }}
          />
        )}
        <span className="truncate">{label}</span>
      </span>
      <span
        className={`font-mono text-[10px] tabular-nums tracking-[0.06em] ${
          active ? "text-accent-hot" : "text-faint"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function BuildCard({
  build,
  meta,
  selected,
  onSelect,
  onOpen,
}: {
  build: SavedBuild;
  meta: BuildMeta | undefined;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const color = build.classId ? classColor(build.classId) : "#5a5448";
  const initial = (meta?.className?.[0] ?? "?").toUpperCase();
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={onOpen}
        className={`group relative grid w-full items-center gap-4 rounded-[3px] border px-3 py-2.5 text-left transition-all ${
          selected
            ? "border-accent-deep bg-accent-hot/[0.06]"
            : "border-border-2/60 bg-panel/40 hover:border-accent-deep/50 hover:bg-accent-hot/[0.03]"
        }`}
        style={{
          gridTemplateColumns: "44px 1fr auto",
          boxShadow: selected
            ? "0 0 0 1px rgba(224,184,100,0.18), 0 0 24px rgba(224,184,100,0.08)"
            : undefined,
        }}
      >
        <span
          aria-hidden
          className="flex h-11 w-11 items-center justify-center rounded-[3px] border font-mono text-[15px] font-bold tracking-tight"
          style={{
            color,
            borderColor: `${color}55`,
            background: `linear-gradient(180deg, ${color}1a, ${color}05)`,
            boxShadow: selected ? `0 0 14px ${color}40` : undefined,
          }}
        >
          {initial}
        </span>

        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`truncate text-[14px] font-medium tracking-[0.01em] ${
                selected
                  ? "text-accent-hot"
                  : "text-text group-hover:text-accent-hot"
              }`}
            >
              {build.name}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <span className="truncate">{meta?.className ?? "—"}</span>
            <span aria-hidden className="text-faint">
              ·
            </span>
            <span className="tabular-nums">
              {build.profiles.length} profile
              {build.profiles.length === 1 ? "" : "s"}
            </span>
            {!meta?.decoded && (
              <>
                <span aria-hidden className="text-faint">
                  ·
                </span>
                <span className="text-stat-red/80">unreadable</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          <span className="text-[13px] tabular-nums tracking-[0.02em] text-text">
            Lv <span className="text-accent-hot">{meta?.level ?? "—"}</span>
          </span>
          <span className="tabular-nums">
            {(meta?.nodes ?? 0).toLocaleString()} nodes
          </span>
          <span>{formatTimestamp(build.updatedAt)}</span>
        </div>
      </button>
    </li>
  );
}

function EmptyState({ onNewBuild }: { onNewBuild: () => void }) {
  return (
    <div className="flex h-full min-h-[20rem] flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        aria-hidden
        className="flex h-14 w-14 items-center justify-center rounded-full border border-accent-deep/50"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, rgba(224,184,100,0.18), transparent 70%)",
          boxShadow: "0 0 28px rgba(224,184,100,0.18)",
        }}
      >
        <span
          aria-hidden
          className="h-2 w-2 rotate-45 bg-accent-hot"
          style={{ boxShadow: "0 0 10px rgba(224,184,100,0.8)" }}
        />
      </div>
      <div>
        <h3 className="m-0 text-[15px] font-semibold uppercase tracking-[0.18em] text-accent-hot">
          No saved builds
        </h3>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          Start fresh or import an existing one
        </p>
      </div>
      <button
        type="button"
        onClick={onNewBuild}
        className="inline-flex items-center gap-2 rounded-[3px] border border-accent-deep px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-hot transition-colors hover:border-accent-hot hover:text-[#fff0c4]"
        style={{ background: "linear-gradient(180deg, #3a2f1a, #2a2418)" }}
      >
        <PlusIcon />
        New build
      </button>
    </div>
  );
}

function ImportOverlay({
  text,
  error,
  onTextChange,
  onClose,
  onPickFile,
  onSubmit,
}: {
  text: string;
  error: string | null;
  onTextChange: (s: string) => void;
  onClose: () => void;
  onPickFile: () => void;
  onSubmit: () => void;
}) {
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[160] flex items-center justify-center backdrop-blur-[2px]"
      onMouseDown={onClose}
      style={{ background: "rgba(0,0,0,0.55)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className="relative flex w-[520px] max-w-[92vw] flex-col overflow-hidden rounded-[6px] border border-border"
        style={{
          background:
            "linear-gradient(180deg, var(--color-panel-2), color-mix(in srgb, var(--color-bg) 80%, transparent))",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
        }}
      >
        <CornerMarks />
        <header
          className="flex items-center justify-between gap-3 border-b border-border px-5 py-4"
          style={{
            background:
              "linear-gradient(180deg, rgba(201,165,90,0.05), transparent)",
          }}
        >
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
              Import
            </div>
            <h3 className="m-0 text-[16px] font-semibold uppercase tracking-[0.14em] text-accent-hot">
              Import build
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[3px] border border-border-2 bg-panel-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            Close
          </button>
        </header>
        <div className="flex flex-col gap-3 p-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
            Paste a build code, share URL — or load from file
          </span>
          <textarea
            autoFocus
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Paste shared build code…"
            rows={6}
            className="w-full rounded-[3px] border border-border-2 px-3 py-2 font-mono text-[11px] tabular-nums text-text placeholder:text-faint focus:border-accent-deep focus:outline-none focus:ring-2 focus:ring-accent-hot/15"
            style={{
              background:
                "linear-gradient(180deg, #0d0e12, var(--color-panel-2))",
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
            }}
          />
          <button
            type="button"
            onClick={onPickFile}
            className="self-start rounded-[3px] border border-border-2 bg-panel-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            Choose file…
          </button>
          {error && (
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-stat-red">
              {error}
            </span>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border bg-black/30 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[3px] border border-border-2 bg-transparent px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-[3px] border border-accent-deep px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-hot transition-colors hover:border-accent-hot hover:text-[#fff0c4]"
            style={{ background: "linear-gradient(180deg, #3a2f1a, #2a2418)" }}
          >
            Import & load
          </button>
        </footer>
      </div>
    </div>
  );
}

function CornerMarks() {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 12,
    height: 12,
    border: "1px solid var(--color-accent-deep)",
    opacity: 0.6,
    pointerEvents: "none",
  };
  return (
    <>
      <span
        style={{
          ...base,
          top: -1,
          left: -1,
          borderRight: "none",
          borderBottom: "none",
        }}
      />
      <span
        style={{
          ...base,
          top: -1,
          right: -1,
          borderLeft: "none",
          borderBottom: "none",
        }}
      />
      <span
        style={{
          ...base,
          bottom: -1,
          left: -1,
          borderRight: "none",
          borderTop: "none",
        }}
      />
      <span
        style={{
          ...base,
          bottom: -1,
          right: -1,
          borderLeft: "none",
          borderTop: "none",
        }}
      />
    </>
  );
}

function PlusIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function classColor(classId: string): string {
  let hash = 0;
  for (let i = 0; i < classId.length; i++) {
    hash = (hash * 31 + classId.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 58% 58%)`;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    const time = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (sameDay) return `Today, ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (
      d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getDate() === yesterday.getDate()
    ) {
      return `Yesterday, ${time}`;
    }
    const day = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return `${day}, ${time}`;
  } catch {
    return iso;
  }
}
