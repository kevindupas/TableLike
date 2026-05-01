use tauri::State;
use crate::db::connection::ConnectionManager;
use crate::db::types::ConnectionConfig;

#[tauri::command]
pub async fn connect_db(
    config: ConnectionConfig,
    manager: State<'_, ConnectionManager>,
) -> Result<String, String> {
    let id = config.id.clone();
    manager.connect(&config).await?;
    Ok(id)
}

#[tauri::command]
pub async fn disconnect_db(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<(), String> {
    manager.disconnect(&connection_id);
    Ok(())
}

#[tauri::command]
pub async fn check_connection(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<bool, String> {
    Ok(manager.is_connected(&connection_id))
}
