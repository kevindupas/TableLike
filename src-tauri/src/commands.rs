use tauri::State;
use crate::db::connection::ConnectionManager;
use crate::db::types::{ConnectionConfig, QueryResult};
use crate::db::schema;
use crate::db::query;

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

#[tauri::command]
pub async fn get_tables(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<schema::TableInfo>, String> {
    let db_type = manager
        .get_db_type(&connection_id)
        .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;

    match db_type.as_str() {
        "postgresql" => {
            let pool = manager.get_pg_pool(&connection_id).unwrap();
            schema::get_tables_pg(&pool).await
        }
        "mysql" => {
            let pool = manager.get_mysql_pool(&connection_id).unwrap();
            schema::get_tables_mysql(&pool).await
        }
        "sqlite" => {
            let pool = manager.get_sqlite_pool(&connection_id).unwrap();
            schema::get_tables_sqlite(&pool).await
        }
        _ => Err("Unknown DB type".to_string()),
    }
}

#[tauri::command]
pub async fn execute_query(
    connection_id: String,
    sql: String,
    limit: Option<i64>,
    offset: Option<i64>,
    manager: State<'_, ConnectionManager>,
) -> Result<QueryResult, String> {
    let limit = limit.unwrap_or(300);
    let offset = offset.unwrap_or(0);

    let db_type = manager
        .get_db_type(&connection_id)
        .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;

    match db_type.as_str() {
        "postgresql" => {
            let pool = manager.get_pg_pool(&connection_id).unwrap();
            query::execute_pg(&pool, &sql, limit, offset).await
        }
        "mysql" => {
            let pool = manager.get_mysql_pool(&connection_id).unwrap();
            query::execute_mysql(&pool, &sql, limit, offset).await
        }
        "sqlite" => {
            let pool = manager.get_sqlite_pool(&connection_id).unwrap();
            query::execute_sqlite(&pool, &sql, limit, offset).await
        }
        _ => Err("DB type not yet supported for queries".to_string()),
    }
}
