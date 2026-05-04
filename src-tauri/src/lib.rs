mod save_file;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Library entry point that wires Tauri together: registers the dialog, fs, updater, and process plugins, attaches the debug-only log plugin, exposes the `gs_*` save-file commands to the frontend, and starts the application. Used by `main.rs` and the Tauri mobile entry point.
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
    .invoke_handler(tauri::generate_handler![
      save_file::gs_default_save_dir,
      save_file::gs_list_save_dir,
      save_file::gs_read_save_file,
      save_file::gs_apply_hero,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
