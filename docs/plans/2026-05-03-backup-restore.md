# Backup & Restore Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Backup database and Restore database dialogs accessible via right-click context menu on any connection, supporting PostgreSQL (`pg_dump`/`pg_restore`), MySQL (`mysqldump`/`mysql`), and SQLite (file copy).

**Architecture:** 4 new Tauri commands (`list_databases`, `start_backup`, `start_restore`, `get_job_status`) + a `JobManager` state managing background processes. Two new React dialogs (`BackupDialog`, `RestoreDialog`) with 3-column layout: connection list | database list | options/flags. Jobs stream stdout/stderr into an `Arc<Mutex<String>>` polled every 500ms by the frontend.

**Tech Stack:** Rust `tokio::process::Command` for spawning `pg_dump`/`mysqldump`/file copy, existing `SshTunnel`/`OpenSshTunnel` for SSH connections, React local state only (no Zustand), Tauri `invoke` polling for job status.

---

### Task 1: JobManager — Rust background job infrastructure

**Files:**
- Create: `src-tauri/src/db/jobs.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/db/mod.rs`

**Step 1: Create `src-tauri/src/db/jobs.rs`**

```rust
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, serde::Serialize)]
pub struct JobStatus {
    pub status: String, // "running" | "done" | "error"
    pub output: String,
}

pub struct Job {
    pub status: Arc<Mutex<JobStatus>>,
}

pub struct JobManager {
    jobs: Mutex<HashMap<String, Job>>,
}

impl JobManager {
    pub fn new() -> Self {
        Self { jobs: Mutex::new(HashMap::new()) }
    }

    pub fn create_job(&self, id: &str) -> Arc<Mutex<JobStatus>> {
        let status = Arc::new(Mutex::new(JobStatus {
            status: "running".to_string(),
            output: String::new(),
        }));
        self.jobs.lock().unwrap().insert(id.to_string(), Job { status: status.clone() });
        status
    }

    pub fn get_status(&self, id: &str) -> Option<JobStatus> {
        self.jobs.lock().unwrap().get(id).map(|j| j.status.lock().unwrap().clone())
    }

    pub fn remove(&self, id: &str) {
        self.jobs.lock().unwrap().remove(id);
    }
}
```

**Step 2: Register `JobManager` in `src-tauri/src/db/mod.rs`**

Add `pub mod jobs;` to the existing mod declarations.

**Step 3: Add `JobManager` to app state in `src-tauri/src/lib.rs`**

```rust
use db::jobs::JobManager;
// In Builder chain, after .manage(ConnectionManager::new()):
.manage(JobManager::new())
```

**Step 4: Verify compile**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

Expected: no errors.

**Step 5: Commit**

```bash
git commit -m "feat: add JobManager for background backup/restore processes"
```

---

### Task 2: `list_databases` Tauri command

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

**Step 1: Add `list_databases` to `commands.rs`**

```rust
#[tauri::command]
pub async fn list_databases(
    config: crate::db::types::ConnectionConfig,
) -> Result<Vec<String>, String> {
    use crate::db::types::DbType;
    use sqlx::Row;

    // Establish SSH tunnel if needed (temporary — not stored in ConnectionManager)
    let (effective_host, effective_port) = if config.ssh_host.is_some() {
        let backend = config.ssh_backend.as_deref().unwrap_or("russh");
        if backend == "openssh" {
            let tunnel = crate::db::ssh_tunnel::OpenSshTunnel::connect(&config)
                .await
                .map_err(|e| format!("SSH tunnel: {e}"))?;
            let port = tunnel.local_port;
            // tunnel dropped at end of fn — kills process automatically
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
    } else {
        (config.host.clone(), config.port)
    };

    fetch_databases_pg_or_mysql(&config, &effective_host, effective_port).await
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
            // SQLite = single file, return the configured database name
            Ok(vec![config.database.clone()])
        }
    }
}
```

**Step 2: Register command in `lib.rs`**

Add `commands::list_databases` to `tauri::generate_handler![]`.

**Step 3: Verify compile**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

Expected: no errors.

**Step 4: Commit**

```bash
git commit -m "feat: list_databases command with SSH tunnel support"
```

---

### Task 3: `start_backup` Tauri command

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add `start_backup` to `commands.rs`**

