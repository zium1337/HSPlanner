# HSPlanner

A desktop build planner for **Hero Siege** — a calculator for the talent tree, gear, stats, and skills, with optional read/write support for the game's save files.

The app ships as a native Tauri binary (Windows / macOS / Linux) with a React + TypeScript frontend. Builds can be saved locally, exported as compressed share URLs, and imported from other players.

---

## Features

- **Talent tree** — interactive pan/zoom graph view with auto-pathfinding, path preview on hover, and reset
- **Skills and sub-skills** — point allocation that respects skill prerequisites and per-level caps
- **Gear** — slots for weapons, armor, charms, jewelry with sockets (gems/runes) and runeword detection
- **Affixes** — add affixes with tier and adjustable roll
- **Stats** — aggregated bonuses from tree, gear, attributes, and runewords
- **Custom stats** — free-text user-entered stats for things outside the data model
- **Notes** — sanitized WYSIWYG editor (per build), preserved across share links
- **Builds menu** — multiple saved builds, each with multiple profiles
- **Share** — export the entire build to a compressed URL (lz-string)
- **Save File** — read and edit `.hss` Hero Siege save files (level, hero level, class, hardcore, wormhole, chaos towers)
- **Update check** — opt-in update check via GitHub Releases

---

## Runtime requirements (prebuilt app)

Download the installer / binary for your platform from Releases. The app is self-contained — end users do not need Node or Rust installed.

| Platform | Required component |
|---|---|
| Windows 10/11 | WebView2 Runtime (preinstalled on Win11; the installer pulls it on Win10) |
| macOS 10.15+ | None — WebKit is built into the OS |
| Linux (x86_64) | `webkit2gtk-4.1`, `libssl`, standard GTK runtime libraries |

The **Save File** feature needs access to the Hero Siege save folder (typically `%APPDATA%/Hero Siege/SaveFiles` on Windows). You pick the folder in the UI — the app does not read anything outside it.

---

## Development requirements

| Tool | Minimum version | Purpose |
|---|---|---|
| **Node.js** | 20.x LTS or newer | Frontend (Vite + React) |
| **npm** | 10.x (ships with Node 20+) | Package manager |
| **Rust toolchain** | `rustup` with `stable` (≥ 1.77) | Tauri backend |
| **Tauri prerequisites** | see below per OS | Linker, system libraries |

### Tauri — system prerequisites

Follow the [official Tauri guide](https://tauri.app/start/prerequisites/). Summary:

**Windows**
- Microsoft Visual Studio C++ Build Tools (workload "Desktop development with C++")
- WebView2 Runtime (only needed on Win10; Win11 has it preinstalled)

**macOS**
- Xcode Command Line Tools: `xcode-select --install`

**Linux (Debian/Ubuntu)**
```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### First-time setup

```bash
git clone <repo-url>
cd HSPlanner
npm install
```

`npm install` fetches frontend dependencies. Rust crates are downloaded and compiled on the first `tauri:dev` / `tauri:build` (initial build takes ~5–10 minutes; subsequent builds are much faster thanks to the `src-tauri/target/` cache).

---

## NPM scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server (frontend only, no Tauri) — `http://localhost:5173` |
| `npm run tauri:dev` | Full dev with Tauri (opens the native window + frontend HMR) |
| `npm run build` | Type-check + production frontend build into `dist/` |
| `npm run tauri:build` | Bundle binaries / installers into `src-tauri/target/release/bundle/` |
| `npm run preview` | Preview the built frontend through Vite |
| `npm run test` | Unit tests (Vitest) — single run |
| `npm run test:watch` | Tests in watch mode |
| `npm run lint` | ESLint (TypeScript-aware) |

### Typical developer workflow

```bash
npm run tauri:dev      # day-to-day development
npm run lint           # before committing
npm run test           # before committing
npm run tauri:build    # release build
```

---

## Project layout

```
HSPlanner/
├── src/                      # React + TypeScript frontend
│   ├── components/           # UI components (Tooltip, BuildsMenu, ...)
│   ├── views/                # Top-level views (Tree, Skills, Gear, Stats, ...)
│   ├── store/                # Zustand store (build state)
│   ├── data/                 # Game data (JSON: classes, skills, items, runes)
│   ├── utils/                # shareBuild, savedBuilds, stats, sanitizeHtml
│   ├── types/                # Shared TypeScript types
│   └── hooks/                # Custom React hooks
├── src-tauri/                # Rust backend
│   ├── src/
│   │   ├── lib.rs            # Tauri builder + invoke handlers
│   │   └── save_file.rs      # Hero Siege .hss save-file parser
│   ├── capabilities/         # Tauri permission grants
│   ├── tauri.conf.json       # Tauri config (CSP, window, bundle)
│   └── Cargo.toml
├── public/                   # Static assets (favicon, icons)
├── index.html                # Vite entry
├── vite.config.ts            # Vite + Vitest config
├── tsconfig.app.json         # TS config (strict + noUncheckedIndexedAccess)
└── eslint.config.js          # ESLint flat config
```

---

## Tech stack

**Frontend**
- React 19 + TypeScript 6 (strict mode)
- Vite 8 + Tailwind CSS 4
- Zustand (state management)
- Zod (runtime validation for untrusted payloads: share links, localStorage)
- lz-string (share-code compression)

**Backend (Tauri)**
- Rust 2021 edition
- `tauri-plugin-dialog` (file picker)
- `rust-ini` (parser for .hss save files)

**Tests / lint**
- Vitest + @testing-library/react + jsdom
- ESLint 9 (typescript-eslint, react-hooks, react-refresh)

---

## Security

The app accepts untrusted data from three sources: **share URLs**, **game save files**, and **localStorage**. Each is validated:

- **CSP** is enabled in `tauri.conf.json` (default-src 'self'; no inline scripts)
- **Capabilities** are narrowed — the frontend has no FS permissions; all file I/O goes through whitelisted Rust invoke handlers
- **shareBuild**: zod schema with size limits and numeric clamps
- **savedBuilds (localStorage)**: defensive parser with hard caps
- **sanitizeHtml**: tag + attribute whitelist for notes (XSS test suite in `sanitizeHtml.test.ts`)

---

## License

Private project, no open-source license. Game data (item names, skill names, class names) is the property of the Hero Siege publisher and is used here for informational purposes only.
