//! Load each native icon at its display size. Tauri's set_icon updates ICON_SMALL only.
use std::{collections::HashMap, sync::{Mutex, OnceLock}};
use tauri::Window;
use windows_sys::Win32::{System::LibraryLoader::GetModuleHandleW, UI::WindowsAndMessaging::{DestroyIcon, LoadImageW, SendMessageW, IMAGE_ICON, WM_SETICON}};

static OWNED: OnceLock<Mutex<HashMap<isize, [usize; 2]>>> = OnceLock::new();

pub fn update(window: &Window) {
    let scale = window.scale_factor().unwrap_or(1.0);
    update_for_scale(window, scale);
}

pub fn update_for_scale(window: &Window, scale: f64) {
    let Ok(handle) = window.hwnd() else { return };
    // The executable embeds one group (32512) with nine native resolutions.
    let mut icons = [0usize; 2];
    unsafe {
        let module = GetModuleHandleW(std::ptr::null());
        for (kind, base) in [16.0, 32.0].into_iter().enumerate() {
            let pixels = (base * scale).round().max(16.0) as i32;
            let icon = LoadImageW(module, 32512usize as *const u16, IMAGE_ICON, pixels, pixels, 0);
            if icon.is_null() {
                for loaded in icons { if loaded != 0 { DestroyIcon(loaded as _); } }
                return;
            }
            icons[kind] = icon as usize;
        }
        SendMessageW(handle.0 as _, WM_SETICON, 0, icons[0] as isize);
        SendMessageW(handle.0 as _, WM_SETICON, 1, icons[1] as isize);
    }
    if let Ok(mut owned) = OWNED.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        if let Some(previous) = owned.insert(handle.0 as isize, icons) {
            unsafe { for icon in previous { DestroyIcon(icon as _); } }
        }
    }
}

pub fn release(window: &Window) {
    let Ok(handle) = window.hwnd() else { return };
    if let Some(owned) = OWNED.get() {
        if let Ok(mut owned) = owned.lock() {
            if let Some(previous) = owned.remove(&(handle.0 as isize)) {
                unsafe { for icon in previous { DestroyIcon(icon as _); } }
            }
        }
    }
}
