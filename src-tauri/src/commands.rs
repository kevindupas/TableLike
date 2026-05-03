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
    match entry.get_password() {
        Ok(p) => Ok(p),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn delete_password(connection_id: String) -> Result<(), String> {
    let entry = keyring::Entry::new("tablelike", &connection_id)
        .map_err(|e| e.to_string())?;
    entry.delete_credential().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_ssh_connection(config: crate::db::types::ConnectionConfig) -> Result<(), String> {
    let backend = config.ssh_backend.as_deref().unwrap_or("russh");
    if backend == "openssh" {
        crate::db::ssh_tunnel::OpenSshTunnel::test_auth(&config).await
    } else {
        crate::db::ssh_tunnel::SshTunnel::test_auth(&config).await
    }
}

#[tauri::command]
pub fn detect_ssh_keys() -> Vec<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        "id_ed25519", "id_rsa", "id_ecdsa", "id_dsa",
    ];
    candidates
        .iter()
        .map(|name| format!("{}/.ssh/{}", home, name))
        .filter(|path| std::path::Path::new(path).exists())
        .collect()
}

#[tauri::command]
pub async fn list_databases(
    config: crate::db::types::ConnectionConfig,
) -> Result<Vec<String>, String> {
    if config.ssh_host.is_some() {
        let backend = config.ssh_backend.as_deref().unwrap_or("russh");
        if backend == "openssh" {
            let tunnel = crate::db::ssh_tunnel::OpenSshTunnel::connect(&config)
                .await
                .map_err(|e| format!("SSH tunnel: {e}"))?;
            let port = tunnel.local_port;
            let dbs = fetch_databases_pg_or_mysql(&config, "127.0.0.1", port).await?;
            return Ok(dbs);
        } else {
            let tunnel = crate::db::ssh_tunnel::SshTunnel::connect(&config)
                .await
                .map_err(|e| format!("SSH tunnel: {e}"))?;
            let port = tunnel.local_port;
            let dbs = fetch_databases_pg_or_mysql(&config, "127.0.0.1", port).await?;
            return Ok(dbs);
        }
    }

    fetch_databases_pg_or_mysql(&config, &config.host.clone(), config.port).await
}

async fn fetch_databases_pg_or_mysql(
    config: &crate::db::types::ConnectionConfig,
    host: &str,
    port: u16,
) -> Result<Vec<String>, String> {
    use crate::db::types::DbType;
    use sqlx::Row;

    match config.db_type {
        DbType::Postgresql => {
            use sqlx::postgres::PgConnectOptions;
            let opts = PgConnectOptions::new()
                .host(host)
                .port(port)
                .username(&config.username)
                .password(&config.password)
                .database("postgres");
            let pool = sqlx::postgres::PgPoolOptions::new()
                .max_connections(1)
                .connect_with(opts)
                .await
                .map_err(|e| e.to_string())?;
            let rows = sqlx::query(
                "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
            )
            .fetch_all(&pool)
            .await
            .map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| r.get::<String, _>(0)).collect())
        }
        DbType::Mysql => {
            use sqlx::mysql::MySqlConnectOptions;
            let opts = MySqlConnectOptions::new()
                .host(host)
                .port(port)
                .username(&config.username)
                .password(&config.password);
            let pool = sqlx::mysql::MySqlPoolOptions::new()
                .max_connections(1)
                .connect_with(opts)
                .await
                .map_err(|e| e.to_string())?;
            let rows = sqlx::query("SHOW DATABASES")
                .fetch_all(&pool)
                .await
                .map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| r.get::<String, _>(0)).collect())
        }
        DbType::Sqlite => {
            Ok(vec![config.database.clone()])
        }
    }
}

async fn resolve_host_port(
    config: &crate::db::types::ConnectionConfig,
) -> Result<(String, u16, Option<crate::db::ssh_tunnel::SshTunnel>, Option<crate::db::ssh_tunnel::OpenSshTunnel>), String> {
    if config.ssh_host.is_some() {
        let backend = config.ssh_backend.as_deref().unwrap_or("russh");
        if backend == "openssh" {
            let tunnel = crate::db::ssh_tunnel::OpenSshTunnel::connect(config)
                .await
                .map_err(|e| format!("SSH: {e}"))?;
            let port = tunnel.local_port;
            Ok(("127.0.0.1".to_string(), port, None, Some(tunnel)))
        } else {
            let tunnel = crate::db::ssh_tunnel::SshTunnel::connect(config)
                .await
                .map_err(|e| format!("SSH: {e}"))?;
            let port = tunnel.local_port;
            Ok(("127.0.0.1".to_string(), port, Some(tunnel), None))
        }
    } else {
        Ok((config.host.clone(), config.port, None, None))
    }
}

async fn stream_command(
    mut cmd: tokio::process::Command,
    status: std::sync::Arc<std::sync::Mutex<crate::db::jobs::JobStatus>>,
) -> Result<(), String> {
    use tokio::io::AsyncReadExt;

    let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {e}"))?;
    let stderr = child.stderr.take();

    if let Some(mut err) = stderr {
        let status_clone = status.clone();
        tokio::spawn(async move {
            let mut buf = String::new();
            let _ = err.read_to_string(&mut buf).await;
            if !buf.is_empty() {
                status_clone.lock().unwrap().output.push_str(&buf);
            }
        });
    }

    let exit = child.wait().await.map_err(|e| e.to_string())?;
    if exit.success() {
        status.lock().unwrap().output.push_str("Done.\n");
        Ok(())
    } else {
        Err(format!("process exited with status {exit}"))
    }
}