```rust
#[tauri::command]
pub async fn start_backup(
    config: crate::db::types::ConnectionConfig,
    database: String,
    output_path: String,
    flags: Vec<String>,
    job_id: String,
    job_manager: tauri::State<'_, crate::db::jobs::JobManager>,
) -> Result<(), String> {
    use crate::db::types::DbType;

    let status = job_manager.create_job(&job_id);

    // Resolve effective host/port (establish SSH tunnel if needed)
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
    use tokio::io::AsyncReadExt;

    match db_type {
        DbType::Sqlite => {
            // SQLite = file copy
            std::fs::copy(database, output_path).map_err(|e| e.to_string())?;
            status.lock().unwrap().output.push_str("SQLite database copied successfully.\n");
            return Ok(());
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
            // mysqldump writes to stdout — redirect to file
            let output_file = std::fs::File::create(output_path)
                .map_err(|e| format!("cannot create output file: {e}"))?;
            cmd.stdout(output_file);
            cmd.stderr(std::process::Stdio::piped());
            stream_command(cmd, status).await
        }
    }
}

async fn stream_command(
    mut cmd: tokio::process::Command,
    status: std::sync::Arc<std::sync::Mutex<crate::db::jobs::JobStatus>>,
) -> Result<(), String> {
    use tokio::io::AsyncReadExt;

    let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {e}"))?;
    let mut stderr = child.stderr.take();

    // Stream stderr to output
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
```

**Step 2: Register `start_backup` in `lib.rs`**

Add `commands::start_backup` to `tauri::generate_handler![]`.

**Step 3: Verify compile**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

Expected: no errors.

**Step 4: Commit**

```bash
git commit -m "feat: start_backup command (pg_dump/mysqldump/SQLite copy) with SSH support"
```

---

### Task 4: `start_restore` + `get_job_status` Tauri commands

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add `start_restore` to `commands.rs`**

```rust
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
            return Ok(());
        }
        DbType::Postgresql => {
            // Detect format: .sql = psql, else pg_restore
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
```

**Step 2: Add `get_job_status` to `commands.rs`**

```rust
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
```

**Step 3: Register in `lib.rs`**

Add `commands::start_restore`, `commands::get_job_status`, `commands::remove_job` to `tauri::generate_handler![]`.

**Step 4: Verify compile**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

Expected: no errors.

**Step 5: Commit**

```bash
git commit -m "feat: start_restore + get_job_status + remove_job commands"
```

---

### Task 5: Tauri commands TypeScript bindings

**Files:**
- Modify: `src/lib/tauri-commands.ts`

**Step 1: Add types and functions**

```ts
export interface JobStatus {
  status: "running" | "done" | "error";
  output: string;
}

export async function listDatabases(config: Partial<RustConnectionConfig> & Pick<RustConnectionConfig, "id" | "name" | "db_type" | "host" | "port" | "database" | "username" | "password" | "color">): Promise<string[]> {
  return invoke<string[]>("list_databases", { config });
}

export async function startBackup(
  config: Partial<RustConnectionConfig> & Pick<RustConnectionConfig, "id" | "name" | "db_type" | "host" | "port" | "database" | "username" | "password" | "color">,
  database: string,
  outputPath: string,
  flags: string[],
  jobId: string,
): Promise<void> {
  return invoke<void>("start_backup", { config, database, outputPath, flags, jobId });
}

export async function startRestore(
  config: Partial<RustConnectionConfig> & Pick<RustConnectionConfig, "id" | "name" | "db_type" | "host" | "port" | "database" | "username" | "password" | "color">,
  database: string,
  inputPath: string,
  flags: string[],
  jobId: string,
): Promise<void> {
  return invoke<void>("start_restore", { config, database, inputPath, flags, jobId });
}

export async function getJobStatus(jobId: string): Promise<JobStatus | null> {
  return invoke<JobStatus | null>("get_job_status", { jobId });
}

export async function removeJob(jobId: string): Promise<void> {
  return invoke<void>("remove_job", { jobId });
}
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

**Step 3: Commit**

```bash
git commit -m "feat: TypeScript bindings for backup/restore/job commands"
```

---

### Task 6: BackupDialog — layout + connection/database selection

**Files:**
- Create: `src/components/BackupDialog.tsx`

**Step 1: Create `BackupDialog.tsx` with 3-column layout**

```tsx
import { useState, useEffect, useRef } from "react";
import { X, Search } from "lucide-react";
import { Connection, useConnectionStore } from "../store/connections";
import { GroupAvatar } from "./GroupAvatar";
import { listDatabases, startBackup, getJobStatus, removeJob, getPassword, getSshPassword } from "../lib/tauri-commands";
import { open as openSaveDialog } from "@tauri-apps/plugin-dialog";

