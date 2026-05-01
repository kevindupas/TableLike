use sqlx::Column;
use sqlx::Executor;
use sqlx::Row;
use sqlx::TypeInfo;
use crate::db::types::{CellValue, GeoValue, ColumnInfo, QueryResult};

pub async fn execute_pg(
    pool: &sqlx::PgPool,
    sql: &str,
    limit: i64,
    offset: i64,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();

    let trimmed = sql.trim().trim_end_matches(';');

    // Pass 1: fetch one row to detect column types (LIMIT 1 to avoid full scan)
    let probe_sql = format!("{} LIMIT 1", trimmed);
    let probe_rows = sqlx::query(&probe_sql)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Extract column metadata — from probe row if available, else from describe
    let col_meta: Vec<(String, String, bool)> = if let Some(first) = probe_rows.first() {
        first
            .columns()
            .iter()
            .map(|c| {
                let type_str = c.type_info().name().to_string();
                let is_geo = type_str.to_lowercase().contains("geometry")
                    || type_str.to_lowercase() == "geography";
                (c.name().to_string(), type_str, is_geo)
            })
            .collect()
    } else {
        // Empty table: use describe to get column metadata without needing rows
        let described = pool.describe(&probe_sql)
            .await
            .map_err(|e| e.to_string())?;
        described
            .columns()
            .iter()
            .map(|c| {
                let type_str = c.type_info().name().to_string();
                let is_geo = type_str.to_lowercase().contains("geometry")
                    || type_str.to_lowercase() == "geography";
                (c.name().to_string(), type_str, is_geo)
            })
            .collect()
    };

    // If any geo columns detected, rewrite SELECT wrapping them with ST_AsGeoJSON
    // Only rewrite if query is a plain SELECT * (no subquery complexity)
    let has_geo = col_meta.iter().any(|(_, _, is_geo)| *is_geo);
    let final_sql = if has_geo {
        let select_parts: Vec<String> = col_meta
            .iter()
            .map(|(name, _, is_geo)| {
                if *is_geo {
                    // Bundle geojson + wkt into a single JSON object column
                    format!(
                        "json_build_object('geojson', ST_AsGeoJSON(\"{name}\")::json, 'wkt', ST_AsText(\"{name}\")) AS \"{name}\"",
                        name = name
                    )
                } else {
                    format!("\"{}\"", name)
                }
            })
            .collect();
        format!(
            "SELECT {} FROM ({}) AS _q LIMIT {} OFFSET {}",
            select_parts.join(", "),
            trimmed,
            limit,
            offset
        )
    } else {
        format!("{} LIMIT {} OFFSET {}", trimmed, limit, offset)
    };

    let rows = sqlx::query(&final_sql)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let columns: Vec<ColumnInfo> = col_meta
        .into_iter()
        .map(|(name, type_name, is_geo)| ColumnInfo { name, type_name, is_geo })
        .collect();

    let result_rows: Vec<Vec<CellValue>> = rows
        .iter()
        .map(|row| {
            columns
                .iter()
                .enumerate()
                .map(|(i, col)| {
                    if col.is_geo {
                        // json_build_object returns {"geojson": {...}, "wkt": "MULTIPOLYGON..."}
                        match row.try_get::<Option<serde_json::Value>, _>(i) {
                            Ok(Some(v)) => {
                                let geojson = v.get("geojson").cloned().unwrap_or(serde_json::Value::Null);
                                let wkt = v.get("wkt").and_then(|w| w.as_str()).map(|s| s.to_string());
                                if geojson.is_null() && wkt.is_none() {
                                    CellValue::Null
                                } else {
                                    CellValue::Geo(GeoValue { geojson, wkt })
                                }
                            }
                            Ok(None) => CellValue::Null,
                            Err(_) => CellValue::Null,
                        }
                    } else {
                        let type_name = col.type_name.to_lowercase();
                        // Check nullable first for all types
                        if type_name == "bool" {
                            return row.try_get::<Option<bool>, _>(i)
                                .map(|v| v.map(CellValue::Bool).unwrap_or(CellValue::Null))
                                .unwrap_or(CellValue::Null);
                        }
                        if type_name == "int8" || type_name == "int4" || type_name == "int2"
                            || type_name == "serial" || type_name == "bigserial"
                        {
                            return row.try_get::<Option<i64>, _>(i)
                                .map(|v| v.map(|n| CellValue::Number(n as f64)).unwrap_or(CellValue::Null))
                                .or_else(|_| row.try_get::<Option<i32>, _>(i)
                                    .map(|v| v.map(|n| CellValue::Number(n as f64)).unwrap_or(CellValue::Null)))
                                .or_else(|_| row.try_get::<Option<i16>, _>(i)
                                    .map(|v| v.map(|n| CellValue::Number(n as f64)).unwrap_or(CellValue::Null)))
                                .unwrap_or(CellValue::Null);
                        }
                        if type_name == "float4" || type_name == "float8"
                            || type_name == "numeric" || type_name == "decimal"
                        {
                            return row.try_get::<Option<f64>, _>(i)
                                .map(|v| v.map(CellValue::Number).unwrap_or(CellValue::Null))
                                .unwrap_or(CellValue::Null);
                        }
                        if type_name == "json" || type_name == "jsonb" {
                            return row.try_get::<Option<serde_json::Value>, _>(i)
                                .map(|v| v.map(|j| CellValue::Text(j.to_string())).unwrap_or(CellValue::Null))
                                .unwrap_or(CellValue::Null);
                        }
                        if type_name.starts_with("timestamp") {
                            use sqlx::types::chrono::{DateTime, Utc, NaiveDateTime};
                            return row.try_get::<Option<DateTime<Utc>>, _>(i)
                                .map(|v| v.map(|dt| CellValue::Text(dt.to_rfc3339())).unwrap_or(CellValue::Null))
                                .or_else(|_| row.try_get::<Option<NaiveDateTime>, _>(i)
                                    .map(|v| v.map(|dt| CellValue::Text(dt.to_string())).unwrap_or(CellValue::Null)))
                                .unwrap_or(CellValue::Null);
                        }
                        if type_name == "uuid" {
                            return row.try_get::<Option<uuid::Uuid>, _>(i)
                                .map(|v| v.map(|u| CellValue::Text(u.to_string())).unwrap_or(CellValue::Null))
                                .unwrap_or(CellValue::Null);
                        }
                        // Default: try as Option<String>
                        row.try_get::<Option<String>, _>(i)
                            .map(|v| v.map(CellValue::Text).unwrap_or(CellValue::Null))
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
