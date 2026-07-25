#[cfg(desktop)]
use tauri::menu::Menu;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // 使用空菜单替换默认系统菜单栏（仅在桌面端生效）
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.set_menu(Menu::new(app)?)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
