#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if !std::env::args().any(|a| a == "--app-id") {
        std::env::set_var("HIAPPHUB_APP_ID", "hiapphub-shell");
    }
    hiapphub_host::run_host();
}
