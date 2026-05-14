import { useState } from "react";
import { getSavedBuild } from "../utils/savedBuilds";
import { useBuild } from "../store/build";
import StartupBuildModal from "./StartupBuildModal";

const HEADER_BTN_CLASS =
  "inline-flex items-center gap-1.5 rounded-[3px] border border-border-2 bg-panel-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted transition-colors hover:border-accent-deep hover:text-accent-hot";

export default function BuildsMenu() {
  // Header trigger for the build library. Owns nothing but the open flag — the modal itself reads and writes the build store directly, so the screen looks identical to the startup picker the user already knows.
  const activeBuildId = useBuild((s) => s.activeBuildId);
  const savedBuildsVersion = useBuild((s) => s.savedBuildsVersion);
  // savedBuildsVersion is the store cache-buster — re-derive the active build's name on every mutation so the header label stays fresh after rename/save.
  void savedBuildsVersion;
  const activeBuild = activeBuildId ? getSavedBuild(activeBuildId) : null;

  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
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

      <StartupBuildModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