// PostgreSQL flags
const PG_FLAGS = [
  { flag: "--format=custom", label: "--format=custom", defaultOn: true },
  { flag: "--format=plain", label: "--format=plain", defaultOn: false },
  { flag: "--format=tar", label: "--format=tar", defaultOn: false },
  { flag: "--data-only", label: "--data-only", defaultOn: false },
  { flag: "--schema-only", label: "--schema-only", defaultOn: false },
  { flag: "--clean", label: "--clean", defaultOn: false },
  { flag: "--create", label: "--create", defaultOn: false },
  { flag: "--no-owner", label: "--no-owner", defaultOn: false },
  { flag: "--no-privileges", label: "--no-privileges", defaultOn: false },
];

// MySQL flags
const MYSQL_FLAGS = [
  { flag: "--single-transaction", label: "--single-transaction", defaultOn: true },
  { flag: "--routines", label: "--routines", defaultOn: false },
  { flag: "--no-data", label: "--no-data", defaultOn: false },
  { flag: "--add-drop-table", label: "--add-drop-table", defaultOn: false },
  { flag: "--add-drop-database", label: "--add-drop-database", defaultOn: false },
  { flag: "--no-tablespaces", label: "--no-tablespaces", defaultOn: false },
  { flag: "--column-statistics=0", label: "--column-statistics=0", defaultOn: false },
  { flag: "--lock-tables=false", label: "--lock-tables=false", defaultOn: false },
  { flag: "--default-character-set=utf8mb4", label: "--default-character-set=utf8mb4", defaultOn: false },
  { flag: "--compress", label: "--compress", defaultOn: false },
  { flag: "--enable-cleartext-plugin", label: "--enable-cleartext-plugin", defaultOn: false },
];

interface Props {
  conn: Connection | null;
  onClose: () => void;
}

