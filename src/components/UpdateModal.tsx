import { useEffect, useMemo, useState } from "react";
import {
  installUpdate,
  type InstallProgress,
} from "../utils/installUpdate";
import { readStorage, writeStorage } from "../utils/storage";
import {
  BUILD_CHANNEL,
  formatBytes,
  parseChangelog,
  shortSha,
  type ChangelogSection,
  type ChangelogTag,
  type UpdateInfo,
} from "../utils/version";

const SKIP_KEY = "hsplanner.update.skipped_version";
const AUTO_INSTALL_KEY = "hsplanner.update.auto_install";

const TAG_LABEL: Record<ChangelogTag, string> = {
  new: "NEW",
  improved: "IMPROVED",
  balance: "BALANCE",
  fixes: "FIXES",
  other: "NOTES",
};

const TAG_CLASS: Record<ChangelogTag, string> = {
  new: "border-stat-green/40 text-stat-green bg-stat-green/10",
  improved: "border-stat-blue/40 text-stat-blue bg-stat-blue/10",
  balance: "border-stat-orange/40 text-stat-orange bg-stat-orange/10",
  fixes: "border-stat-red/40 text-stat-red bg-stat-red/10",
  other: "border-border-2 text-muted bg-panel-2",
};

interface Props {
  info: UpdateInfo;
  onClose: () => void;
  onSkipVersion?: (version: string) => void;
  mode?: "update" | "changelog";
}

export default function UpdateModal({
  info,
  onClose,
  onSkipVersion,
  mode = "update",
}: Props) {
  const isChangelog = mode === "changelog";
  const sections: ChangelogSection[] = useMemo(
    () => (info.body ? parseChangelog(info.body) : []),
    [info.body],
  );

  const [autoInstall, setAutoInstall] = useState<boolean>(
    () => readStorage(AUTO_INSTALL_KEY) === "1",
  );
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const isBusy =
    progress !== null &&
    progress.phase !== "done" &&
    progress.phase !== "error";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isBusy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, isBusy]);

  const onAutoInstallChange = (v: boolean) => {
    setAutoInstall(v);
    writeStorage(AUTO_INSTALL_KEY, v ? "1" : "0");
  };

  const onRemindLater = () => {
    if (!isBusy) onClose();
  };

  const onSkip = () => {
    if (isBusy) return;
    writeStorage(SKIP_KEY, info.latest);
    onSkipVersion?.(info.latest);
    onClose();
  };

  const onDownload = async () => {
    if (isBusy) return;
    setProgress({ phase: "checking" });
    try {
      await installUpdate(info.assetUrl ?? info.releaseUrl, setProgress);
      // In Tauri runtime, `installUpdate` triggers `relaunch()` and the app
      // restarts — code below will not execute. In browser dev fallback the
      // browser opens the asset URL and we just close the modal.
      onClose();
    } catch {
      // Error is already surfaced via setProgress; keep modal open so the
      // user can retry or close manually.
    }
  };

  const safeClose = () => {
    if (!isBusy) onClose();
  };

  const releaseDateText = info.publishedAt
    ? formatReleaseDate(info.publishedAt)
    : null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      role="presentation"
      onMouseDown={safeClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-160 max-w-[92vw] flex-col rounded-[5px] border border-accent-deep bg-panel shadow-[0_24px_64px_rgba(0,0,0,0.7)]"
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-base ${
              isChangelog
                ? "border-accent-deep/40 bg-accent-deep/10 text-accent-hot"
                : "border-stat-green/40 bg-stat-green/10 text-stat-green"
            }`}
          >
            {isChangelog ? "★" : "↑"}
          </div>
          <div className="flex-1 min-w-0">
            <div
              id="update-modal-title"
              className="brand-display text-[15px] text-text flex items-center gap-2"
            >
              <span>
                {isChangelog
                  ? `HSPlanner v${info.current}`
                  : "Update Available"}
              </span>
              {isChangelog && (
                <span
                  title={
                    BUILD_CHANNEL === "dev"
                      ? "Development build"
                      : "Stable build"
                  }
                  className={`rounded-[3px] border px-1.5 py-px font-mono text-[9px] tracking-[0.14em] ${
                    BUILD_CHANNEL === "dev"
                      ? "border-accent-deep/40 bg-accent-deep/10 text-accent-hot"
                      : "border-stat-green/40 bg-stat-green/10 text-stat-green"
                  }`}
                >
                  {BUILD_CHANNEL === "dev" ? "DEV" : "STABLE"}
                </span>
              )}
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted">
              {isChangelog
                ? "What's new in this version"
                : "A newer version of HSPlanner is ready"}
            </div>
          </div>
          <button
            type="button"
            onClick={safeClose}
            disabled={isBusy}
            aria-label="Close"
            className="h-8 w-8 shrink-0 rounded-[3px] text-muted transition-colors hover:bg-panel-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            ×
          </button>
        </header>

        {!isChangelog && (
          <section className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-border px-5 py-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-faint">
                Installed
              </div>
              <div className="font-mono text-[20px] text-text">
                v{info.current}
              </div>
            </div>
            <div className="text-2xl text-accent-deep">→</div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.14em] text-faint">
                Available
              </div>
              <div className="font-mono text-[20px] text-accent-hot">
                v{info.latest}
              </div>
            </div>
          </section>
        )}

        <section className="flex-1 overflow-y-auto px-5 py-4">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted mb-3">
            Changelog
            {releaseDateText && (
              <>
                <span className="mx-1.5 text-faint">·</span>
                {releaseDateText}
              </>
            )}
          </div>

          {sections.length === 0 ? (
            <p className="text-[12px] italic text-muted">
              {info.body
                ? "No structured changelog detected."
                : "No release notes available."}
            </p>
          ) : (
            <div className="space-y-4">
              {sections.map((s, i) => (
                <ChangelogBlock key={`${s.title}-${i}`} section={s} />
              ))}
            </div>
          )}
        </section>

        {!isChangelog && (
          <section className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border bg-panel-2/40 px-5 py-2.5 text-[11px] text-muted">
            {info.assetSize !== undefined && (
              <span>
                <span className="text-faint">Size</span>{" "}
                <span className="font-mono text-text">
                  {formatBytes(info.assetSize)}
                </span>
              </span>
            )}
            {info.assetSha && (
              <span>
                <span className="text-faint">SHA-256</span>{" "}
                <span className="font-mono text-text" title={info.assetSha}>
                  {shortSha(info.assetSha)}
                </span>
              </span>
            )}
            <span className="ml-auto">
              <span className="text-faint">Channel</span>{" "}
              <span className="text-text">stable</span>
            </span>
          </section>
        )}

        {!isChangelog && progress && (
          <ProgressBlock progress={progress} />
        )}

        <footer className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3.5">
          {isChangelog ? (
            <button
              type="button"
              onClick={safeClose}
              className="ml-auto rounded-[3px] border border-border bg-panel-2 px-3.5 py-1.5 text-[12px] text-text transition-colors hover:border-border-2"
            >
              Close
            </button>
          ) : (
            <>
              <label className="flex items-center gap-2 text-[12px] text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoInstall}
                  onChange={(e) => onAutoInstallChange(e.target.checked)}
                  disabled={isBusy}
                  className="accent-accent"
                />
                Auto-install on quit
              </label>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRemindLater}
                  disabled={isBusy}
                  className="rounded-[3px] border border-border bg-panel-2 px-3 py-1.5 text-[12px] text-text transition-colors hover:border-border-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remind Me Later
                </button>
                <button
                  type="button"
                  onClick={onSkip}
                  disabled={isBusy}
                  className="rounded-[3px] border border-border bg-panel-2 px-3 py-1.5 text-[12px] text-text transition-colors hover:border-border-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Skip This Version
                </button>
                <button
                  type="button"
                  onClick={onDownload}
                  disabled={isBusy}
                  className="btn-primary-gold rounded-[3px] px-3.5 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {progressLabel(progress)}
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function ChangelogBlock({ section }: { section: ChangelogSection }) {
  const label = TAG_LABEL[section.tag];
  const cls = TAG_CLASS[section.tag];
  return (
    <div>
      <div
        className={`inline-block rounded-[3px] border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] mb-2 ${cls}`}
      >
        {label}
      </div>
      <ul className="space-y-1.5 text-[13px] text-text">
        {section.items.map((it, i) => (
          <li key={i} className="flex gap-2.5 leading-relaxed">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-deep" />
            <span dangerouslySetInnerHTML={{ __html: renderInline(it) }} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Minimal inline markdown: **bold**, `code`. Escape HTML first.
function renderInline(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-accent-hot">$1</strong>')
    .replace(
      /`([^`]+)`/g,
      '<code class="font-mono text-[12px] rounded-xs bg-panel-2 px-1 text-accent-hot">$1</code>',
    );
}

function formatReleaseDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}

function progressLabel(p: InstallProgress | null): string {
  if (!p) return "↓ Download & Install";
  switch (p.phase) {
    case "checking":
      return "Checking…";
    case "downloading": {
      if (p.bytesTotal && p.bytesTotal > 0 && p.bytesDownloaded !== undefined) {
        const pct = Math.floor((p.bytesDownloaded / p.bytesTotal) * 100);
        return `Downloading ${pct}%`;
      }
      return "Downloading…";
    }
    case "installing":
      return "Installing…";
    case "done":
      return "Done";
    case "error":
      return "Retry";
    default:
      return "↓ Download & Install";
  }
}

function ProgressBlock({ progress }: { progress: InstallProgress }) {
  const pct =
    progress.phase === "downloading" &&
    progress.bytesTotal &&
    progress.bytesTotal > 0 &&
    progress.bytesDownloaded !== undefined
      ? Math.min(100, (progress.bytesDownloaded / progress.bytesTotal) * 100)
      : progress.phase === "installing" || progress.phase === "done"
        ? 100
        : null;
  const bytes =
    progress.bytesDownloaded !== undefined && progress.bytesTotal
      ? `${formatBytes(progress.bytesDownloaded)} / ${formatBytes(progress.bytesTotal)}`
      : null;
  return (
    <section className="border-t border-border bg-panel-2/40 px-5 py-3 text-[11px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="uppercase tracking-[0.14em] text-muted">
          {progress.phase === "error" ? "Error" : phaseLabel(progress.phase)}
        </span>
        {bytes && (
          <span className="font-mono text-faint">{bytes}</span>
        )}
      </div>
      {progress.phase === "error" ? (
        <p className="font-mono text-stat-red text-[11px]">
          {progress.error ?? "Install failed"}
        </p>
      ) : (
        <div className="h-1.5 w-full rounded-full bg-panel border border-border overflow-hidden">
          <div
            className="h-full bg-accent-hot transition-all"
            style={{
              width: pct !== null ? `${pct}%` : "30%",
              animation:
                pct === null
                  ? "pulse 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite"
                  : undefined,
            }}
          />
        </div>
      )}
    </section>
  );
}

function phaseLabel(phase: InstallProgress["phase"]): string {
  switch (phase) {
    case "checking":
      return "Checking for update";
    case "downloading":
      return "Downloading";
    case "installing":
      return "Installing";
    case "done":
      return "Done";
    default:
      return "";
  }
}
