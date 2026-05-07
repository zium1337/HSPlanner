import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { getClass } from "../data";
import { useBuild } from "../store/build";
import {
  createBuild,
  getSavedBuild,
  listSavedBuilds,
  type SavedBuild,
  type SavedProfile,
} from "../utils/savedBuilds";
import {
  decodeShareToBuild,
  parseBuildCodeFromInput,
} from "../utils/shareBuild";

type Mode =
  | "closed"
  | "menu"
  | "save"
  | "import"
  | "renameBuild"
  | "renameProfile"
  | "addProfile";

interface ContextMenuState {
  x: number;
  y: number;
  kind: "build" | "profile";
  buildId: string;
  profileId?: string;
}

const HEADER_BTN_CLASS =
  "inline-flex items-center gap-1.5 rounded-[3px] border border-border-2 bg-panel-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot";

const FOOTER_BTN_CLASS =
  "rounded-[3px] border border-border-2 bg-transparent px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot";

const FOOTER_BTN_PRIMARY_CLASS =
  "rounded-[3px] border border-accent-deep px-3.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-hot transition-colors hover:border-accent-hot hover:text-[#fff0c4]";

const CONTEXT_ITEM_CLASS =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[11px] tracking-[0.06em] text-text transition-colors hover:bg-accent-hot/10 hover:text-accent-hot";

const CONTEXT_ITEM_DANGER_CLASS =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[11px] tracking-[0.06em] text-muted transition-colors hover:bg-stat-red/10 hover:text-stat-red";

