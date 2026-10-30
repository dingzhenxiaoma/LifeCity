use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

mod native_activity;

fn backup_city_database_at(data_dir: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let source = data_dir.join("lifecity.db");
    let backup = data_dir.join("lifecity.db.backup");
    if !source.is_file() {
        return Err("找不到 LifeCity 城市数据库".to_string());
    }
    std::fs::copy(&source, &backup).map_err(|error| format!("备份城市数据库失败：{error}"))?;
    Ok(backup)
}

#[tauri::command]
fn backup_city_database(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let backup = backup_city_database_at(&data_dir)?;
    Ok(backup.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(native_activity::NativeActivityState::start())
        .invoke_handler(tauri::generate_handler![
            native_activity::collect_native_activity,
            backup_city_database
        ])
        .setup(|app| {
            let show = MenuItemBuilder::with_id("show", "打开 LifeCity").build(app)?;
            let unlock = MenuItemBuilder::with_id("unlock", "解除桌宠锁定").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show, &unlock, &quit])
                .build()?;

            if let Some(icon) = app.default_window_icon().cloned() {
                TrayIconBuilder::new()
                    .icon(icon)
                    .tooltip("LifeCity · 数字生活城市")
                    .menu(&menu)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.set_ignore_cursor_events(false);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "unlock" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.set_ignore_cursor_events(false);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.set_ignore_cursor_events(false);
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run LifeCity");
}

#[cfg(test)]
mod tests {
    use super::backup_city_database_at;

    #[test]
    fn backup_overwrites_the_single_previous_copy() {
        let directory = std::env::temp_dir().join(format!(
            "lifecity-backup-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        let source = directory.join("lifecity.db");
        let backup = directory.join("lifecity.db.backup");

        std::fs::write(&source, b"first city").unwrap();
        assert_eq!(backup_city_database_at(&directory).unwrap(), backup);
        assert_eq!(std::fs::read(&backup).unwrap(), b"first city");

        std::fs::write(&source, b"second city").unwrap();
        assert_eq!(backup_city_database_at(&directory).unwrap(), backup);
        assert_eq!(std::fs::read(&backup).unwrap(), b"second city");

        std::fs::remove_file(source).unwrap();
        std::fs::remove_file(backup).unwrap();
        std::fs::remove_dir(directory).unwrap();
    }
}
