use std::collections::HashMap;
use std::sync::Mutex;
use sqlx::{Pool, Postgres, MySql, Sqlite};
use crate::db::types::{ConnectionConfig, DbType};
use crate::db::ssh_tunnel::SshTunnel;

pub enum DbPool {
    Postgres(Pool<Postgres>),
    MySql(Pool<MySql>),
    Sqlite(Pool<Sqlite>),
}

pub struct ConnectionManager {
    pools: Mutex<HashMap<String, DbPool>>,
    tunnels: Mutex<HashMap<String, SshTunnel>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            pools: Mutex::new(HashMap::new()),
            tunnels: Mutex::new(HashMap::new()),
        }
    }

    pub async fn connect(&self, config: &ConnectionConfig) -> Result<(), String> {
        // Establish SSH tunnel if configured
        let (effective_host, effective_port) = if config.ssh_host.is_some() {
            let tunnel = SshTunnel::connect(config)
                .await
                .map_err(|e| format!("SSH tunnel: {e}"))?;
            let port = tunnel.local_port;
            self.tunnels
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .insert(config.id.clone(), tunnel);
            ("127.0.0.1".to_string(), port)
        } else {
            (config.host.clone(), config.port)
        };

        // Build pool outside of lock — never hold MutexGuard across await
        let pool = match config.db_type {
            DbType::Postgresql => {
                use sqlx::postgres::PgConnectOptions;
                let opts = PgConnectOptions::new()
                    .host(&effective_host)
                    .port(effective_port)
                    .database(&config.database)
                    .username(&config.username)
                    .password(&config.password);
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(5)
                    .connect_with(opts)
                    .await
                    .map_err(|e| e.to_string())?;
                DbPool::Postgres(pool)
            }
            DbType::Mysql => {
                use sqlx::mysql::MySqlConnectOptions;
                let opts = MySqlConnectOptions::new()
                    .host(&effective_host)
                    .port(effective_port)
                    .database(&config.database)
                    .username(&config.username)
                    .password(&config.password);
                let pool = sqlx::mysql::MySqlPoolOptions::new()
                    .max_connections(5)
                    .connect_with(opts)
                    .await
                    .map_err(|e| e.to_string())?;
                DbPool::MySql(pool)
            }
            DbType::Sqlite => {
                let url = format!("sqlite:{}", config.database);
                let pool = sqlx::sqlite::SqlitePoolOptions::new()
                    .max_connections(1)
                    .connect(&url)
                    .await
                    .map_err(|e| e.to_string())?;
                DbPool::Sqlite(pool)
            }
        };

        self.pools
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(config.id.clone(), pool);
        Ok(())
    }

    pub fn disconnect(&self, connection_id: &str) {
        self.pools
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(connection_id);
        self.tunnels
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(connection_id);
    }

    pub fn is_connected(&self, connection_id: &str) -> bool {
        self.pools
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains_key(connection_id)
    }

    pub fn get_pg_pool(&self, id: &str) -> Option<sqlx::PgPool> {
        let guard = self.pools.lock().unwrap_or_else(|e| e.into_inner());
        match guard.get(id) {
            Some(DbPool::Postgres(pool)) => Some(pool.clone()),
            _ => None,
        }
    }

    pub fn get_mysql_pool(&self, id: &str) -> Option<sqlx::MySqlPool> {
        let guard = self.pools.lock().unwrap_or_else(|e| e.into_inner());
        match guard.get(id) {
            Some(DbPool::MySql(pool)) => Some(pool.clone()),
            _ => None,
        }
    }

    pub fn get_sqlite_pool(&self, id: &str) -> Option<sqlx::SqlitePool> {
        let guard = self.pools.lock().unwrap_or_else(|e| e.into_inner());
        match guard.get(id) {
            Some(DbPool::Sqlite(pool)) => Some(pool.clone()),
            _ => None,
        }
    }

    pub fn get_db_type(&self, id: &str) -> Option<String> {
        let guard = self.pools.lock().unwrap_or_else(|e| e.into_inner());
        match guard.get(id) {
            Some(DbPool::Postgres(_)) => Some("postgresql".to_string()),
            Some(DbPool::MySql(_)) => Some("mysql".to_string()),
            Some(DbPool::Sqlite(_)) => Some("sqlite".to_string()),
            None => None,
        }
    }
}
