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
  if (typeof window === 'undefined') return false
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.__TAURI_INTERNALS__ ?? w.__TAURI__)
}

export async function defaultSaveDir(): Promise<string | null> {
  return await invoke<string | null>('gs_default_save_dir')
}

export async function listSaveDir(dir: string): Promise<SaveFileSummary[]> {
  return await invoke<SaveFileSummary[]>('gs_list_save_dir', { dir })
}

export async function readSaveFile(path: string): Promise<SaveFileSummary> {
  return await invoke<SaveFileSummary>('gs_read_save_file', { path })
}

export async function applyHero(
  path: string,
  payload: ApplyHeroPayload,
): Promise<HeroInfo> {
  return await invoke<HeroInfo>('gs_apply_hero', { path, payload })
}

export async function pickSaveFile(
  defaultPath?: string,
): Promise<string | null> {
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
  const result = await open({
    multiple: false,
    directory: true,
    defaultPath,
  })
  if (typeof result === 'string') return result
  return null
}
