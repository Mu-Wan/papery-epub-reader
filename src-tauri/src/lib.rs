#[cfg(desktop)]
use tauri::menu::Menu;
#[cfg(desktop)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        // 使用空菜单替换默认系统菜单栏（仅在桌面端生效）
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.set_menu(Menu::new(app)?)?;
                // 显式设置窗口图标，确保任务栏图标清晰
                if let Some(window) = app.get_webview_window("main") {
                    window.set_icon(tauri::image::Image::from_bytes(include_bytes!("../icons/icon.ico"))?)?;
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
