use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
}

pub async fn get_tables_pg(pool: &sqlx::PgPool) -> Result<Vec<TableInfo>, String> {
    let rows: Vec<TableInfo> = sqlx::query_as(
        "SELECT table_schema as schema, table_name as name
         FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
         AND table_type = 'BASE TABLE'
         ORDER BY table_schema, table_name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

pub async fn get_tables_sqlite(pool: &sqlx::SqlitePool) -> Result<Vec<TableInfo>, String> {
    let rows: Vec<TableInfo> = sqlx::query_as(
        "SELECT 'main' as schema, name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}

pub async fn get_tables_mysql(pool: &sqlx::MySqlPool) -> Result<Vec<TableInfo>, String> {
    let rows: Vec<TableInfo> = sqlx::query_as(
        "SELECT table_schema as schema, table_name as name
         FROM information_schema.tables
         WHERE table_schema = DATABASE()
         ORDER BY table_name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows)
}