export default function BuildsMenu() {
  // Top-bar entry that opens a PickerModal-styled library of saved builds. Each build expands its profiles when active, both have right-click context menus for Update/Rename/Delete/etc., and Save/Import/Add-profile are exposed as footer actions. Replaces both the legacy popover dropdown and the old TopBar ProfileSwitcher.
  const exportSnapshot = useBuild((s) => s.exportBuildSnapshot);
  const importBuildSnapshot = useBuild((s) => s.importBuildSnapshot);
  const loadSavedBuildAction = useBuild((s) => s.loadSavedBuild);
  const activeBuildId = useBuild((s) => s.activeBuildId);
  const activeProfileId = useBuild((s) => s.activeProfileId);
  const bindToBuild = useBuild((s) => s.bindToBuild);
  const deleteSavedBuild = useBuild((s) => s.deleteSavedBuild);
  const renameSavedBuild = useBuild((s) => s.renameSavedBuild);
  const commitActiveProfile = useBuild((s) => s.commitActiveProfile);
  const switchActiveProfile = useBuild((s) => s.switchActiveProfile);
  const addProfileToActiveBuild = useBuild(
    (s) => s.addProfileToActiveBuild,
  );
  const duplicateActiveProfile = useBuild((s) => s.duplicateActiveProfile);
  const renameActiveProfile = useBuild((s) => s.renameActiveProfile);
  const removeActiveProfile = useBuild((s) => s.removeActiveProfile);
  const savedBuildsVersion = useBuild((s) => s.savedBuildsVersion);

  const [mode, setMode] = useState<Mode>("closed");
  const [search, setSearch] = useState("");
  const [saveName, setSaveName] = useState("");
  const [importText, setImportText] = useState("");
  const [renameBuildTarget, setRenameBuildTarget] = useState<SavedBuild | null>(
    null,
  );
  const [renameProfileTarget, setRenameProfileTarget] =
    useState<SavedProfile | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [addProfileValue, setAddProfileValue] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const flashTimer = useRef<number | null>(null);

  const list = useMemo(
    () => (mode === "closed" ? [] : listSavedBuilds()),
    // savedBuildsVersion is the store cache-buster: re-read on every store mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, savedBuildsVersion],
  );

  const activeBuild = useMemo(
    () => (activeBuildId ? getSavedBuild(activeBuildId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBuildId, savedBuildsVersion],
  );

  useEffect(() => {
    return () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, []);

  const closeAll = () => {
    // Closes the library and resets transient UI state (search box, armed delete, open context menu). Used as the single exit point so we don't need a setState-in-effect cleanup.
    setMode("closed");
    setSearch("");
    setContextMenu(null);
    setPendingDeleteKey(null);
  };

  const flash = (msg: string) => {
    // Shows a transient notice in the dialog footer for 2 seconds, replacing any previous message.
    setNotice(msg);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setNotice(null), 2000);
  };

  const filter = search.trim().toLowerCase();
  const filteredBuilds = useMemo(() => {
    if (!filter) return list;
    return list.filter((b) => {
      if (b.name.toLowerCase().includes(filter)) return true;
      const cls = b.classId ? getClass(b.classId) : undefined;
      if (cls?.name.toLowerCase().includes(filter)) return true;
      if (b.profiles.some((p) => p.name.toLowerCase().includes(filter)))
        return true;
      return false;
    });
  }, [list, filter]);

  const doSaveAsNew = () => {
    // Persists the current state as a brand-new SavedBuild and binds in-memory state to it.
    const name = saveName.trim() || "Untitled build";
    const notes = useBuild.getState().notes;
    const rec = createBuild(name, exportSnapshot(), undefined, notes);
    bindToBuild(rec.id, rec.activeProfileId);
    flash(`Saved "${rec.name}"`);
    setSaveName("");
    setMode("menu");
  };

  const doOverwriteActive = (buildId: string) => {
    // Commits the current state into the active SavedProfile when the targeted build is the active one.
    if (!activeBuildId || !activeProfileId) return;
    if (buildId !== activeBuildId) return;
    if (commitActiveProfile()) flash("Updated active profile");
  };

  const doLoad = (b: SavedBuild) => {
    // Loads a SavedBuild into live state via the store and closes the dialog on success.
    if (b.id === activeBuildId) return;
    const ok = loadSavedBuildAction(b.id);
    if (!ok) {
      flash("Failed to load build");
      return;
    }
    flash(`Loaded "${b.name}"`);
  };

  const doDeleteBuild = (b: SavedBuild) => {
    // Two-click confirmed delete on a build, keyed by `build:<id>`. First click arms, second deletes.
    const key = `build:${b.id}`;
    if (pendingDeleteKey !== key) {
      setPendingDeleteKey(key);
      return;
    }
    deleteSavedBuild(b.id);
    setPendingDeleteKey(null);
    flash(`Deleted "${b.name}"`);
  };

  const doDeleteProfile = (p: SavedProfile) => {
    // Two-click confirmed delete on a profile of the active build, keyed by `profile:<id>`. First click arms, second deletes via the store.
    if (!activeBuild) return;
    if (activeBuild.profiles.length <= 1) {
      flash("Cannot remove the last profile");
      return;
    }
    const key = `profile:${p.id}`;
    if (pendingDeleteKey !== key) {
      setPendingDeleteKey(key);
      return;
    }
    if (removeActiveProfile(p.id)) {
      setPendingDeleteKey(null);
      flash(`Removed profile "${p.name}"`);
    }
  };

  const doImport = () => {
    // Parses pasted text (URL or raw code), decodes it, and imports it as freeform unsaved state.
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
    setMode("menu");
  };

  const doStartRenameBuild = (b: SavedBuild) => {
    setRenameBuildTarget(b);
    setRenameValue(b.name);
    setMode("renameBuild");
  };

  const doRenameBuild = () => {
    if (!renameBuildTarget) return;
    renameSavedBuild(
      renameBuildTarget.id,
      renameValue.trim() || renameBuildTarget.name,
    );
    setRenameBuildTarget(null);
    setMode("menu");
  };

  const doStartRenameProfile = (p: SavedProfile) => {
    setRenameProfileTarget(p);
    setRenameValue(p.name);
    setMode("renameProfile");
  };

  const doRenameProfile = () => {
    if (!renameProfileTarget) return;
    renameActiveProfile(
      renameProfileTarget.id,
      renameValue.trim() || renameProfileTarget.name,
    );
    setRenameProfileTarget(null);
    setMode("menu");
  };

  const doActivateProfile = (p: SavedProfile) => {
    if (p.id === activeProfileId) return;
    if (switchActiveProfile(p.id)) flash(`Profile: ${p.name}`);
  };

  const doDuplicateProfile = (p: SavedProfile) => {
    if (duplicateActiveProfile(p.id)) flash(`Duplicated "${p.name}"`);
  };

  const doAddProfile = () => {
    const fallback = activeBuild
      ? `Profile ${activeBuild.profiles.length + 1}`
      : "Profile";
    const name = addProfileValue.trim() || fallback;
    if (addProfileToActiveBuild(name)) {
      flash(`Added profile "${name}"`);
      setAddProfileValue("");
      setMode("menu");
    }
  };

  const openContextMenu = (
    e: React.MouseEvent,
    payload: Omit<ContextMenuState, "x" | "y">,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setPendingDeleteKey(null);
    setContextMenu({ x: e.clientX, y: e.clientY, ...payload });
  };

  const closeContextMenu = () => setContextMenu(null);

  const isMenuOpen =
    mode !== "closed" && mode !== "renameBuild" && mode !== "renameProfile";
  // We only render the main library shell for "menu", "save", "import", "addProfile".
  // Sub-modals (renameBuild, renameProfile) are rendered separately on top.

  return (
    <>
      <button
        onClick={() => setMode("menu")}
        className={HEADER_BTN_CLASS}
        title="Saved builds & profiles"
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
          aria-hidden
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        Builds
        {activeBuild && (
          <>
            <span aria-hidden className="text-faint">
              ·
            </span>
            <span className="max-w-[8rem] truncate text-accent-hot">
              {activeBuild.name}
            </span>
          </>
        )}
      </button>

      {isMenuOpen && (
        <DialogShell
          title="Saved Builds"
          sectionLabel="Library"
          sectionAccent={list.length}
          onClose={closeAll}
          width={680}
        >
          <div className="border-b border-border px-4 py-3">
            <div className="relative">
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
                placeholder="Search builds & profiles…"
                className="w-full rounded-[3px] border border-border-2 px-3 py-2 pl-9 text-text placeholder:text-faint focus:border-accent-deep focus:outline-none focus:ring-2 focus:ring-accent-hot/15"
                style={{
                  background:
                    "linear-gradient(180deg, #0d0e12, var(--color-panel-2))",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
                }}
              />
            </div>
          </div>

          <div
            className="js-list min-h-[24rem] flex-1 overflow-y-auto"
            onClick={closeContextMenu}
          >
            {filteredBuilds.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">
                {list.length === 0
                  ? "No saved builds yet — use + Save to store one"
                  : "No matches"}
              </div>
            ) : (
              <ul className="flex flex-col">
                {filteredBuilds.map((b) => {
                  const cls = b.classId ? getClass(b.classId) : undefined;
                  const isActive = b.id === activeBuildId;
                  const armed = pendingDeleteKey === `build:${b.id}`;
                  return (
                    <li key={b.id} className="border-b border-dashed border-border last:border-b-0">
                      <BuildRow
                        build={b}
                        className={cls?.name}
                        isActive={isActive}
                        armed={armed}
                        onLoad={() => doLoad(b)}
                        onContextMenu={(e) =>
                          openContextMenu(e, {
                            kind: "build",
                            buildId: b.id,
                          })
                        }
                      />
                      {isActive && (
                        <ProfileList
                          profiles={b.profiles}
                          activeProfileId={activeProfileId}
                          armedProfileKey={pendingDeleteKey}
                          onActivate={doActivateProfile}
                          onAdd={() => setMode("addProfile")}
                          onContextMenu={(e, p) =>
                            openContextMenu(e, {
                              kind: "profile",
                              buildId: b.id,
                              profileId: p.id,
                            })
                          }
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter status={notice ?? undefined}>
            <button
              onClick={() => setMode("save")}
              className={FOOTER_BTN_CLASS}
            >
              + Save new
            </button>
            <button
              onClick={() => setMode("import")}
              className={FOOTER_BTN_CLASS}
            >
              Import
            </button>
          </DialogFooter>
        </DialogShell>
      )}

      {mode === "save" && (
        <DialogShell
          title="Save build"
          sectionLabel="Save"
          onClose={() => setMode("menu")}
          width={460}
        >
          <div className="flex flex-col gap-3 p-5">
            {activeBuildId && activeProfileId && (
              <button
                onClick={() => {
                  doOverwriteActive(activeBuildId);
                  setMode("menu");
                }}
                className={`${FOOTER_BTN_PRIMARY_CLASS} w-full justify-center`}
                style={{
                  background: "linear-gradient(180deg, #3a2f1a, #2a2418)",
                }}
              >
                Save into active profile
              </button>
            )}
            <FieldLabel>New build name</FieldLabel>
            <DialogInput
              autoFocus
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doSaveAsNew();
                if (e.key === "Escape") setMode("menu");
              }}
              placeholder="e.g. Lightning Viking"
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              Creates a new build with one profile seeded from current state.
            </p>
          </div>
          <DialogFooter>
            <button
              onClick={doSaveAsNew}
              className={FOOTER_BTN_PRIMARY_CLASS}
              style={{
                background: "linear-gradient(180deg, #3a2f1a, #2a2418)",
              }}
            >
              Save as new
            </button>
            <button
              onClick={() => setMode("menu")}
              className={FOOTER_BTN_CLASS}
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogShell>
      )}

      {mode === "import" && (
        <DialogShell
          title="Import build"
          sectionLabel="Import"
          onClose={() => setMode("menu")}
          width={520}
        >
          <div className="flex flex-col gap-3 p-5">
            <FieldLabel>Paste build code or share URL</FieldLabel>
            <textarea
              autoFocus
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste shared build code"
              rows={6}
              className="w-full rounded-[3px] border border-border-2 px-3 py-2 font-mono text-[11px] tabular-nums text-text placeholder:text-faint focus:border-accent-deep focus:outline-none focus:ring-2 focus:ring-accent-hot/15"
              style={{
                background:
                  "linear-gradient(180deg, #0d0e12, var(--color-panel-2))",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
              }}
            />
          </div>
          <DialogFooter>
            <button
              onClick={doImport}
              className={FOOTER_BTN_PRIMARY_CLASS}
              style={{
                background: "linear-gradient(180deg, #3a2f1a, #2a2418)",
              }}
            >
              Import & load
            </button>
            <button
              onClick={() => setMode("menu")}
              className={FOOTER_BTN_CLASS}
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogShell>
      )}

      {mode === "addProfile" && activeBuild && (
        <DialogShell
          title="Add profile"
          sectionLabel="New profile"
          onClose={() => setMode("menu")}
          width={460}
        >
          <div className="flex flex-col gap-3 p-5">
            <FieldLabel>Profile name</FieldLabel>
            <DialogInput
              autoFocus
              value={addProfileValue}
              onChange={(e) => setAddProfileValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doAddProfile();
                if (e.key === "Escape") setMode("menu");
              }}
              placeholder={`Profile ${activeBuild.profiles.length + 1}`}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              Seeded with the current state, then activated.
            </p>
          </div>
          <DialogFooter>
            <button
              onClick={doAddProfile}
              className={FOOTER_BTN_PRIMARY_CLASS}
              style={{
                background: "linear-gradient(180deg, #3a2f1a, #2a2418)",
              }}
            >
              Add
            </button>
            <button
              onClick={() => setMode("menu")}
              className={FOOTER_BTN_CLASS}
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogShell>
      )}

      {mode === "renameBuild" && renameBuildTarget && (
        <DialogShell
          title={`Rename "${renameBuildTarget.name}"`}
          sectionLabel="Rename build"
          onClose={() => setMode("menu")}
          width={460}
        >
          <div className="flex flex-col gap-3 p-5">
            <FieldLabel>New name</FieldLabel>
            <DialogInput
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doRenameBuild();
                if (e.key === "Escape") setMode("menu");
              }}
            />
          </div>
          <DialogFooter>
            <button
              onClick={doRenameBuild}
              className={FOOTER_BTN_PRIMARY_CLASS}
              style={{
                background: "linear-gradient(180deg, #3a2f1a, #2a2418)",
              }}
            >
              Save
            </button>
            <button
              onClick={() => setMode("menu")}
              className={FOOTER_BTN_CLASS}
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogShell>
      )}

      {mode === "renameProfile" && renameProfileTarget && (
        <DialogShell
          title={`Rename "${renameProfileTarget.name}"`}
          sectionLabel="Rename profile"
          onClose={() => setMode("menu")}
          width={460}
        >
          <div className="flex flex-col gap-3 p-5">
            <FieldLabel>New profile name</FieldLabel>
            <DialogInput
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doRenameProfile();
                if (e.key === "Escape") setMode("menu");
              }}
            />
          </div>
          <DialogFooter>
            <button
              onClick={doRenameProfile}
              className={FOOTER_BTN_PRIMARY_CLASS}
              style={{
                background: "linear-gradient(180deg, #3a2f1a, #2a2418)",
              }}
            >
              Save
            </button>
            <button
              onClick={() => setMode("menu")}
              className={FOOTER_BTN_CLASS}
            >
              Cancel
            </button>
          </DialogFooter>
        </DialogShell>
      )}

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onClose={closeContextMenu}
          activeBuildId={activeBuildId}
          activeProfileId={activeProfileId}
          builds={list}
          armedKey={pendingDeleteKey}
          onLoadBuild={(b) => {
            doLoad(b);
            closeContextMenu();
          }}
          onUpdateBuild={(b) => {
            doOverwriteActive(b.id);
            closeContextMenu();
          }}
          onRenameBuild={(b) => {
            closeContextMenu();
            doStartRenameBuild(b);
          }}
          onDeleteBuild={(b) => {
            doDeleteBuild(b);
          }}
          onActivateProfile={(p) => {
            doActivateProfile(p);
            closeContextMenu();
          }}
          onRenameProfile={(p) => {
            closeContextMenu();
            doStartRenameProfile(p);
          }}
          onDuplicateProfile={(p) => {
            doDuplicateProfile(p);
            closeContextMenu();
          }}
          onDeleteProfile={(p) => {
            doDeleteProfile(p);
          }}
        />
      )}
    </>
  );
}

