// Sembunyikan console window di build release Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    djdex_lib::run();
}
