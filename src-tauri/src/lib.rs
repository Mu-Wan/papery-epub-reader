#[cfg(desktop)]
use tauri::menu::Menu;
#[cfg(desktop)]
use tauri::Manager;
#[cfg(windows)]
mod windows_icon;

#[derive(serde::Serialize)]
struct DevicePower { percent: u8, charging: bool }

#[tauri::command]
fn device_power_status() -> Option<DevicePower> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
        let mut status: SYSTEM_POWER_STATUS = std::mem::zeroed();
        if GetSystemPowerStatus(&mut status) != 0 && status.BatteryLifePercent <= 100 && status.BatteryFlag != 128 {
            return Some(DevicePower { percent: status.BatteryLifePercent, charging: status.BatteryFlag & 8 != 0 });
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    builder
        .invoke_handler(tauri::generate_handler![device_power_status])
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        // 使用空菜单替换默认系统菜单栏（仅在桌面端生效）
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.set_menu(Menu::new(app)?)?;
                // Window and taskbar icons are separate native Windows slots.
                #[cfg(windows)]
                if let Some(window) = app.get_webview_window("main") {
                    windows_icon::update(&window.as_ref().window());
                }
                #[cfg(not(windows))]
                if let Some(window) = app.get_webview_window("main") {
                    window.set_icon(tauri::image::Image::from_bytes(include_bytes!("../icons/icon.ico"))?)?;
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(windows)]
            match event {
                tauri::WindowEvent::ScaleFactorChanged { scale_factor, .. } => windows_icon::update_for_scale(window, *scale_factor),
                tauri::WindowEvent::Destroyed => windows_icon::release(window),
                _ => {}
            }
            #[cfg(not(windows))]
            let _ = (window, event);
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
