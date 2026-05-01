use std::collections::HashMap;
use std::sync::Mutex;
use sqlx::{Pool, Postgres, MySql, Sqlite};
use sqlx::ConnectOptions;
use crate::db::types::{ConnectionConfig, DbType};

pub enum DbPool {
    Postgres(Pool<Postgres>),
    MySql(Pool<MySql>),
    Sqlite(Pool<Sqlite>),
}

pub struct ConnectionManager {
    pools: Mutex<HashMap<String, DbPool>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            pools: Mutex::new(HashMap::new()),
        }
    }

    pub async fn connect(&self, config: &ConnectionConfig) -> Result<(), String> {
        // Build pool outside of lock — never hold MutexGuard across await
        let pool = match config.db_type {
            DbType::Postgresql => {
                use sqlx::postgres::PgConnectOptions;
                let opts = PgConnectOptions::new()
                    .host(&config.host)
                    .port(config.port)
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
                    .host(&config.host)
                    .port(config.port)
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
    }

    pub fn is_connected(&self, connection_id: &str) -> bool {
        self.pools
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .contains_key(connection_id)
    }

    pub fn with_pool<F, T>(&self, connection_id: &str, f: F) -> Result<T, String>
    where
        F: FnOnce(&DbPool) -> Result<T, String>,
    {
        let guard = self.pools.lock().unwrap_or_else(|e| e.into_inner());
        match guard.get(connection_id) {
            Some(pool) => f(pool),
            None => Err(format!("Connection '{}' not found", connection_id)),
        }
    }
}