export function BackupDialog({ conn, onClose }: Props) {
  const { connections, groups } = useConnectionStore();
  const [selectedConn, setSelectedConn] = useState<Connection | null>(conn);
  const [connSearch, setConnSearch] = useState("");
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [dbSearch, setDbSearch] = useState("");
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [activeFlags, setActiveFlags] = useState<Set<string>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobOutput, setJobOutput] = useState("");
  const [jobStatus, setJobStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize default flags when connection type changes
  useEffect(() => {
    if (!selectedConn) return;
    const flagList = selectedConn.type === "postgresql" ? PG_FLAGS : selectedConn.type === "mysql" ? MYSQL_FLAGS : [];
    setActiveFlags(new Set(flagList.filter(f => f.defaultOn).map(f => f.flag)));
  }, [selectedConn?.type]);

  // Load databases when connection selected
  useEffect(() => {
    if (!selectedConn) { setDatabases([]); setSelectedDb(null); return; }
    setDbLoading(true);
    setDbError(null);
    setSelectedDb(null);
    const load = async () => {
      try {
        const password = await getPassword(selectedConn.id).catch(() => "");
        const sshPassword = selectedConn.ssh?.authMethod === "password"
          ? await getSshPassword(selectedConn.id).catch(() => "")
          : undefined;
        const dbs = await listDatabases({
          id: selectedConn.id, name: selectedConn.name,
          db_type: selectedConn.type, host: selectedConn.host,
          port: selectedConn.port, database: selectedConn.database,
          username: selectedConn.username, password, color: selectedConn.color,
          ssh_host: selectedConn.ssh?.host, ssh_port: selectedConn.ssh?.port,
          ssh_username: selectedConn.ssh?.username, ssh_auth_method: selectedConn.ssh?.authMethod,
          ssh_password: sshPassword, ssh_private_key_path: selectedConn.ssh?.privateKeyPath,
          ssh_use_password_auth: selectedConn.ssh?.usePasswordAuth,
          ssh_add_legacy_host_key: selectedConn.ssh?.addLegacyHostKeyAlgos,
          ssh_add_legacy_kex: selectedConn.ssh?.addLegacyKexAlgos,
          ssh_backend: selectedConn.ssh?.backend,
        });
        setDatabases(dbs);
      } catch (e) {
        setDbError(String(e));
      } finally {
        setDbLoading(false);
      }
    };
    load();
  }, [selectedConn?.id]);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      const status = await getJobStatus(jobId).catch(() => null);
      if (!status) return;
      setJobOutput(status.output);
      if (status.status !== "running") {
        setJobStatus(status.status as "done" | "error");
        clearInterval(pollRef.current!);
      }
    }, 500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  if (!conn && !selectedConn) return null; // opened without preselected conn still works

  const flagList = selectedConn?.type === "postgresql" ? PG_FLAGS : selectedConn?.type === "mysql" ? MYSQL_FLAGS : [];

  function toggleFlag(flag: string) {
    setActiveFlags(prev => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag); else next.add(flag);
      return next;
    });
  }

  function filename(): string {
    if (!selectedConn || !selectedDb) return "untitled";
    const date = new Date().toISOString().slice(0, 10);
    const connSlug = selectedConn.name.replace(/[^a-zA-Z0-9]/g, "-");
    const ext = selectedConn.type === "postgresql" ? ".dump" : selectedConn.type === "mysql" ? ".sql" : ".db";
    return `${selectedDb}_${connSlug}_${date}${ext}`;
  }

  async function handleStartBackup() {
    if (!selectedConn || !selectedDb) return;
    setError(null);
    try {
      const outputPath = await openSaveDialog({
        defaultPath: filename(),
        filters: selectedConn.type === "postgresql"
          ? [{ name: "Dump", extensions: ["dump", "sql", "tar"] }]
          : selectedConn.type === "mysql"
          ? [{ name: "SQL", extensions: ["sql"] }]
          : [{ name: "SQLite", extensions: ["db", "sqlite"] }],
      });
      if (!outputPath || typeof outputPath !== "string") return;

      const id = crypto.randomUUID();
      const password = await getPassword(selectedConn.id).catch(() => "");
      const sshPassword = selectedConn.ssh?.authMethod === "password"
        ? await getSshPassword(selectedConn.id).catch(() => "")
        : undefined;

      setJobId(id);
      setJobStatus("running");
      setJobOutput("");

      await startBackup(
        {
          id: selectedConn.id, name: selectedConn.name,
          db_type: selectedConn.type, host: selectedConn.host,
          port: selectedConn.port, database: selectedConn.database,
          username: selectedConn.username, password, color: selectedConn.color,
          ssh_host: selectedConn.ssh?.host, ssh_port: selectedConn.ssh?.port,
          ssh_username: selectedConn.ssh?.username, ssh_auth_method: selectedConn.ssh?.authMethod,
          ssh_password: sshPassword, ssh_private_key_path: selectedConn.ssh?.privateKeyPath,
          ssh_use_password_auth: selectedConn.ssh?.usePasswordAuth,
          ssh_add_legacy_host_key: selectedConn.ssh?.addLegacyHostKeyAlgos,
          ssh_add_legacy_kex: selectedConn.ssh?.addLegacyKexAlgos,
          ssh_backend: selectedConn.ssh?.backend,
        },
        selectedDb,
        outputPath,
        Array.from(activeFlags),
        id,
      );
    } catch (e) {
      setError(String(e));
      setJobStatus("idle");
    }
  }

  function handleDone() {
    if (jobId) removeJob(jobId).catch(() => {});
    onClose();
  }

  const filteredConns = connections.filter(c =>
    c.name.toLowerCase().includes(connSearch.toLowerCase())
  );
  const filteredDbs = databases.filter(d =>
    d.toLowerCase().includes(dbSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <span className="text-sm font-semibold">Backup database</span>
        <button onClick={handleDone} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* File name */}
      <div className="px-6 py-2 border-b shrink-0 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">File name: </span>
        <span className="font-mono">{filename()}</span>
      </div>

      {/* Body — 3 columns */}
      <div className="flex flex-1 overflow-hidden">

        {/* Col 1: Connections */}
        <div className="w-72 border-r flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              value={connSearch} onChange={e => setConnSearch(e.target.value)}
              placeholder="Search for connection..."
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {filteredConns.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedConn(c)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${selectedConn?.id === c.id ? "bg-blue-500 text-white" : "hover:bg-accent"}`}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: c.color }}>
                  {c.type === "postgresql" ? "Pg" : c.type === "mysql" ? "My" : "SL"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{c.name}</div>
                  <div className={`text-[10px] truncate ${selectedConn?.id === c.id ? "text-blue-100" : "text-muted-foreground"}`}>
                    {c.ssh ? `SSH : ${c.ssh.username}` : c.host}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Col 2: Databases */}
        <div className="w-64 border-r flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              value={dbSearch} onChange={e => setDbSearch(e.target.value)}
              placeholder="Search for database..."
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {dbLoading && <p className="text-xs text-muted-foreground px-3 py-2">Loading...</p>}
            {dbError && <p className="text-xs text-destructive px-3 py-2">{dbError}</p>}
            {!dbLoading && !dbError && filteredDbs.map(db => (
              <button
                key={db}
                onClick={() => setSelectedDb(db)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors ${selectedDb === db ? "bg-blue-500 text-white" : "hover:bg-accent"}`}
              >
                <div className="w-4 h-4 rounded bg-blue-400/30 shrink-0" />
                {db}
              </button>
            ))}
          </div>
        </div>

        {/* Col 3: Options + output */}
        <div className="flex-1 flex flex-col">
          {jobStatus === "idle" ? (
            <div className="overflow-y-auto flex-1 p-4 space-y-1">
              {flagList.length === 0 && selectedConn?.type === "sqlite" && (
                <p className="text-xs text-muted-foreground">SQLite backup is a direct file copy. No options needed.</p>
              )}
              {flagList.map(f => (
                <button
                  key={f.flag}
                  onClick={() => toggleFlag(f.flag)}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded font-mono transition-colors ${activeFlags.has(f.flag) ? "bg-blue-500/20 text-blue-400 border border-blue-500/40" : "bg-muted/40 text-muted-foreground border border-transparent hover:bg-muted"}`}
                >
                  {f.flag}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex-1 bg-black p-4 font-mono text-xs text-green-400 overflow-y-auto whitespace-pre-wrap">
              {jobOutput || "Starting..."}
            </div>
          )}

          {error && (
            <div className="px-4 py-2 text-xs text-destructive border-t">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 px-6 py-3 border-t shrink-0">
        {jobStatus === "idle" && (
          <>
            <button onClick={handleDone} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              onClick={handleStartBackup}
              disabled={!selectedConn || !selectedDb}
              className="px-4 py-1.5 text-sm bg-muted hover:bg-muted/80 border rounded transition-colors disabled:opacity-40"
            >
              Start backup...
            </button>
          </>
        )}
        {jobStatus === "running" && (
          <span className="text-xs text-muted-foreground animate-pulse">Running backup...</span>
        )}
        {(jobStatus === "done" || jobStatus === "error") && (
          <button onClick={handleDone} className="px-4 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors">
            Done
          </button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

**Step 3: Commit**

```bash
git commit -m "feat: BackupDialog with connection/database selection, flags, and job output"
```

---

### Task 7: RestoreDialog

**Files:**
- Create: `src/components/RestoreDialog.tsx`

**Step 1: Create `RestoreDialog.tsx`**

Same structure as `BackupDialog` but mirrored layout (options left, connections+databases center/right) and uses `startRestore` + file picker for input.

```tsx
import { useState, useEffect, useRef } from "react";
import { X, Search } from "lucide-react";
import { Connection, useConnectionStore } from "../store/connections";
import { listDatabases, startRestore, getJobStatus, removeJob, getPassword, getSshPassword } from "../lib/tauri-commands";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";

const PG_RESTORE_FLAGS = [
  { flag: "--clean", label: "--clean", defaultOn: false },
  { flag: "--create", label: "--create", defaultOn: false },
  { flag: "--no-owner", label: "--no-owner", defaultOn: false },
  { flag: "--no-privileges", label: "--no-privileges", defaultOn: false },
  { flag: "--single-transaction", label: "--single-transaction", defaultOn: true },
  { flag: "--data-only", label: "--data-only", defaultOn: false },
  { flag: "--schema-only", label: "--schema-only", defaultOn: false },
];

const MYSQL_RESTORE_FLAGS = [
  { flag: "--default-character-set=utf8mb4", label: "--default-character-set=utf8mb4", defaultOn: false },
  { flag: "--single-transaction", label: "--single-transaction", defaultOn: true },
];

interface Props {
  conn: Connection | null;
  onClose: () => void;
}

export function RestoreDialog({ conn, onClose }: Props) {
  const { connections } = useConnectionStore();
  const [selectedConn, setSelectedConn] = useState<Connection | null>(conn);
  const [connSearch, setConnSearch] = useState("");
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [dbSearch, setDbSearch] = useState("");
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [activeFlags, setActiveFlags] = useState<Set<string>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobOutput, setJobOutput] = useState("");
  const [jobStatus, setJobStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!selectedConn) return;
    const flagList = selectedConn.type === "postgresql" ? PG_RESTORE_FLAGS : selectedConn.type === "mysql" ? MYSQL_RESTORE_FLAGS : [];
    setActiveFlags(new Set(flagList.filter(f => f.defaultOn).map(f => f.flag)));
  }, [selectedConn?.type]);

  useEffect(() => {
    if (!selectedConn) { setDatabases([]); setSelectedDb(null); return; }
    setDbLoading(true); setDbError(null); setSelectedDb(null);
    const load = async () => {
      try {
        const password = await getPassword(selectedConn.id).catch(() => "");
        const sshPassword = selectedConn.ssh?.authMethod === "password"
          ? await getSshPassword(selectedConn.id).catch(() => "") : undefined;
        const dbs = await listDatabases({
          id: selectedConn.id, name: selectedConn.name,
          db_type: selectedConn.type, host: selectedConn.host,
          port: selectedConn.port, database: selectedConn.database,
          username: selectedConn.username, password, color: selectedConn.color,
          ssh_host: selectedConn.ssh?.host, ssh_port: selectedConn.ssh?.port,
          ssh_username: selectedConn.ssh?.username, ssh_auth_method: selectedConn.ssh?.authMethod,
          ssh_password: sshPassword, ssh_private_key_path: selectedConn.ssh?.privateKeyPath,
          ssh_use_password_auth: selectedConn.ssh?.usePasswordAuth,
          ssh_add_legacy_host_key: selectedConn.ssh?.addLegacyHostKeyAlgos,
          ssh_add_legacy_kex: selectedConn.ssh?.addLegacyKexAlgos,
          ssh_backend: selectedConn.ssh?.backend,
        });
        setDatabases(dbs);
      } catch (e) { setDbError(String(e)); }
      finally { setDbLoading(false); }
    };
    load();
  }, [selectedConn?.id]);

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      const status = await getJobStatus(jobId).catch(() => null);
      if (!status) return;
      setJobOutput(status.output);
      if (status.status !== "running") {
        setJobStatus(status.status as "done" | "error");
        clearInterval(pollRef.current!);
      }
    }, 500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  if (!conn && !selectedConn) return null;

  const flagList = selectedConn?.type === "postgresql" ? PG_RESTORE_FLAGS : selectedConn?.type === "mysql" ? MYSQL_RESTORE_FLAGS : [];

  function toggleFlag(flag: string) {
    setActiveFlags(prev => { const n = new Set(prev); n.has(flag) ? n.delete(flag) : n.add(flag); return n; });
  }

  async function pickFile() {
    const path = await openFilePicker({
      filters: [{ name: "Backup files", extensions: ["dump", "sql", "tar", "db", "sqlite"] }],
      multiple: false,
    });
    if (typeof path === "string") setInputPath(path);
  }

  async function handleStartRestore() {
    if (!selectedConn || !selectedDb || !inputPath) return;
    setError(null);
    try {
      const id = crypto.randomUUID();
      const password = await getPassword(selectedConn.id).catch(() => "");
      const sshPassword = selectedConn.ssh?.authMethod === "password"
        ? await getSshPassword(selectedConn.id).catch(() => "") : undefined;

      setJobId(id); setJobStatus("running"); setJobOutput("");

      await startRestore(
        {
          id: selectedConn.id, name: selectedConn.name,
          db_type: selectedConn.type, host: selectedConn.host,
          port: selectedConn.port, database: selectedConn.database,
          username: selectedConn.username, password, color: selectedConn.color,
          ssh_host: selectedConn.ssh?.host, ssh_port: selectedConn.ssh?.port,
          ssh_username: selectedConn.ssh?.username, ssh_auth_method: selectedConn.ssh?.authMethod,
          ssh_password: sshPassword, ssh_private_key_path: selectedConn.ssh?.privateKeyPath,
          ssh_use_password_auth: selectedConn.ssh?.usePasswordAuth,
          ssh_add_legacy_host_key: selectedConn.ssh?.addLegacyHostKeyAlgos,
          ssh_add_legacy_kex: selectedConn.ssh?.addLegacyKexAlgos,
          ssh_backend: selectedConn.ssh?.backend,
        },
        selectedDb,
        inputPath,
        Array.from(activeFlags),
        id,
      );
    } catch (e) { setError(String(e)); setJobStatus("idle"); }
  }

  function handleDone() {
    if (jobId) removeJob(jobId).catch(() => {});
    onClose();
  }

  const filteredConns = connections.filter(c => c.name.toLowerCase().includes(connSearch.toLowerCase()));
  const filteredDbs = databases.filter(d => d.toLowerCase().includes(dbSearch.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <span className="text-sm font-semibold">Restore database</span>
        <button onClick={handleDone} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      {/* File picker */}
      <div className="flex items-center gap-3 px-6 py-2 border-b shrink-0">
        <span className="text-xs text-muted-foreground">File:</span>
        <span className="text-xs font-mono flex-1 truncate">{inputPath ? inputPath.split("/").pop() : "No file selected"}</span>
        <button onClick={pickFile} className="px-3 py-1 text-xs border rounded hover:bg-muted transition-colors">Browse...</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Col 1: Options */}
        <div className="w-56 border-r flex flex-col p-4 space-y-1 overflow-y-auto">
          {flagList.length === 0 && selectedConn?.type === "sqlite" && (
            <p className="text-xs text-muted-foreground">SQLite restore is a direct file copy. No options needed.</p>
          )}
          {flagList.map(f => (
            <button
              key={f.flag}
              onClick={() => toggleFlag(f.flag)}
              className={`w-full text-left px-3 py-1.5 text-xs rounded font-mono transition-colors ${activeFlags.has(f.flag) ? "bg-blue-500/20 text-blue-400 border border-blue-500/40" : "bg-muted/40 text-muted-foreground border border-transparent hover:bg-muted"}`}
            >
              {f.flag}
            </button>
          ))}
        </div>

        {/* Col 2: Connections */}
        <div className="w-72 border-r flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input value={connSearch} onChange={e => setConnSearch(e.target.value)} placeholder="Search for connection..." className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground" />
          </div>
          <div className="overflow-y-auto flex-1 py-1">
            {filteredConns.map(c => (
              <button key={c.id} onClick={() => setSelectedConn(c)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${selectedConn?.id === c.id ? "bg-blue-500 text-white" : "hover:bg-accent"}`}
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: c.color }}>
                  {c.type === "postgresql" ? "Pg" : c.type === "mysql" ? "My" : "SL"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{c.name}</div>
                  <div className={`text-[10px] truncate ${selectedConn?.id === c.id ? "text-blue-100" : "text-muted-foreground"}`}>
                    {c.ssh ? `SSH : ${c.ssh.username}` : c.host}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Col 3: Databases + output */}
        <div className="flex-1 flex flex-col">
          {jobStatus === "idle" ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-b">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input value={dbSearch} onChange={e => setDbSearch(e.target.value)} placeholder="Search for database..." className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground" />
              </div>
              <div className="overflow-y-auto flex-1 py-1">
                {dbLoading && <p className="text-xs text-muted-foreground px-3 py-2">Loading...</p>}
                {dbError && <p className="text-xs text-destructive px-3 py-2">{dbError}</p>}
                {!dbLoading && !dbError && filteredDbs.map(db => (
                  <button key={db} onClick={() => setSelectedDb(db)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors ${selectedDb === db ? "bg-blue-500 text-white" : "hover:bg-accent"}`}
                  >
                    <div className="w-4 h-4 rounded bg-blue-400/30 shrink-0" />
                    {db}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 bg-black p-4 font-mono text-xs text-green-400 overflow-y-auto whitespace-pre-wrap">
              {jobOutput || "Starting..."}
            </div>
          )}
          {error && <div className="px-4 py-2 text-xs text-destructive border-t">{error}</div>}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 px-6 py-3 border-t shrink-0">
        {jobStatus === "idle" && (
          <>
            <button onClick={handleDone} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            <button
              onClick={handleStartRestore}
              disabled={!selectedConn || !selectedDb || !inputPath}
              className="px-4 py-1.5 text-sm bg-muted hover:bg-muted/80 border rounded transition-colors disabled:opacity-40"
            >
              Start restore...
            </button>
          </>
        )}
        {jobStatus === "running" && <span className="text-xs text-muted-foreground animate-pulse">Restoring...</span>}
        {(jobStatus === "done" || jobStatus === "error") && (
          <button onClick={handleDone} className="px-4 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors">Done</button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

**Step 3: Commit**

```bash
git commit -m "feat: RestoreDialog with file picker, connection/database selection, flags, and job output"
```

---

### Task 8: Wire into ConnectionsScreen + ConnectionContextMenu

**Files:**
- Modify: `src/components/ConnectionContextMenu.tsx`
- Modify: `src/components/ConnectionsScreen.tsx`

**Step 1: Add `onBackup` and `onRestore` props to `ConnectionContextMenu`**

In `Props` interface, add:
```ts
onBackup: () => void;
onRestore: () => void;
```

In destructuring, add `onBackup, onRestore`.

In `items` array, add after "Export Connection" item:
```ts
{ separator: true, label: "" },
{
  label: "Backup database",
  icon: <Download className="h-3.5 w-3.5" />,
  action: () => { onBackup(); onClose(); },
},
{
  label: "Restore database",
  icon: <Upload className="h-3.5 w-3.5" />,
  action: () => { onRestore(); onClose(); },
},
```

**Step 2: Wire in `ConnectionsScreen`**

Add state:
```ts
const [backupConn, setBackupConn] = useState<Connection | null>(null);
const [restoreConn, setRestoreConn] = useState<Connection | null>(null);
```

Add imports:
```ts
import { BackupDialog } from "./BackupDialog";
import { RestoreDialog } from "./RestoreDialog";
```

Add to JSX dialogs section:
```tsx
<BackupDialog conn={backupConn} onClose={() => setBackupConn(null)} />
<RestoreDialog conn={restoreConn} onClose={() => setRestoreConn(null)} />
```

Add to `ConnectionContextMenu` call site:
```tsx
onBackup={() => setBackupConn(connCtx.conn)}
onRestore={() => setRestoreConn(connCtx.conn)}
```

**Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

**Step 4: Commit**

```bash
git commit -m "feat: wire BackupDialog + RestoreDialog into context menu"
```

---

### Task 9: Register all commands in lib.rs + capabilities

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

**Step 1: Final `lib.rs` command list**

Ensure `tauri::generate_handler![]` contains:
```rust
commands::list_databases,
commands::start_backup,
commands::start_restore,
commands::get_job_status,
commands::remove_job,
```

**Step 2: Add `dialog:allow-save` to capabilities**

In `default.json`:
```json
"dialog:allow-open",
"dialog:allow-save"
```

**Step 3: Final compile check**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
npx tsc --noEmit 2>&1
```

Expected: both clean.

**Step 4: Commit**

```bash
git commit -m "feat: register backup/restore commands in lib.rs and capabilities"
```

---

### Testing checklist

- [ ] Right-click connection → "Backup database" opens full-screen dialog
- [ ] Selecting a connection loads its databases (SSH tunnel connections work)
- [ ] Selecting a database enables "Start backup..." button
- [ ] Click "Start backup..." → native save dialog → job starts → terminal output appears
- [ ] Job completes → status "done" → "Done" button closes dialog
- [ ] pg_dump not found → error shown in terminal output area
- [ ] Right-click → "Restore database" → pick file → select connection → select target DB → "Start restore..."
- [ ] MySQL backup/restore flags list correct
- [ ] SQLite backup = file copy, no flags shown
- [ ] SSH connections: tunnel established before dump, killed after
