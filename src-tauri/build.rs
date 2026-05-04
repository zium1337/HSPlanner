fn main() {
  // Cargo build script that delegates to `tauri_build::build()` so Tauri's compile-time codegen and resource bundling run before the crate is built. Required for every Tauri application.
  tauri_build::build()
}
