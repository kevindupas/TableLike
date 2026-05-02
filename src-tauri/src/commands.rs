use tauri::State;
use crate::db::connection::ConnectionManager;
use crate::db::types::{ConnectionConfig, QueryResult};
use crate::db::schema;
use crate::db::query;

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;

fn derive_key(password: &str, salt: &[u8]) -> [u8; 32] {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hasher.update(salt);
    // stretch with 10k rounds
    let mut key: [u8; 32] = hasher.finalize().into();
    for _ in 0..9_999 {
        let mut h = Sha256::new();
        h.update(&key);
        h.update(salt);
        key = h.finalize().into();
    }
    key
}

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
            let pool = manager
                .get_pg_pool(&connection_id)
                .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;
            schema::get_tables_pg(&pool).await
        }
        "mysql" => {
            let pool = manager
                .get_mysql_pool(&connection_id)
                .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;
            schema::get_tables_mysql(&pool).await
        }
        "sqlite" => {
            let pool = manager
                .get_sqlite_pool(&connection_id)
                .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;
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
            let pool = manager
                .get_pg_pool(&connection_id)
                .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;
            query::execute_pg(&pool, &sql, limit, offset).await
        }
        "mysql" => {
            let pool = manager
                .get_mysql_pool(&connection_id)
                .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;
            query::execute_mysql(&pool, &sql, limit, offset).await
        }
        "sqlite" => {
            let pool = manager
                .get_sqlite_pool(&connection_id)
                .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;
            query::execute_sqlite(&pool, &sql, limit, offset).await
        }
        _ => Err("DB type not yet supported for queries".to_string()),
    }
}

/// Encrypts payload JSON with AES-256-GCM using a password-derived key.
/// Output format: [16 salt][12 nonce][ciphertext]
#[tauri::command]
pub fn export_connections(
    payload: serde_json::Value,
    password: String,
    path: String,
) -> Result<(), String> {
    let json = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;

    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);

    let key = derive_key(&password, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher.encrypt(nonce, json.as_ref()).map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(16 + 12 + ciphertext.len());
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);

    std::fs::write(&path, &out).map_err(|e| e.to_string())
}

/// Decrypts a .tlexport file. Returns the JSON payload.
#[tauri::command]
pub fn import_connections(
    path: String,
    password: String,
) -> Result<serde_json::Value, String> {
    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    if data.len() < 28 {
        return Err("Invalid export file".to_string());
    }
    let salt = &data[..16];
    let nonce_bytes = &data[16..28];
    let ciphertext = &data[28..];

    let key = derive_key(&password, salt);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Wrong password or corrupted file".to_string())?;

    serde_json::from_slice(&plaintext).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_password(connection_id: String, password: String) -> Result<(), String> {
    let entry = keyring::Entry::new("tablelike", &connection_id)
        .map_err(|e| e.to_string())?;
    entry.set_password(&password).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_password(connection_id: String) -> Result<String, String> {
    let entry = keyring::Entry::new("tablelike", &connection_id)
        .map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_password(connection_id: String) -> Result<(), String> {
    let entry = keyring::Entry::new("tablelike", &connection_id)
        .map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())
}
