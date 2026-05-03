mod db;
mod commands;

use db::connection::ConnectionManager;
use db::jobs::JobManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ConnectionManager::new())
        .manage(JobManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::connect_db,
            commands::disconnect_db,
            commands::check_connection,
            commands::get_tables,
            commands::execute_query,
            commands::save_password,
            commands::get_password,
            commands::delete_password,
            commands::export_connections,
            commands::import_connections,
            commands::detect_ssh_keys,
            commands::test_ssh_connection,
            commands::list_databases,
            commands::get_server_version,
            commands::start_backup,
            commands::start_restore,
            commands::get_job_status,
            commands::remove_job,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
