#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Library entry point that wires Tauri together: registers the dialog, fs, updater, and process plugins, attaches the debug-only log plugin, and starts the application. Used by `main.rs` and the Tauri mobile entry point.
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
