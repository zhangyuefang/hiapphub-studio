#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mode = args.iter().position(|a| a == "--mode")
        .and_then(|i| args.get(i + 1))
        .map(|s| s.as_str());

    match mode {
        Some("host") => hiapphub_host::run_host(),
        _ => hiapphub_shell_lib::run(),
    }
}
