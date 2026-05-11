use super::algo::suggest;
use super::types::{PrecomputedInput, SuggestResult};

#[tauri::command]
pub async fn suggest_tree_nodes(
    app: tauri::AppHandle,
    input: PrecomputedInput,
) -> SuggestResult {
    // Run the CPU-heavy greedy/DPS loop on a blocking thread so the Tauri event
    // loop (and therefore the webview) stays responsive while it iterates.
    tauri::async_runtime::spawn_blocking(move || suggest(&input, Some(&app)))
        .await
        .expect("suggest_tree_nodes task panicked")
}