async fn run_backup(
    db_type: &crate::db::types::DbType,
    host: &str,
    port: u16,
    username: &str,
    password: &str,
    database: &str,
    output_path: &str,
    flags: &[String],
    status: std::sync::Arc<std::sync::Mutex<crate::db::jobs::JobStatus>>,
) -> Result<(), String> {
    use crate::db::types::DbType;

    match db_type {
        DbType::Sqlite => {
            std::fs::copy(database, output_path).map_err(|e| e.to_string())?;
            status.lock().unwrap().output.push_str("SQLite database copied successfully.\n");
            Ok(())
        }
        DbType::Postgresql => {
            let mut cmd = tokio::process::Command::new("pg_dump");
            cmd.env("PGPASSWORD", password);
            cmd.args(["-h", host, "-p", &port.to_string(), "-U", username, "-d", database]);
            cmd.args(flags);
            cmd.args(["-f", output_path]);
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());
            stream_command(cmd, status).await
        }
        DbType::Mysql => {
            let mut cmd = tokio::process::Command::new("mysqldump");
            cmd.args([
                &format!("-h{host}"),
                &format!("-P{port}"),
                &format!("-u{username}"),
                &format!("-p{password}"),
            ]);
            cmd.args(flags);
            cmd.arg(database);
            let output_file = std::fs::File::create(output_path)
                .map_err(|e| format!("cannot create output file: {e}"))?;
            cmd.stdout(output_file);
            cmd.stderr(std::process::Stdio::piped());
            stream_command(cmd, status).await
        }
    }
}

#[tauri::command]
pub async fn start_backup(
    config: crate::db::types::ConnectionConfig,
    database: String,
    output_path: String,
    flags: Vec<String>,
    job_id: String,
    job_manager: tauri::State<'_, crate::db::jobs::JobManager>,
) -> Result<(), String> {
    let status = job_manager.create_job(&job_id);

    let (effective_host, effective_port, _tunnel_russh, _tunnel_openssh) =
        resolve_host_port(&config).await?;

    tokio::spawn(async move {
        let result = run_backup(
            &config.db_type,
            &effective_host,
            effective_port,
            &config.username,
            &config.password,
            &database,
            &output_path,
            &flags,
            status.clone(),
        )
        .await;

        let mut s = status.lock().unwrap();
        if let Err(e) = result {
            s.status = "error".to_string();
            s.output.push_str(&format!("\nERROR: {e}"));
        } else {
            s.status = "done".to_string();
        }
    });

    Ok(())
}

async fn run_restore(
    db_type: &crate::db::types::DbType,
    host: &str,
    port: u16,
    username: &str,
    password: &str,
    database: &str,
    input_path: &str,
    flags: &[String],
    status: std::sync::Arc<std::sync::Mutex<crate::db::jobs::JobStatus>>,
) -> Result<(), String> {
    use crate::db::types::DbType;

    match db_type {
        DbType::Sqlite => {
            std::fs::copy(input_path, database).map_err(|e| e.to_string())?;
            status.lock().unwrap().output.push_str("SQLite database restored successfully.\n");
            Ok(())
        }
        DbType::Postgresql => {
            let use_psql = input_path.ends_with(".sql");
            let mut cmd = if use_psql {
                let mut c = tokio::process::Command::new("psql");
                c.env("PGPASSWORD", password);
                c.args(["-h", host, "-p", &port.to_string(), "-U", username, "-d", database]);
                c.args(flags);
                c.arg("-f").arg(input_path);
                c
            } else {
                let mut c = tokio::process::Command::new("pg_restore");
                c.env("PGPASSWORD", password);
                c.args(["-h", host, "-p", &port.to_string(), "-U", username, "-d", database]);
                c.args(flags);
                c.arg(input_path);
                c
            };
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());
            stream_command(cmd, status).await
        }
        DbType::Mysql => {
            let input_file = std::fs::File::open(input_path)
                .map_err(|e| format!("cannot open input file: {e}"))?;
            let mut cmd = tokio::process::Command::new("mysql");
            cmd.args([
                &format!("-h{host}"),
                &format!("-P{port}"),
                &format!("-u{username}"),
                &format!("-p{password}"),
            ]);
            cmd.args(flags);
            cmd.arg(database);
            cmd.stdin(input_file);
            cmd.stdout(std::process::Stdio::piped());
            cmd.stderr(std::process::Stdio::piped());
            stream_command(cmd, status).await
        }
    }
}

#[tauri::command]
pub async fn start_restore(
    config: crate::db::types::ConnectionConfig,
    database: String,
    input_path: String,
    flags: Vec<String>,
    job_id: String,
    job_manager: tauri::State<'_, crate::db::jobs::JobManager>,
) -> Result<(), String> {
    let status = job_manager.create_job(&job_id);

    let (effective_host, effective_port, _tunnel_russh, _tunnel_openssh) =
        resolve_host_port(&config).await?;

    tokio::spawn(async move {
        let result = run_restore(
            &config.db_type,
            &effective_host,
            effective_port,
            &config.username,
            &config.password,
            &database,
            &input_path,
            &flags,
            status.clone(),
        )
        .await;

        let mut s = status.lock().unwrap();
        if let Err(e) = result {
            s.status = "error".to_string();
            s.output.push_str(&format!("\nERROR: {e}"));
        } else {
            s.status = "done".to_string();
        }
    });

    Ok(())
}

#[tauri::command]
pub fn get_job_status(
    job_id: String,
    job_manager: tauri::State<'_, crate::db::jobs::JobManager>,
) -> Option<crate::db::jobs::JobStatus> {
    job_manager.get_status(&job_id)
}

#[tauri::command]
pub fn remove_job(
    job_id: String,
    job_manager: tauri::State<'_, crate::db::jobs::JobManager>,
) {
    job_manager.remove(&job_id);
}
