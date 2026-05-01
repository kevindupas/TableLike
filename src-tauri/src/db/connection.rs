use std::collections::HashMap;
use std::sync::Mutex;
use sqlx::{Pool, Postgres, MySql, Sqlite};
use crate::db::types::{ConnectionConfig, DbType};

pub enum DbPool {
    Postgres(Pool<Postgres>),
    MySql(Pool<MySql>),
    Sqlite(Pool<Sqlite>),
}

pub struct ConnectionManager {
    pub pools: Mutex<HashMap<String, DbPool>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            pools: Mutex::new(HashMap::new()),
        }
    }

    pub async fn connect(&self, config: &ConnectionConfig) -> Result<(), String> {
        // Build pool outside of lock so we don't hold MutexGuard across await
        let pool = match config.db_type {
            DbType::Postgresql => {
                let url = format!(
                    "postgres://{}:{}@{}:{}/{}",
                    config.username, config.password, config.host, config.port, config.database
                );
                let pool = sqlx::postgres::PgPoolOptions::new()
                    .max_connections(5)
                    .connect(&url)
                    .await
                    .map_err(|e| e.to_string())?;
                DbPool::Postgres(pool)
            }
            DbType::Mysql => {
                let url = format!(
                    "mysql://{}:{}@{}:{}/{}",
                    config.username, config.password, config.host, config.port, config.database
                );
                let pool = sqlx::mysql::MySqlPoolOptions::new()
                    .max_connections(5)
                    .connect(&url)
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

        // Lock only after the async work is done
        self.pools.lock().unwrap().insert(config.id.clone(), pool);
        Ok(())
    }

    pub fn disconnect(&self, connection_id: &str) {
        self.pools.lock().unwrap().remove(connection_id);
    }

    pub fn is_connected(&self, connection_id: &str) -> bool {
        self.pools.lock().unwrap().contains_key(connection_id)
    }
}
