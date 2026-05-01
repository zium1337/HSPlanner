use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use ini::Ini;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HeroInfo {
    pub class_id: i64,
    pub name: String,
    pub level: i64,
    pub hero_level: i64,
    pub hardcore: bool,
    pub wormhole_level: i64,
    pub chaos_towers_cleared: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InventoryItemRaw {
    pub key: String,
    pub raw_value: String,
    pub decoded: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SaveFileSummary {
    pub path: String,
    pub slot: Option<i64>,
    pub hero: Option<HeroInfo>,
    pub equipped: Vec<InventoryItemRaw>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ApplyHeroPayload {
    pub class_id: Option<i64>,
    pub name: Option<String>,
    pub level: Option<i64>,
    pub hero_level: Option<i64>,
    pub hardcore: Option<bool>,
    pub wormhole_level: Option<i64>,
    pub chaos_towers_cleared: Option<i64>,
}

fn parse_quoted_number(value: &str) -> Option<f64> {
    let trimmed = value.trim().trim_matches('"');
    trimmed.parse::<f64>().ok()
}

fn format_number(value: i64) -> String {
    format!("\"{}.000000\"", value)
}

fn quote(value: &str) -> String {
    format!("\"{}\"", value)
}

fn read_ini(path: &Path) -> Result<Ini, String> {
    Ini::load_from_file(path)
        .map_err(|e| format!("INI parse error at {}: {}", path.display(), e))
}

fn write_ini(ini: &Ini, path: &Path) -> Result<(), String> {
    ini.write_to_file(path)
        .map_err(|e| format!("INI write error at {}: {}", path.display(), e))
}

fn extract_hero(ini: &Ini) -> Option<HeroInfo> {
    let section = ini.section(Some("0"))?;

    let class_id = section
        .get("class")
        .and_then(parse_quoted_number)
        .map(|f| f as i64)?;
    let name = section
        .get("name")
        .map(|v| v.trim().trim_matches('"').to_string())
        .unwrap_or_else(|| "New Char".to_string());
    let level = section
        .get("level")
        .and_then(parse_quoted_number)
        .map(|f| f as i64)
        .unwrap_or(1);
    let hero_level = section
        .get("herolevel")
        .and_then(parse_quoted_number)
        .map(|f| f as i64)
        .unwrap_or(0);
    let hardcore = section
        .get("hardcore")
        .and_then(parse_quoted_number)
        .map(|f| f as i64 != 0)
        .unwrap_or(false);
    let wormhole_level = section
        .get("wormhole_level")
        .and_then(parse_quoted_number)
        .map(|f| f as i64)
        .unwrap_or(0);
    let chaos_towers_cleared = section
        .get("chaos_towers_cleared")
        .and_then(parse_quoted_number)
        .map(|f| f as i64)
        .unwrap_or(0);

    Some(HeroInfo {
        class_id,
        name,
        level,
        hero_level,
        hardcore,
        wormhole_level,
        chaos_towers_cleared,
    })
}

fn extract_equipped(ini: &Ini) -> Vec<InventoryItemRaw> {
    let mut items = Vec::new();
    if let Some(section) = ini.section(Some("inventory")) {
        for (key, value) in section.iter() {
            let trimmed = value.trim().trim_matches(|c| c == '"' || c == '\'');
            let decoded = BASE64
                .decode(trimmed)
                .ok()
                .and_then(|bytes| String::from_utf8(bytes).ok())
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok());
            items.push(InventoryItemRaw {
                key: key.to_string(),
                raw_value: value.to_string(),
                decoded,
            });
        }
    }
    items
}

fn slot_from_filename(path: &Path) -> Option<i64> {
    let stem = path.file_stem()?.to_str()?;
    if let Some(rest) = stem.strip_prefix("herosiege") {
        rest.parse::<i64>().ok()
    } else {
        None
    }
}

pub fn read_save_file(path: &Path) -> Result<SaveFileSummary, String> {
    let ini = read_ini(path)?;
    Ok(SaveFileSummary {
        path: path.display().to_string(),
        slot: slot_from_filename(path),
        hero: extract_hero(&ini),
        equipped: extract_equipped(&ini),
    })
}

pub fn list_save_dir(dir: &Path) -> Result<Vec<SaveFileSummary>, String> {
    if !dir.exists() {
        return Err(format!("Folder {} nie istnieje", dir.display()));
    }
    if !dir.is_dir() {
        return Err(format!("{} nie jest folderem", dir.display()));
    }

    let mut summaries = Vec::new();
    for slot in 0..36i64 {
        let candidate = dir.join(format!("herosiege{}.hss", slot));
        if candidate.exists() {
            match read_save_file(&candidate) {
                Ok(summary) => summaries.push(summary),
                Err(err) => {
                    summaries.push(SaveFileSummary {
                        path: candidate.display().to_string(),
                        slot: Some(slot),
                        hero: None,
                        equipped: Vec::new(),
                    });
                    log::warn!("Nie udało się odczytać {}: {}", candidate.display(), err);
                }
            }
        }
    }
    Ok(summaries)
}

pub fn apply_hero(path: &Path, payload: &ApplyHeroPayload) -> Result<HeroInfo, String> {
    let mut ini = read_ini(path)?;

    {
        let section = ini.section_mut(Some("0")).ok_or_else(|| {
            format!(
                "Plik {} nie ma sekcji [0] — to nie wygląda na save Hero Siege",
                path.display()
            )
        })?;

        if let Some(class_id) = payload.class_id {
            section.insert("class", format_number(class_id));
        }
        if let Some(name) = &payload.name {
            section.insert("name", quote(name));
        }
        if let Some(level) = payload.level {
            section.insert("level", format_number(level));
        }
        if let Some(hl) = payload.hero_level {
            section.insert("herolevel", format_number(hl));
        }
        if let Some(hardcore) = payload.hardcore {
            section.insert("hardcore", format_number(if hardcore { 1 } else { 0 }));
        }
        if let Some(w) = payload.wormhole_level {
            section.insert("wormhole_level", format_number(w));
        }
        if let Some(c) = payload.chaos_towers_cleared {
            section.insert("chaos_towers_cleared", format_number(c));
        }
    }

    write_ini(&ini, path)?;

    let updated = read_ini(path)?;
    extract_hero(&updated).ok_or_else(|| "Nie udało się odczytać hero info po zapisie".into())
}

pub fn detect_default_save_dir() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        if let Some(local) = dirs::data_local_dir() {
            let modern = local.join("Hero_Siege").join("hs2saves");
            if modern.exists() {
                return Some(modern);
            }
            let legacy = local
                .join("Hero_Siege")
                .join("hseditor")
                .join("saves");
            if legacy.exists() {
                return Some(legacy);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(home) = dirs::home_dir() {
            let app_support = home
                .join("Library")
                .join("Application Support")
                .join("Hero_Siege")
                .join("hs2saves");
            if app_support.exists() {
                return Some(app_support);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(data) = dirs::data_dir() {
            let p = data.join("Hero_Siege").join("hs2saves");
            if p.exists() {
                return Some(p);
            }
        }
        if let Some(home) = dirs::home_dir() {
            let proton = home
                .join(".steam")
                .join("steam")
                .join("steamapps")
                .join("compatdata")
                .join("269210")
                .join("pfx")
                .join("drive_c")
                .join("users")
                .join("steamuser")
                .join("AppData")
                .join("Local")
                .join("Hero_Siege")
                .join("hs2saves");
            if proton.exists() {
                return Some(proton);
            }
        }
    }

    None
}

#[tauri::command]
pub fn gs_default_save_dir() -> Option<String> {
    detect_default_save_dir().map(|p| p.display().to_string())
}

#[tauri::command]
pub fn gs_list_save_dir(dir: String) -> Result<Vec<SaveFileSummary>, String> {
    list_save_dir(Path::new(&dir))
}

#[tauri::command]
pub fn gs_read_save_file(path: String) -> Result<SaveFileSummary, String> {
    read_save_file(Path::new(&path))
}

#[tauri::command]
pub fn gs_apply_hero(path: String, payload: ApplyHeroPayload) -> Result<HeroInfo, String> {
    apply_hero(Path::new(&path), &payload)
}
