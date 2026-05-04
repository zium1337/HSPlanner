#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // Binary entry point that hands control to the library crate's `run()` and lets Tauri take over the rest of the lifecycle. Used as the minimal launcher for the desktop build.
  app_lib::run();
}
