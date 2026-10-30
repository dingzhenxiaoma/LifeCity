// Release builds use the Windows GUI subsystem so no console window appears.
#![cfg_attr(all(target_os = "windows", not(debug_assertions)), windows_subsystem = "windows")]

fn main() {
    lifecity_lib::run();
}