function BuildRow({
  build,
  className,
  isActive,
  armed,
  onLoad,
  onContextMenu,
}: {
  build: SavedBuild;
  className?: string;
  isActive: boolean;
  armed: boolean;
  onLoad: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  // Renders a single build row inside the library. Clicking loads, right-clicking opens the context menu. The active build is visually accented.
  return (
    <button
      type="button"
      onClick={onLoad}
      onContextMenu={onContextMenu}
      className={`group relative grid w-full items-center gap-3.5 px-4 py-2 text-left transition-colors hover:bg-accent-hot/5 ${
        isActive ? "bg-gradient-to-r from-accent-hot/10 to-transparent" : ""
      }`}
      style={{ gridTemplateColumns: "20px 1fr auto" }}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute left-0 top-0 bottom-0 w-[2px] bg-accent-hot transition-opacity ${
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        }`}
        style={
          isActive
            ? { boxShadow: "0 0 12px rgba(224,184,100,0.4)" }
            : undefined
        }
      />
      <span
        aria-hidden
        className={`inline-block h-1.5 w-1.5 rotate-45 ${isActive ? "bg-accent-hot" : "bg-faint"}`}
        style={
          isActive ? { boxShadow: "0 0 8px rgba(224,184,100,0.6)" } : undefined
        }
      />
      <div className="min-w-0 flex flex-col">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`truncate text-[13px] font-medium ${isActive ? "text-accent-hot" : "text-text group-hover:text-accent-hot"}`}
          >
            {build.name}
          </span>
          {isActive && (
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent-deep">
              Active
            </span>
          )}
          {armed && (
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-stat-red">
              Click delete again
            </span>
          )}
        </div>
        <span className="truncate font-mono text-[10px] tracking-[0.06em] text-muted">
          {className ?? "—"} · {build.profiles.length}P ·{" "}
          {formatDate(build.updatedAt)}
        </span>
      </div>
      <span
        aria-hidden
        className="font-mono text-[9px] uppercase tracking-[0.18em] text-faint group-hover:text-accent-deep"
      >
        Right-click ▾
      </span>
    </button>
  );
}

function ProfileList({
  profiles,
  activeProfileId,
  armedProfileKey,
  onActivate,
  onAdd,
  onContextMenu,
}: {
  profiles: SavedProfile[];
  activeProfileId: string | null;
  armedProfileKey: string | null;
  onActivate: (p: SavedProfile) => void;
  onAdd: () => void;
  onContextMenu: (e: React.MouseEvent, p: SavedProfile) => void;
}) {
  // Renders the list of profiles for the active build, indented under the build row. Clicking activates a profile, right-clicking opens its context menu. An "+ Add profile" footer row creates a new one.
  return (
    <div
      className="border-t border-border/60 bg-black/20"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgba(201,165,90,0.04), transparent 60%)",
      }}
    >
      <ul className="flex flex-col">
        {profiles.map((p) => {
          const active = p.id === activeProfileId;
          const armed = armedProfileKey === `profile:${p.id}`;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onActivate(p)}
                onContextMenu={(e) => onContextMenu(e, p)}
                className="group relative grid w-full items-center gap-3 px-4 py-1.5 pl-12 text-left transition-colors hover:bg-accent-hot/5"
                style={{ gridTemplateColumns: "12px 1fr auto" }}
              >
                <span
                  aria-hidden
                  className={`inline-block h-1 w-1 rotate-45 ${active ? "bg-accent-hot" : "bg-faint"}`}
                  style={
                    active
                      ? { boxShadow: "0 0 6px rgba(224,184,100,0.6)" }
                      : undefined
                  }
                />
                <span
                  className={`truncate text-[12px] ${active ? "text-accent-hot" : "text-muted group-hover:text-text"}`}
                >
                  {p.name}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-faint">
                  {active ? "Active" : armed ? "Click delete again" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center gap-2 border-t border-dashed border-border/60 px-4 py-1.5 pl-12 text-left font-mono text-[10px] uppercase tracking-[0.14em] text-faint transition-colors hover:bg-accent-hot/5 hover:text-accent-hot"
      >
        <span aria-hidden>+</span>
        Add profile
      </button>
    </div>
  );
}

function ContextMenu({
  state,
  onClose,
  activeBuildId,
  activeProfileId,
  builds,
  armedKey,
  onLoadBuild,
  onUpdateBuild,
  onRenameBuild,
  onDeleteBuild,
  onActivateProfile,
  onRenameProfile,
  onDuplicateProfile,
  onDeleteProfile,
}: {
  state: ContextMenuState;
  onClose: () => void;
  activeBuildId: string | null;
  activeProfileId: string | null;
  builds: SavedBuild[];
  armedKey: string | null;
  onLoadBuild: (b: SavedBuild) => void;
  onUpdateBuild: (b: SavedBuild) => void;
  onRenameBuild: (b: SavedBuild) => void;
  onDeleteBuild: (b: SavedBuild) => void;
  onActivateProfile: (p: SavedProfile) => void;
  onRenameProfile: (p: SavedProfile) => void;
  onDuplicateProfile: (p: SavedProfile) => void;
  onDeleteProfile: (p: SavedProfile) => void;
}) {
  // Floating context menu styled like a PickerModal mini-panel. Positioned at the cursor, dismisses on Escape or outside click. Resolves the targeted build/profile from incoming state and shows the relevant action set.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onDown() {
      onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const build = builds.find((b) => b.id === state.buildId);
  if (!build) return null;
  const profile =
    state.kind === "profile" && state.profileId
      ? (build.profiles.find((p) => p.id === state.profileId) ?? null)
      : null;
  const isActiveBuild = build.id === activeBuildId;
  const isActiveProfile = profile?.id === activeProfileId;
  const armedBuild = armedKey === `build:${build.id}`;
  const armedProfile = profile && armedKey === `profile:${profile.id}`;
  const lastProfile = build.profiles.length <= 1;

  return createPortal(
    <div
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
      className="fixed z-[200] flex min-w-[220px] flex-col overflow-hidden rounded-[4px] border border-accent-deep/60 py-1"
      style={{
        left: state.x,
        top: state.y,
        background: "var(--color-panel)",
        boxShadow:
          "0 12px 32px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div className="border-b border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-faint">
        {state.kind === "build" ? build.name : (profile?.name ?? "")}
      </div>
      {state.kind === "build" && (
        <>
          {!isActiveBuild && (
            <button
              type="button"
              onClick={() => onLoadBuild(build)}
              className={CONTEXT_ITEM_CLASS}
            >
              Load build
            </button>
          )}
          {isActiveBuild && (
            <button
              type="button"
              onClick={() => onUpdateBuild(build)}
              className={CONTEXT_ITEM_CLASS}
            >
              Update active profile
            </button>
          )}
          <button
            type="button"
            onClick={() => onRenameBuild(build)}
            className={CONTEXT_ITEM_CLASS}
          >
            Rename build…
          </button>
          <button
            type="button"
            onClick={() => onDeleteBuild(build)}
            className={CONTEXT_ITEM_DANGER_CLASS}
          >
            {armedBuild ? "Confirm delete?" : "Delete build"}
          </button>
        </>
      )}
      {state.kind === "profile" && profile && (
        <>
          {!isActiveProfile && (
            <button
              type="button"
              onClick={() => onActivateProfile(profile)}
              className={CONTEXT_ITEM_CLASS}
            >
              Activate profile
            </button>
          )}
          <button
            type="button"
            onClick={() => onRenameProfile(profile)}
            className={CONTEXT_ITEM_CLASS}
          >
            Rename profile…
          </button>
          <button
            type="button"
            onClick={() => onDuplicateProfile(profile)}
            className={CONTEXT_ITEM_CLASS}
          >
            Duplicate profile
          </button>
          <button
            type="button"
            disabled={lastProfile}
            onClick={() => onDeleteProfile(profile)}
            className={`${CONTEXT_ITEM_DANGER_CLASS} disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {armedProfile
              ? "Confirm delete?"
              : lastProfile
                ? "Delete profile (last)"
                : "Delete profile"}
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  // Small monospace uppercase form label used inside the dialogs.
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
      {children}
    </span>
  );
}

function DialogInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  // Standard text input styled like PickerModal's search field.
  const { className, style, ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-[3px] border border-border-2 px-3 py-2 text-text placeholder:text-faint focus:border-accent-deep focus:outline-none focus:ring-2 focus:ring-accent-hot/15 ${className ?? ""}`}
      style={{
        background: "linear-gradient(180deg, #0d0e12, var(--color-panel-2))",
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
        ...style,
      }}
    />
  );
}

function DialogFooter({
  status,
  children,
}: {
  status?: ReactNode;
  children: ReactNode;
}) {
  // Bottom action bar of a DialogShell, with optional status hint and right-aligned actions.
  return (
    <footer className="flex items-center justify-between gap-3 border-t border-border bg-black/30 px-4 py-3">
      <div className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-[0.06em] text-faint">
        {status ?? null}
      </div>
      <div className="flex shrink-0 gap-2">{children}</div>
    </footer>
  );
}

function DialogShell({
  title,
  sectionLabel,
  sectionAccent,
  onClose,
  width = 480,
  children,
}: {
  title: string;
  sectionLabel?: string;
  sectionAccent?: string | number;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  // Modal shell whose chrome (corners, gradient header, border, footer slot) matches PickerModal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-100 flex items-center justify-center backdrop-blur-sm"
      onMouseDown={onClose}
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(201,165,90,0.06), rgba(0,0,0,0.78) 60%)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className="relative flex max-h-[88vh] max-w-[94vw] flex-col overflow-hidden rounded-[6px] border border-border"
        style={{
          width,
          background:
            "linear-gradient(180deg, var(--color-panel-2), color-mix(in srgb, var(--color-bg) 80%, transparent))",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.02), 0 24px 64px rgba(0,0,0,0.7)",
        }}
      >
        <CornerMarks />
        <header
          className="flex items-start justify-between gap-3 border-b border-border px-5 py-4"
          style={{
            background:
              "linear-gradient(180deg, rgba(201,165,90,0.05), transparent)",
          }}
        >
          <div>
            {sectionLabel && (
              <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rotate-45 bg-accent-hot"
                  style={{ boxShadow: "0 0 8px rgba(224,184,100,0.6)" }}
                />
                {sectionLabel}
                {sectionAccent !== undefined && (
                  <span className="text-accent-hot">{sectionAccent}</span>
                )}
              </div>
            )}
            <h2
              className="m-0 text-[18px] font-semibold tracking-[0.02em] text-accent-hot"
              style={{ textShadow: "0 0 16px rgba(224,184,100,0.15)" }}
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-[3px] border border-border-2 bg-panel-2 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot"
          >
            Close
          </button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function CornerMarks() {
  // Renders the four small accent-deep L-marks at the dialog's corners, matching PickerModal's chrome.
  const base: React.CSSProperties = {
    position: "absolute",
    width: 10,
    height: 10,
    border: "1px solid var(--color-accent-deep)",
    opacity: 0.55,
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

function formatDate(iso: string): string {
  // Renders an ISO timestamp as a short "MMM D HH:MM" using the user's locale, falling back to the original string on parse failure. Used by the saved-builds rows.
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
