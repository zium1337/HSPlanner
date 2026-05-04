import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getClass } from "../data";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { useBuild } from "../store/build";
import {
  createBuild,
  listSavedBuilds,
  type SavedBuild,
} from "../utils/savedBuilds";
import {
  decodeShareToBuild,
  parseBuildCodeFromInput,
} from "../utils/shareBuild";

type Mode = "closed" | "menu" | "save" | "import" | "rename";

export default function BuildsMenu() {
  // Top-bar dropdown that lists every saved build and exposes Save / Import / Rename / Delete actions, with a transient notice flash, an outside-click closer, and a two-click confirm for delete. Used as the primary management surface for the persisted build library.
  const exportSnapshot = useBuild((s) => s.exportBuildSnapshot);
  const importBuildSnapshot = useBuild((s) => s.importBuildSnapshot);
  const loadSavedBuildAction = useBuild((s) => s.loadSavedBuild);
  const activeBuildId = useBuild((s) => s.activeBuildId);
  const activeProfileId = useBuild((s) => s.activeProfileId);
  const bindToBuild = useBuild((s) => s.bindToBuild);
  const deleteSavedBuild = useBuild((s) => s.deleteSavedBuild);
  const renameSavedBuild = useBuild((s) => s.renameSavedBuild);
  const commitActiveProfile = useBuild((s) => s.commitActiveProfile);
  const savedBuildsVersion = useBuild((s) => s.savedBuildsVersion);
  const [mode, setMode] = useState<Mode>("closed");
  const [saveName, setSaveName] = useState("");
  const [importText, setImportText] = useState("");
  const [renameTarget, setRenameTarget] = useState<SavedBuild | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const flashTimer = useRef<number | null>(null);

  const list = useMemo(
    () => (mode === "menu" || mode === "save" ? listSavedBuilds() : []),
    [mode, savedBuildsVersion],
  );

  const closeMenu = useCallback(() => setMode("closed"), []);
  useOutsideClick(rootRef, mode !== "closed", closeMenu);

  useEffect(() => {
    if (mode !== "menu") setPendingDeleteId(null);
  }, [mode]);

  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, []);

  const flash = (msg: string) => {
    // Shows a transient notice banner inside the dropdown and clears it after two seconds, replacing any previously-pending banner. Used after every save/load/import/delete action to give the user feedback.
    setNotice(msg);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setNotice(null), 2000);
  };

  const doSaveAsNew = () => {
    // Persists the current state as a brand-new SavedBuild (with the typed name), binds the in-memory state to it so further edits autosave, and flashes a confirmation. Used by the "Save as new build" action.
    const name = saveName.trim() || "Untitled build";
    const notes = useBuild.getState().notes;
    const rec = createBuild(name, exportSnapshot(), undefined, notes);
    bindToBuild(rec.id, rec.activeProfileId);
    flash(`Saved "${rec.name}"`);
    setSaveName("");
    setMode("menu");
  };

  const doOverwriteActive = () => {
    // Commits the current state into the currently-active SavedProfile and flashes a confirmation. Used by the "Save into active profile" action when a build is bound.
    if (!activeBuildId || !activeProfileId) return;
    if (commitActiveProfile()) flash("Updated active profile");
    setMode("menu");
  };

  const doLoad = (b: SavedBuild) => {
    // Loads a SavedBuild into the live state via the build store, closing the dropdown on success. Used as the row-click handler in the saved-builds list.
    const ok = loadSavedBuildAction(b.id);
    if (!ok) {
      flash("Failed to load build");
      return;
    }
    flash(`Loaded "${b.name}"`);
    setMode("closed");
  };

  const doDelete = (b: SavedBuild) => {
    // Implements the two-click confirmed delete: the first call arms the row, the second actually deletes via the build store and clears the armed state. Used by the per-row delete button.
    if (pendingDeleteId !== b.id) {
      setPendingDeleteId(b.id);
      return;
    }
    deleteSavedBuild(b.id);
    setPendingDeleteId(null);
    flash("Deleted");
  };

  const doImport = () => {
    // Parses the pasted text (URL or raw code), decodes it to a snapshot, imports it as freeform unsaved state, and closes the dropdown. Used by the Import tab's primary action.
    const code = parseBuildCodeFromInput(importText);
    if (!code) return;
    const decoded = decodeShareToBuild(code);
    if (!decoded) {
      flash("Invalid build code");
      return;
    }
    importBuildSnapshot(decoded.snapshot, decoded.notes);
    setImportText("");
    flash("Build imported");
    setMode("closed");
  };

  const doStartRename = (b: SavedBuild) => {
    // Switches the dropdown into rename mode pre-filled with the build's current name. Used by the per-row rename button.
    setRenameTarget(b);
    setRenameValue(b.name);
    setMode("rename");
  };

  const doRename = () => {
    // Persists the typed rename via the build store (falling back to the original name when the input is blank) and returns to the saved-builds list. Used as the rename submit handler.
    if (!renameTarget) return;
    renameSavedBuild(renameTarget.id, renameValue.trim() || renameTarget.name);
    setRenameTarget(null);
    setMode("menu");
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setMode(mode === "closed" ? "menu" : "closed")}
        className="inline-flex items-center gap-1.5 rounded border border-border bg-panel-2 px-2.5 py-1 text-xs text-text hover:border-accent hover:text-accent"
        title="Saved builds"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        Builds
      </button>

      {mode !== "closed" && (
        <div className="absolute right-0 top-full z-50 mt-2 w-md max-w-[90vw] rounded border border-border bg-panel p-3 text-xs shadow-lg">
          {notice && (
            <div className="mb-2 rounded border border-accent/50 bg-accent/10 px-2 py-1 text-[11px] text-accent">
              {notice}
            </div>
          )}

          <div className="mb-2 flex items-center gap-1.5 border-b border-border pb-2">
            <TabBtn active={mode === "menu"} onClick={() => setMode("menu")}>
              Saved ({list.length})
            </TabBtn>
            <TabBtn active={mode === "save"} onClick={() => setMode("save")}>
              + Save
            </TabBtn>
            <TabBtn
              active={mode === "import"}
              onClick={() => setMode("import")}
            >
              Import
            </TabBtn>
          </div>

          {mode === "menu" && (
            <SavedList
              list={list}
              activeBuildId={activeBuildId}
              pendingDeleteId={pendingDeleteId}
              onLoad={doLoad}
              onDelete={doDelete}
              onRename={doStartRename}
            />
          )}

          {mode === "save" && (
            <div className="space-y-2">
              {activeBuildId && activeProfileId && (
                <button
                  onClick={doOverwriteActive}
                  className="w-full rounded border border-accent/50 bg-accent/10 px-2 py-1 text-accent hover:bg-accent/20"
                >
                  Save into active profile
                </button>
              )}
              <label className="text-[10px] uppercase tracking-wider text-muted">
                Name (creates a new build with one profile)
              </label>
              <input
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doSaveAsNew();
                }}
                placeholder="e.g. Lightning Viking"
                className="w-full rounded border border-border bg-panel-2 px-2 py-1"
              />
              <button
                onClick={doSaveAsNew}
                className="w-full rounded border border-border bg-panel-2 px-2 py-1 text-text hover:border-accent hover:text-accent"
              >
                Save as new build
              </button>
            </div>
          )}

          {mode === "import" && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-muted">
                Paste build code
              </label>
              <textarea
                autoFocus
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Paste shared build code"
                rows={5}
                className="w-full rounded border border-border bg-panel-2 px-2 py-1 font-mono text-[11px]"
              />
              <button
                onClick={doImport}
                className="w-full rounded border border-accent/50 bg-accent/10 px-2 py-1 text-accent hover:bg-accent/20"
              >
                Import & load
              </button>
            </div>
          )}

          {mode === "rename" && renameTarget && (
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-wider text-muted">
                Rename "{renameTarget.name}"
              </label>
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") doRename();
                  if (e.key === "Escape") setMode("menu");
                }}
                className="w-full rounded border border-border bg-panel-2 px-2 py-1"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={doRename}
                  className="flex-1 rounded border border-accent/50 bg-accent/10 px-2 py-1 text-accent hover:bg-accent/20"
                >
                  Save
                </button>
                <button
                  onClick={() => setMode("menu")}
                  className="flex-1 rounded border border-border bg-panel-2 px-2 py-1 text-muted hover:text-text"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function buildLabel(b: SavedBuild): string {
  // Returns a one-line meta description for a SavedBuild row ("ClassName · N profiles"), used in the saved list under each build's title.
  const cls = b.classId ? getClass(b.classId) : undefined;
  const profileCount = b.profiles.length;
  return `${cls?.name ?? "No class"} · ${profileCount} profile${profileCount === 1 ? "" : "s"}`;
}

