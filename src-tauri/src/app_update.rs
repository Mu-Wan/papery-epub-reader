use std::{sync::{atomic::{AtomicBool, Ordering}, Mutex}, time::{Duration, Instant}, path::PathBuf};
use tauri::{Manager, ipc::Channel};
use tokio::{io::AsyncWriteExt, sync::oneshot};
use sha2::{Digest, Sha256};
struct ActiveDownloadGuard<'a>(&'a AtomicBool);
impl Drop for ActiveDownloadGuard<'_>{fn drop(&mut self){self.0.store(false,Ordering::SeqCst);}}
const MAX_SIZE: u64 = 200 * 1024 * 1024;
#[derive(Clone)]
struct Verified { path: PathBuf, sha256: String, file_name: String }
#[derive(Default)]
pub struct UpdateDownload { busy: AtomicBool, cancel: Mutex<Option<oneshot::Sender<()>>>, verified: Mutex<Option<Verified>> }
#[derive(Clone, serde::Serialize)]
#[serde(rename_all="camelCase")]
pub struct DownloadProgress { phase: &'static str, downloaded: u64, total: Option<u64> }
pub fn valid_asset(url: &str, file_name: &str, sha256: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else { return false; };
    let repo = match parsed.host_str() { Some("gitee.com") => "/mu-wan/papery-epub-reader/releases/download/", Some("github.com") => "/Mu-Wan/papery-epub-reader/releases/download/", _ => return false };
    parsed.scheme()=="https" && parsed.port().is_none() && parsed.username().is_empty() && parsed.password().is_none()
        && parsed.path().starts_with(repo) && parsed.path().ends_with(&format!("/{file_name}"))
        && file_name.starts_with("Papery-") && file_name.bytes().all(|c|c.is_ascii_alphanumeric()||b".-".contains(&c))
        && (file_name.ends_with("-Windows-x64-Setup.exe")||file_name.ends_with("-Android-arm64.apk"))
        && sha256.len()==64 && sha256.bytes().all(|c|c.is_ascii_hexdigit())
}
#[tauri::command]
pub async fn download_app_update(app: tauri::AppHandle, url: String, file_name: String, sha256: String, on_progress: Channel<DownloadProgress>, state: tauri::State<'_, UpdateDownload>) -> Result<String,String> {
    if !valid_asset(&url,&file_name,&sha256) { return Err("安装包地址或校验值无效".into()); }
    let root=app.path().app_cache_dir().map_err(|_|"无法访问更新缓存")?.join("papery-updates");
    if state.busy.compare_exchange(false,true,Ordering::SeqCst,Ordering::SeqCst).is_err(){return Err("已有下载正在进行".into());}
    let _active=ActiveDownloadGuard(&state.busy);
    *state.verified.lock().map_err(|_|"更新状态无法读取")?=None;
    let (cancel_sender,mut cancel_receiver)=oneshot::channel();
    *state.cancel.lock().map_err(|_|"更新状态无法读取")?=Some(cancel_sender);
    let partial=root.join(format!("{file_name}.part"));let destination=root.join(&file_name);
    let result=async {
        tokio::fs::create_dir_all(&root).await.map_err(|_|"无法创建更新缓存，请检查剩余空间")?;
        let client=reqwest::Client::builder().connect_timeout(Duration::from_secs(12)).timeout(Duration::from_secs(900))
            .redirect(reqwest::redirect::Policy::custom(|attempt|{
                let u=attempt.url();let h=u.host_str().unwrap_or("");
                if attempt.previous().len()>8 || u.scheme()!="https" || !u.username().is_empty() || u.password().is_some() || !(h=="gitee.com"||h.ends_with(".gitee.com")||h=="github.com"||h.ends_with(".githubusercontent.com")) {attempt.error("下载重定向无效")} else {attempt.follow()}
            })).build().map_err(|_|"无法连接下载服务")?;
        let mut response=tokio::select! { r=client.get(&url).send()=>r.map_err(|_|"下载连接失败，请重试")?, _=&mut cancel_receiver=>return Err("已取消下载".into()) };
        if !response.status().is_success(){return Err(format!("下载服务暂不可用（{}）",response.status().as_u16()));}
        let total=response.content_length().filter(|n|*n>0);
        if total.is_some_and(|n|n>MAX_SIZE){return Err("安装包超出大小限制".into());}
        let mut file=tokio::fs::File::create(&partial).await.map_err(|_|"无法写入安装包，请检查剩余空间")?;
        let mut hash=Sha256::new();let mut downloaded=0u64;let mut last=Instant::now();let mut prefix:Vec<u8>=Vec::with_capacity(2);
        let _=on_progress.send(DownloadProgress{phase:"downloading",downloaded,total});
        loop {
            let chunk=tokio::select! { r=tokio::time::timeout(Duration::from_secs(30),response.chunk())=>r.map_err(|_|"下载连接超时，请重试")?.map_err(|_|"下载中断，请重试")?, _=&mut cancel_receiver=>return Err("已取消下载".into()) };
            let Some(chunk)=chunk else {break};
            if prefix.len()<2 {prefix.extend(chunk.iter().take(2-prefix.len()));if prefix.len()==2 && !(prefix==b"MZ"&&file_name.ends_with(".exe")||prefix==b"PK"&&file_name.ends_with(".apk")){return Err("下载内容不是有效安装包".into());}}
            downloaded+=chunk.len() as u64;if downloaded>MAX_SIZE{return Err("安装包超出大小限制".into());}
            file.write_all(&chunk).await.map_err(|_|"无法保存安装包，请检查剩余空间")?;hash.update(&chunk);
            if last.elapsed()>=Duration::from_millis(100){let _=on_progress.send(DownloadProgress{phase:"downloading",downloaded,total});last=Instant::now();}
        }
        if downloaded==0||total.is_some_and(|n|n!=downloaded){return Err("安装包下载不完整，请重试".into());}
        let _=on_progress.send(DownloadProgress{phase:"verifying",downloaded,total});
        file.flush().await.map_err(|_|"安装包保存失败")?;file.sync_all().await.map_err(|_|"安装包保存失败")?;drop(file);
        if format!("{:x}",hash.finalize())!=sha256.to_lowercase(){return Err("安装包校验未通过，请重新下载".into());}
        if destination.exists(){tokio::fs::remove_file(&destination).await.map_err(|_|"旧更新缓存无法清理")?;}
        tokio::fs::rename(&partial,&destination).await.map_err(|_|"安装包保存失败")?;
        *state.verified.lock().map_err(|_|"更新状态无法读取")?=Some(Verified{path:destination.clone(),sha256:sha256.to_lowercase(),file_name:file_name.clone()});
        let _=on_progress.send(DownloadProgress{phase:"ready",downloaded,total:Some(downloaded)});
        Ok(file_name.clone())
    }.await;
    if result.is_err(){let _=tokio::fs::remove_file(&partial).await;}
    if let Ok(mut cancel)=state.cancel.lock(){cancel.take();}
    state.busy.store(false,Ordering::SeqCst);result
}
#[tauri::command]
pub fn cancel_app_update(state:tauri::State<'_,UpdateDownload>){if let Ok(mut cancel)=state.cancel.lock(){if let Some(sender)=cancel.take(){let _=sender.send(());}}}
#[cfg(target_os="android")]
pub struct AndroidInstaller(pub tauri::plugin::PluginHandle<tauri::Wry>);
#[cfg(target_os="android")]
#[derive(serde::Serialize)]
#[serde(rename_all="camelCase")]
struct InstallArgs { file_name:String,sha256:String }
#[tauri::command]
pub async fn install_app_update(app:tauri::AppHandle,state:tauri::State<'_,UpdateDownload>)->Result<String,String>{
    let verified=state.verified.lock().map_err(|_|"更新状态无法读取")?.clone().ok_or("请先下载并校验安装包")?;
    #[cfg(target_os="android")]
    return app.state::<AndroidInstaller>().0.run_mobile_plugin("install",InstallArgs{file_name:verified.file_name,sha256:verified.sha256}).map(|value:serde_json::Value|value["status"].as_str().unwrap_or("opened").to_owned()).map_err(|e|e.to_string());
    #[cfg(not(target_os="android"))]
    {
        use std::io::Read;
        #[cfg(not(windows))] use tauri_plugin_opener::OpenerExt;
        let version=verified.file_name.trim_start_matches("Papery-").trim_start_matches("Reader-").split('-').next().unwrap_or("");
        let parts:Vec<u64>=version.split('.').filter_map(|n|n.parse().ok()).collect();let current=&app.package_info().version;
        if parts.len()!=3||parts.as_slice()<[current.major,current.minor,current.patch].as_slice(){return Err("这是较旧的安装包，请重新检查更新".into());}
        #[cfg(windows)] verify_windows_version(&verified.path,&parts)?;
        let checked=verified.clone();tokio::task::spawn_blocking(move||{
            let mut file=std::fs::File::open(&checked.path).map_err(|_|"安装包已丢失，请重新下载")?;
            let mut hash=Sha256::new();let mut buffer=[0u8;65536];
            loop{let n=file.read(&mut buffer).map_err(|_|"无法读取安装包")?;if n==0{break}hash.update(&buffer[..n]);}
            if format!("{:x}",hash.finalize())!=checked.sha256{return Err("安装包已变化，请重新下载")};Ok(())
        }).await.map_err(|_|"安装包校验失败")??;
        #[cfg(windows)] {
            let executable=std::env::current_exe().map_err(|_|"无法确认当前安装目录")?;
            let directory=executable.parent().ok_or("无法确认当前安装目录")?;
            // NSIS consumes /D as the final, unquoted remainder, including spaces.
            // Use this running copy's directory rather than the registry's last installation.
            let parameters=windows_installer_parameters(directory);
            if let Some(window)=app.get_webview_window("main"){let _=window.set_focus();}
            launch_windows_installer(&verified.path,&parameters)?;
            // The frontend has already flushed reading progress and pending settings.
            // NSIS /P displays upgrade progress and /R launches the newly installed copy.
            app.cleanup_before_exit();
            std::process::exit(0);
        }
        #[cfg(not(windows))] {
            app.opener().open_path(verified.path.to_string_lossy(),None::<&str>).map_err(|_|"无法启动安装程序，请重试")?;
            Ok("opened".into())
        }
    }
}
#[cfg(windows)]
fn windows_installer_parameters(directory:&std::path::Path)->String{
    format!("/P /R /UPDATE /NS /D={}",directory.to_string_lossy())
}
#[cfg(windows)]
fn launch_windows_installer(path:&std::path::Path,parameters:&str)->Result<(),String>{
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::{Foundation::CloseHandle,System::Threading::GetProcessId,UI::{Shell::{ShellExecuteExW,SHELLEXECUTEINFOW,SEE_MASK_NOCLOSEPROCESS},WindowsAndMessaging::{AllowSetForegroundWindow,SW_SHOWNORMAL}}};
    let file:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();
    let args:Vec<u16>=parameters.encode_utf16().chain(Some(0)).collect();
    let verb:Vec<u16>="open".encode_utf16().chain(Some(0)).collect();
    unsafe {
        let mut launch:SHELLEXECUTEINFOW=std::mem::zeroed();launch.cbSize=std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
        launch.fMask=SEE_MASK_NOCLOSEPROCESS;launch.lpVerb=verb.as_ptr();launch.lpFile=file.as_ptr();launch.lpParameters=args.as_ptr();launch.nShow=SW_SHOWNORMAL;
        if ShellExecuteExW(&mut launch)==0{return Err("无法启动安装程序，请重试".into());}
        if !launch.hProcess.is_null(){let pid=GetProcessId(launch.hProcess);if pid!=0{AllowSetForegroundWindow(pid);}CloseHandle(launch.hProcess);}
    }
    Ok(())
}
#[cfg(windows)]
fn verify_windows_version(path:&std::path::Path,wanted:&[u64])->Result<(),String>{
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW,GetFileVersionInfoW,VerQueryValueW,VS_FIXEDFILEINFO};
    let wide:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        let mut handle=0u32;let size=GetFileVersionInfoSizeW(wide.as_ptr(),&mut handle);
        if size==0||size>65536{return Err("安装包版本无法确认，请重新下载".into());}
        let mut data=vec![0u8;size as usize];if GetFileVersionInfoW(wide.as_ptr(),0,size,data.as_mut_ptr().cast())==0{return Err("安装包版本无法确认".into());}
        let mut info=std::ptr::null_mut();let mut length=0u32;let root=[92u16,0];
        if VerQueryValueW(data.as_ptr().cast(),root.as_ptr(),&mut info,&mut length)==0||(length as usize)<std::mem::size_of::<VS_FIXEDFILEINFO>(){return Err("安装包版本无法确认".into());}
        let value=std::ptr::read_unaligned(info.cast::<VS_FIXEDFILEINFO>());
        let version=[(value.dwProductVersionMS>>16) as u64,(value.dwProductVersionMS&65535) as u64,(value.dwProductVersionLS>>16) as u64];
        if value.dwSignature!=0xFEEF04BD||version.as_slice()!=wanted{return Err("安装包版本与更新信息不一致，请重新下载".into());}
    }
    Ok(())
}
#[cfg(test)]
mod tests{
 use super::*;
 #[cfg(windows)]
 #[test] fn upgrades_the_running_directory_and_relaunches(){let args=windows_installer_parameters(std::path::Path::new(r"D:\测试安装\Papery Reader"));assert_eq!(args,r"/P /R /UPDATE /NS /D=D:\测试安装\Papery Reader");}
 #[test] fn accepts_only_official_installers(){let hash="a".repeat(64);let name="Papery-0.1.53-Android-arm64.apk";let url=format!("https://gitee.com/mu-wan/papery-epub-reader/releases/download/papery-v0.1.53/{name}");assert!(valid_asset(&url,name,&hash));for bad in [url.replace("https:","http:"),url.replace("gitee.com","evil.test"),url.replace("gitee.com","user:pw@gitee.com")]{assert!(!valid_asset(&bad,name,&hash));}assert!(!valid_asset(&url,"../package.apk",&hash));assert!(!valid_asset(&url,name,"bad"));}
}
