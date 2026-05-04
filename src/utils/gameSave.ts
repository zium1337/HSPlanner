import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'

export interface HeroInfo {
  class_id: number
  name: string
  level: number
  hero_level: number
  hardcore: boolean
  wormhole_level: number
  chaos_towers_cleared: number
}

export interface InventoryItemRaw {
  key: string
  raw_value: string
  decoded: Record<string, unknown> | null
}

export interface SaveFileSummary {
  path: string
  slot: number | null
  hero: HeroInfo | null
  equipped: InventoryItemRaw[]
}

export interface ApplyHeroPayload {
  class_id?: number | null
  name?: string | null
  level?: number | null
  hero_level?: number | null
  hardcore?: boolean | null
  wormhole_level?: number | null
  chaos_towers_cleared?: number | null
}

export function isTauri(): boolean {
  // Detects whether the page is running inside the Tauri shell by probing for the `__TAURI_INTERNALS__` / `__TAURI__` window globals. Used by GameSaveView to gate every IPC call so the same component can render a friendly fallback in the browser build.
  if (typeof window === 'undefined') return false
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.__TAURI_INTERNALS__ ?? w.__TAURI__)
}

export async function defaultSaveDir(): Promise<string | null> {
  // Asks the Rust backend for the platform-default Hero Siege save directory, returning null when none can be resolved. Used by GameSaveView to pre-populate the directory picker.
  return await invoke<string | null>('gs_default_save_dir')
}

export async function listSaveDir(dir: string): Promise<SaveFileSummary[]> {
  // Invokes the Rust backend to enumerate every `.hss` save file in the supplied directory and returns a parsed summary per slot. Used by GameSaveView to render the save-file picker.
  return await invoke<SaveFileSummary[]>('gs_list_save_dir', { dir })
}

export async function readSaveFile(path: string): Promise<SaveFileSummary> {
  // Reads and parses a single `.hss` save file at the given absolute path through the Rust backend. Used by GameSaveView when the user opens a specific save outside the auto-detected directory.
  return await invoke<SaveFileSummary>('gs_read_save_file', { path })
}

export async function applyHero(
  path: string,
  payload: ApplyHeroPayload,
): Promise<HeroInfo> {
  // Sends a partial HeroInfo patch to the Rust backend, which writes the supplied fields back into the `.hss` file at `path`, returning the post-write hero state. Used by GameSaveView's "Apply" action so the user can edit class/level/hardcore/etc. in place.
  return await invoke<HeroInfo>('gs_apply_hero', { path, payload })
}

export async function pickSaveFile(
  defaultPath?: string,
): Promise<string | null> {
  // Opens the native Tauri file picker filtered to `.hss` files and returns the chosen path or null when the user cancels. Used by GameSaveView's "Browse for save…" button.
  const result = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'Hero Siege Save', extensions: ['hss'] }],
    defaultPath,
  })
  if (typeof result === 'string') return result
  return null
}

export async function pickSaveFolder(
  defaultPath?: string,
): Promise<string | null> {
  // Opens the native Tauri directory picker and returns the chosen folder path or null when the user cancels. Used by GameSaveView when the user wants to point HeroPlanner at a non-default save directory.
  const result = await open({
    multiple: false,
    directory: true,
    defaultPath,
  })
  if (typeof result === 'string') return result
  return null
}