function SavedList({
  list,
  activeBuildId,
  pendingDeleteId,
  onLoad,
  onDelete,
  onRename,
}: {
  list: SavedBuild[];
  activeBuildId: string | null;
  pendingDeleteId: string | null;
  onLoad: (b: SavedBuild) => void;
  onDelete: (b: SavedBuild) => void;
  onRename: (b: SavedBuild) => void;
}) {
  // Renders the scrollable list of saved builds inside the menu, each row exposing load / rename / delete actions and an "(active)" badge. Used inside BuildsMenu when in the "menu" tab.
  if (list.length === 0) {
    return (
      <div className="text-center text-muted italic py-4">
        No saved builds yet. Use + Save to store one.
      </div>
    );
  }
  return (
    <ul className="max-h-80 overflow-y-auto space-y-0.5">
      {list.map((b) => (
        <li
          key={b.id}
          className={`group flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-panel-2 ${
            b.id === activeBuildId ? "bg-accent/5" : ""
          }`}
        >
          <button
            onClick={() => onLoad(b)}
            className="flex-1 min-w-0 text-left"
          >
            <div className="truncate text-accent font-medium">
              {b.name}
              {b.id === activeBuildId && (
                <span className="ml-1.5 text-[10px] text-muted">(active)</span>
              )}
            </div>
            <div className="text-[10px] text-muted truncate">
              {buildLabel(b)} · {formatDate(b.updatedAt)}
            </div>
          </button>
          <button
            onClick={() => onRename(b)}
            className="text-muted hover:text-text px-1"
            title="Rename"
            aria-label="Rename"
          >
            ✎
          </button>
          {pendingDeleteId === b.id ? (
            <button
              onClick={() => onDelete(b)}
              className="rounded border border-red-500/60 bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/20"
              title="Click again to confirm"
              aria-label="Confirm delete"
            >
              Confirm?
            </button>
          ) : (
            <button
              onClick={() => onDelete(b)}
              className="text-muted hover:text-red-400 px-1"
              title="Delete"
              aria-label="Delete"
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  // Renders a small dropdown tab pill with the active variant highlighted in the accent palette. Used by BuildsMenu's tab strip.
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 rounded text-[11px] ${
        active
          ? "bg-accent/15 text-accent border border-accent/40"
          : "text-muted border border-transparent hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function formatDate(iso: string): string {
  // Renders an ISO timestamp as a short "MMM D HH:MM" using the user's locale, falling back to the original string on parse failure. Used by SavedList to show each build's last-updated time.
  try {
    const d = new Date(iso);
    const day = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const time = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${day} ${time}`;
  } catch {
    return iso;
  }
}
