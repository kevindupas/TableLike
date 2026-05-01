use sqlx::Column;
use sqlx::Row;
use sqlx::TypeInfo;
use crate::db::types::{CellValue, ColumnInfo, QueryResult};
use geozero::wkb::Ewkb;
use geozero::ToJson;

fn wkb_to_geojson(bytes: Vec<u8>) -> Result<serde_json::Value, String> {
    Ewkb(bytes)
        .to_json()
        .map_err(|e| e.to_string())
        .and_then(|s| serde_json::from_str(&s).map_err(|e| e.to_string()))
}

pub async fn execute_pg(
    pool: &sqlx::PgPool,
    sql: &str,
    limit: i64,
    offset: i64,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();

    let trimmed = sql.trim().trim_end_matches(';');
    let paginated = format!("{} LIMIT {} OFFSET {}", trimmed, limit, offset);

    let rows = sqlx::query(&paginated)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let columns: Vec<ColumnInfo> = if let Some(first) = rows.first() {
        first
            .columns()
            .iter()
            .map(|c| {
                let type_str = c.type_info().name().to_string();
                let is_geo = type_str.to_lowercase().contains("geometry")
                    || type_str.to_lowercase() == "geography";
                ColumnInfo {
                    name: c.name().to_string(),
                    type_name: type_str,
                    is_geo,
                }
            })
            .collect()
    } else {
        vec![]
    };

    let result_rows: Vec<Vec<CellValue>> = rows
        .iter()
        .map(|row| {
            columns
                .iter()
                .enumerate()
                .map(|(i, col)| {
                    if col.is_geo {
                        if let Ok(bytes) = row.try_get::<Vec<u8>, _>(i) {
                            match wkb_to_geojson(bytes) {
                                Ok(json) => CellValue::Geo(json),
                                Err(_) => CellValue::Text("[invalid geometry]".to_string()),
                            }
                        } else {
                            CellValue::Null
                        }
                    } else {
                        row.try_get::<String, _>(i)
                            .map(CellValue::Text)
                            .or_else(|_| {
                                row.try_get::<i64, _>(i).map(|n| CellValue::Number(n as f64))
                            })
                            .or_else(|_| row.try_get::<f64, _>(i).map(CellValue::Number))
                            .or_else(|_| row.try_get::<bool, _>(i).map(CellValue::Bool))
                            .or_else(|_| {
                                row.try_get::<i32, _>(i).map(|n| CellValue::Number(n as f64))
                            })
                            .unwrap_or(CellValue::Null)
                    }
                })
                .collect()
        })
        .collect();

    Ok(QueryResult {
        columns,
        rows: result_rows,
        total_count: None,
        execution_time_ms: start.elapsed().as_millis() as u64,
    })
}

pub async fn execute_sqlite(
    pool: &sqlx::SqlitePool,
    sql: &str,
    limit: i64,
    offset: i64,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();

    let trimmed = sql.trim().trim_end_matches(';');
    let paginated = format!("{} LIMIT {} OFFSET {}", trimmed, limit, offset);

    let rows = sqlx::query(&paginated)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let columns: Vec<ColumnInfo> = if let Some(first) = rows.first() {
        first
            .columns()
            .iter()
            .map(|c| ColumnInfo {
                name: c.name().to_string(),
                type_name: c.type_info().name().to_string(),
                is_geo: false,
            })
            .collect()
    } else {
        vec![]
    };

    let result_rows: Vec<Vec<CellValue>> = rows
        .iter()
        .map(|row| {
            columns
                .iter()
                .enumerate()
                .map(|(i, _)| {
                    row.try_get::<String, _>(i)
                        .map(CellValue::Text)
                        .or_else(|_| {
                            row.try_get::<i64, _>(i).map(|n| CellValue::Number(n as f64))
                        })
                        .or_else(|_| row.try_get::<f64, _>(i).map(CellValue::Number))
                        .or_else(|_| row.try_get::<bool, _>(i).map(CellValue::Bool))
                        .unwrap_or(CellValue::Null)
                })
                .collect()
        })
        .collect();

    Ok(QueryResult {
        columns,
        rows: result_rows,
        total_count: None,
        execution_time_ms: start.elapsed().as_millis() as u64,
    })
}

pub async fn execute_mysql(
    pool: &sqlx::MySqlPool,
    sql: &str,
    limit: i64,
    offset: i64,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();

    let trimmed = sql.trim().trim_end_matches(';');
    let paginated = format!("{} LIMIT {} OFFSET {}", trimmed, limit, offset);

    let rows = sqlx::query(&paginated)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let columns: Vec<ColumnInfo> = if let Some(first) = rows.first() {
        first
            .columns()
            .iter()
            .map(|c| ColumnInfo {
                name: c.name().to_string(),
                type_name: c.type_info().name().to_string(),
                is_geo: false,
            })
            .collect()
    } else {
        vec![]
    };

    let result_rows: Vec<Vec<CellValue>> = rows
        .iter()
        .map(|row| {
            columns
                .iter()
                .enumerate()
                .map(|(i, _)| {
                    row.try_get::<String, _>(i)
                        .map(CellValue::Text)
                        .or_else(|_| {
                            row.try_get::<i64, _>(i).map(|n| CellValue::Number(n as f64))
                        })
                        .or_else(|_| row.try_get::<f64, _>(i).map(CellValue::Number))
                        .or_else(|_| row.try_get::<bool, _>(i).map(CellValue::Bool))
                        .or_else(|_| {
                            row.try_get::<i32, _>(i).map(|n| CellValue::Number(n as f64))
                        })
                        .unwrap_or(CellValue::Null)
                })
                .collect()
        })
        .collect();

    Ok(QueryResult {
        columns,
        rows: result_rows,
        total_count: None,
        execution_time_ms: start.elapsed().as_millis() as u64,
    })
}
