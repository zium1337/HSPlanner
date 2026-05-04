import { useEffect, useState } from "react";
import BottomBar from "./components/BottomBar";
import BuildsMenu from "./components/BuildsMenu";
import LeftStatsPanel from "./components/LeftStatsPanel";
import ProfileSwitcher from "./components/ProfileSwitcher";
import ShareButton from "./components/ShareButton";
import { classes, getClass } from "./data";
import { useBuild } from "./store/build";
import { readStorageWithLegacy, writeStorage } from "./utils/storage";
import CharacterView from "./views/CharacterView";
import ConfigView from "./views/ConfigView";
import GearView from "./views/GearView";
import NotesView from "./views/NotesView";
import SkillsView from "./views/SkillsView";
import StatsView from "./views/StatsView";
import TreeView from "./views/TreeView";

const SECTIONS = [
  { id: "character", label: "Character", view: CharacterView },
  { id: "tree", label: "Tree", view: TreeView },
  { id: "skills", label: "Skills", view: SkillsView },
  { id: "gear", label: "Gear", view: GearView },
  { id: "stats", label: "Stats", view: StatsView },
  { id: "config", label: "Config", view: ConfigView },
  { id: "notes", label: "Notes", view: NotesView },
] as const;

type Section = (typeof SECTIONS)[number]["id"];

const SECTION_KEY = "hsplanner.activeSection.v1";
const LEGACY_SECTION_KEY = "heroplanner.activeSection.v1";
const SECTION_IDS = new Set<Section>(SECTIONS.map((s) => s.id));

function readInitialSection(): Section {
  // Reads the previously-active app section from localStorage (with the legacy "heroplanner" key fallback) and validates it against the known section ids, defaulting to "tree". Used to seed the App component so the user lands on the same tab they left.
  const stored = readStorageWithLegacy(SECTION_KEY, LEGACY_SECTION_KEY);
  if (stored && SECTION_IDS.has(stored as Section)) return stored as Section;
  return "tree";
}

function App() {
  // Top-level shell that hosts the navigation header (section tabs, class/level controls, ProfileSwitcher, BuildsMenu, ShareButton), the persistent LeftStatsPanel, the active section view, and the BottomBar. Persists the active section to localStorage and binds Ctrl/Cmd+F to focus the search input on Tree/Stats views.
  const [section, setSection] = useState<Section>(readInitialSection);

  useEffect(() => {
    writeStorage(SECTION_KEY, section);
  }, [section]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        if (section === "tree" || section === "stats") {
          const input = document.querySelector<HTMLInputElement>(
            "[data-search-input]",
          );
          if (input) {
            input.focus();
            input.select();
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [section]);

  const ActiveView = SECTIONS.find((s) => s.id === section)?.view ?? TreeView;
  const classId = useBuild((s) => s.classId);
  const level = useBuild((s) => s.level);
  const setClass = useBuild((s) => s.setClass);
  const setLevel = useBuild((s) => s.setLevel);
  const cls = classId ? getClass(classId) : undefined;

  const needsScroll = section !== "tree" && section !== "skills";

  return (
    <div className="flex h-screen w-screen flex-col bg-bg text-text">
      <header className="flex h-10 shrink-0 items-center gap-0 border-b border-border bg-panel pl-1 pr-2">
        <nav className="flex h-full items-stretch">
          {SECTIONS.map((s) => {
            const active = section === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`flex h-full items-center px-3.5 text-[13px] font-medium tracking-[0.02em] border-b-2 transition-colors ${
                  active
                    ? "text-accent-hot border-accent"
                    : "text-muted border-transparent hover:text-text"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 text-xs">
          {classes.length > 0 && (
            <>
              <label className="flex items-center gap-2 px-2 text-muted">
                <span className="text-faint uppercase tracking-[0.08em] text-[11px]">
                  Class
                </span>
                <div className="inline-flex items-center gap-1.5 rounded-[3px] border border-border bg-panel-2 px-2 py-1 hover:border-border-2">
                  <select
                    value={classId ?? ""}
                    onChange={(e) => setClass(e.target.value)}
                    className="bg-transparent text-[12px] text-text outline-none cursor-pointer min-w-20"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id} className="bg-panel">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="flex items-center gap-2 px-1 text-muted">
                <span className="text-faint uppercase tracking-[0.08em] text-[11px]">
                  Level
                </span>
                <div className="inline-flex items-center rounded-[3px] border border-border bg-panel-2 px-2 py-1 hover:border-border-2">
                  <input
                    type="number"
                    min={1}
                    value={level}
                    onChange={(e) => setLevel(Number(e.target.value))}
                    className="w-10 bg-transparent text-center text-[12px] text-text tabular-nums outline-none"
                  />
                </div>
              </label>
            </>
          )}
          {cls?.primaryAttribute && (
            <span className="hidden md:inline text-accent-deep text-[10px] uppercase tracking-[0.14em] px-1">
              {cls.primaryAttribute}
            </span>
          )}
          <ProfileSwitcher />
          <BuildsMenu />
          <ShareButton />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LeftStatsPanel />
        <main
          className={`flex-1 min-w-0 ${needsScroll ? "overflow-auto p-6" : "overflow-hidden"}`}
        >
          <ActiveView />
        </main>
      </div>

      <BottomBar />
    </div>
  );
}

export default App;
