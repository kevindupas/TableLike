# TableLike Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a desktop database client (TablePlus-inspired) with PostgreSQL/MySQL/SQLite support and geographic data visualization via MapLibre.

**Architecture:** Tauri v2 desktop app with React frontend and Rust backend. Rust handles all DB connections via SQLx and geometry conversion via geozero. React renders data via TanStack Table and maps via MapLibre GL JS.

**Tech Stack:** Tauri v2, React 18, Vite, TypeScript, Tailwind CSS, Shadcn UI, TanStack Table, CodeMirror 6, MapLibre GL JS, Zustand, SQLx (Rust), geozero (Rust), tauri-plugin-keychain

---

## Phase 1 — Fondations

### Task 1: Setup Tauri v2 + React + Vite

**Files:**
- Create: `src-tauri/` (Tauri backend)
- Create: `src/` (React frontend)
- Create: `src-tauri/Cargo.toml`
- Create: `package.json`

**Step 1: Install prerequisites**

```bash
# Install Rust (if not already installed)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Install Tauri CLI
cargo install tauri-cli --version "^2.0"

# Verify
rustc --version
cargo --version
```

Expected: versions print without errors.

**Step 2: Scaffold project**

```bash
cargo tauri init --template react-ts --manager npm
# Name: TableLike
# Window title: TableLike
# Web assets: ../dist
# Dev server: http://localhost:5173
# Dev command: npm run dev
# Build command: npm run build
```

**Step 3: Install frontend dependencies**

```bash
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install zustand @tanstack/react-table
npm install lucide-react class-variance-authority clsx tailwind-merge
```

**Step 4: Install Shadcn UI**

```bash
npx shadcn@latest init
# Style: Default
# Base color: Neutral
# CSS variables: yes
```

Add key components:
```bash
npx shadcn@latest add button input label dialog drawer tabs tooltip separator scroll-area badge
```

**Step 5: Configure Tailwind in vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

**Step 6: Add Rust dependencies in `src-tauri/Cargo.toml`**

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.7", features = ["runtime-tokio", "postgres", "mysql", "sqlite", "chrono", "uuid"] }
geozero = { version = "0.12", features = ["with-wkb", "with-geojson"] }
uuid = { version = "1", features = ["v4"] }
thiserror = "1"
```

**Step 7: Verify dev server starts**

```bash
cargo tauri dev
```

Expected: Window opens showing Vite + React default page.

**Step 8: Commit**

```bash
git init
git add .
git commit -m "feat: scaffold Tauri v2 + React + Shadcn project"
```

---

### Task 2: Connection List Screen (UI Only)

**Files:**
- Create: `src/components/ConnectionList.tsx`
- Create: `src/components/ConnectionItem.tsx`
- Create: `src/store/connections.ts`
- Modify: `src/App.tsx`

**Step 1: Create Zustand store for connections**

```typescript
// src/store/connections.ts
import { create } from "zustand";

export type DbType = "postgresql" | "mysql" | "sqlite";

export interface Connection {
  id: string;
  name: string;
  type: DbType;
  host: string;
  port: number;
  database: string;
  username: string;
  color: string;
}

interface ConnectionStore {
  connections: Connection[];
  activeConnectionId: string | null;
  setActiveConnection: (id: string) => void;
  addConnection: (conn: Connection) => void;
  removeConnection: (id: string) => void;
}

export const useConnectionStore = create<ConnectionStore>((set) => ({
  connections: [],
  activeConnectionId: null,
  setActiveConnection: (id) => set({ activeConnectionId: id }),
  addConnection: (conn) =>
    set((state) => ({ connections: [...state.connections, conn] })),
  removeConnection: (id) =>
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
    })),
}));
```

**Step 2: Create ConnectionItem component**

```typescript
// src/components/ConnectionItem.tsx
import { Connection } from "../store/connections";

const DB_LABELS: Record<string, string> = {
  postgresql: "Pg",
  mysql: "My",
  sqlite: "Sl",
};

interface Props {
  connection: Connection;
  isActive: boolean;
  onClick: () => void;
}

export function ConnectionItem({ connection, isActive, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-3 py-2 rounded-md text-left transition-colors ${
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: connection.color }}
      >
        {DB_LABELS[connection.type]}
      </div>
      <div className="min-w-0">
        <div className="font-medium text-sm truncate">{connection.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {connection.type === "sqlite"
            ? connection.database
            : `${connection.host}:${connection.port}`}
        </div>
      </div>
    </button>
  );
}
```

**Step 3: Create ConnectionList with mock data**

```typescript
// src/components/ConnectionList.tsx
import { Plus, Search } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ConnectionItem } from "./ConnectionItem";
import { useConnectionStore } from "../store/connections";
import { useState } from "react";

export function ConnectionList() {
  const { connections, activeConnectionId, setActiveConnection } =
    useConnectionStore();
  const [search, setSearch] = useState("");

  const filtered = connections.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full w-60 border-r bg-background">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search connection..."
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.map((conn) => (
          <ConnectionItem
            key={conn.id}
            connection={conn}
            isActive={conn.id === activeConnectionId}
            onClick={() => setActiveConnection(conn.id)}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            No connections yet
          </p>
        )}
      </div>

      <div className="p-3 border-t">
        <Button variant="outline" className="w-full gap-2" size="sm">
          <Plus className="h-4 w-4" />
          Create connection
        </Button>
      </div>
    </div>
  );
}
```

**Step 4: Wire into App.tsx**

```typescript
// src/App.tsx
import { ConnectionList } from "./components/ConnectionList";

function App() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <ConnectionList />
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p>Select a connection to get started</p>
      </div>
    </div>
  );
}

export default App;
```

**Step 5: Run dev and verify visually**

```bash
cargo tauri dev
```

Expected: sidebar visible, search input works, "Create connection" button visible.

**Step 6: Commit**

```bash
git add src/
git commit -m "feat: connection list sidebar UI with Zustand store"
```

---

### Task 3: New Connection Dialog (UI Only)

**Files:**
- Create: `src/components/NewConnectionDialog.tsx`
- Modify: `src/components/ConnectionList.tsx`

**Step 1: Create DB type picker modal**

```typescript
// src/components/NewConnectionDialog.tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { DbType, useConnectionStore } from "../store/connections";

const DB_OPTIONS: { type: DbType; label: string; color: string }[] = [
  { type: "postgresql", label: "PostgreSQL", color: "#336791" },
  { type: "mysql", label: "MySQL", color: "#e48e00" },
  { type: "sqlite", label: "SQLite", color: "#7b9cdb" },
];

const STATUS_COLORS = [
  "#6b7280", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NewConnectionDialog({ open, onClose }: Props) {
  const [step, setStep] = useState<"pick-type" | "configure">("pick-type");
  const [dbType, setDbType] = useState<DbType>("postgresql");
  const [form, setForm] = useState({
    name: "",
    host: "127.0.0.1",
    port: "5432",
    database: "",
    username: "",
    password: "",
    color: STATUS_COLORS[0],
  });
  const addConnection = useConnectionStore((s) => s.addConnection);

  function handleTypeSelect(type: DbType) {
    setDbType(type);
    setForm((f) => ({
      ...f,
      port: type === "postgresql" ? "5432" : type === "mysql" ? "3306" : "",
    }));
    setStep("configure");
  }

  function handleSave() {
    addConnection({
      id: crypto.randomUUID(),
      name: form.name || `${dbType} connection`,
      type: dbType,
      host: form.host,
      port: parseInt(form.port) || 5432,
      database: form.database,
      username: form.username,
      color: form.color,
    });
    onClose();
    setStep("pick-type");
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        {step === "pick-type" ? (
          <>
            <DialogHeader>
              <DialogTitle>Select Database Type</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-3 py-4">
              {DB_OPTIONS.map((db) => (
                <button
                  key={db.type}
                  onClick={() => handleTypeSelect(db.type)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:border-primary hover:bg-accent transition-colors"
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: db.color }}
                  >
                    {db.label.slice(0, 2)}
                  </div>
                  <span className="text-sm font-medium">{db.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{dbType} Connection</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="My Database"
                />
              </div>

              <div className="space-y-2">
                <Label>Status color</Label>
                <div className="flex gap-2">
                  {STATUS_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      className={`w-8 h-8 rounded border-2 transition-all ${
                        form.color === c ? "border-foreground scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {dbType !== "sqlite" ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label>Host</Label>
                      <Input
                        value={form.host}
                        onChange={(e) => setForm({ ...form, host: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Port</Label>
                      <Input
                        value={form.port}
                        onChange={(e) => setForm({ ...form, port: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>User</Label>
                    <Input
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Database</Label>
                    <Input
                      value={form.database}
                      onChange={(e) => setForm({ ...form, database: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label>File path</Label>
                  <Input
                    value={form.database}
                    onChange={(e) => setForm({ ...form, database: e.target.value })}
                    placeholder="/path/to/database.sqlite"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("pick-type")}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline">Test</Button>
                <Button onClick={handleSave}>Save</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Wire dialog into ConnectionList**

```typescript
// Add to ConnectionList.tsx
import { NewConnectionDialog } from "./NewConnectionDialog";
import { useState } from "react";

// Inside component:
const [dialogOpen, setDialogOpen] = useState(false);

// Replace Button onClick:
<Button variant="outline" className="w-full gap-2" size="sm" onClick={() => setDialogOpen(true)}>

// Add after closing div:
<NewConnectionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
```

**Step 3: Test visually — open dialog, pick type, fill form, save**

Expected: connection appears in list with correct color badge.

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: new connection dialog with type picker and color selector"
```

---

### Task 4: Rust Backend — Connection Manager

**Files:**
- Create: `src-tauri/src/db/mod.rs`
- Create: `src-tauri/src/db/connection.rs`
- Create: `src-tauri/src/db/types.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Create types**

```rust
// src-tauri/src/db/types.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub db_type: DbType,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DbType {
    Postgresql,
    Mysql,
    Sqlite,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub type_name: String,
    pub is_geo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "value")]
pub enum CellValue {
    Text(String),
    Number(f64),
    Bool(bool),
    Geo(serde_json::Value),
    Null,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<CellValue>>,
    pub total_count: Option<i64>,
    pub execution_time_ms: u64,
}
```

**Step 2: Create connection manager**

```rust
// src-tauri/src/db/connection.rs
use std::collections::HashMap;
use std::sync::Mutex;
use sqlx::{AnyPool, Pool, Postgres, MySql, Sqlite, Row};
use crate::db::types::{ConnectionConfig, DbType, QueryResult, ColumnInfo, CellValue};

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

        self.pools.lock().unwrap().insert(config.id.clone(), pool);
        Ok(())
    }

    pub fn disconnect(&self, connection_id: &str) {
        self.pools.lock().unwrap().remove(connection_id);
    }
}
```

**Step 3: Create mod.rs**

```rust
// src-tauri/src/db/mod.rs
pub mod connection;
pub mod types;
```

**Step 4: Wire into lib.rs**

```rust
// src-tauri/src/lib.rs
mod db;

use db::connection::ConnectionManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ConnectionManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::connect_db,
            commands::disconnect_db,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 5: Add basic Tauri commands**

```rust
// src-tauri/src/commands.rs
use tauri::State;
use crate::db::connection::ConnectionManager;
use crate::db::types::ConnectionConfig;

#[tauri::command]
pub async fn connect_db(
    config: ConnectionConfig,
    manager: State<'_, ConnectionManager>,
) -> Result<String, String> {
    manager.connect(&config).await?;
    Ok(config.id)
}

#[tauri::command]
pub async fn disconnect_db(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<(), String> {
    manager.disconnect(&connection_id);
    Ok(())
}
```

**Step 6: Verify Rust compiles**

```bash
cd src-tauri && cargo check
```

Expected: no errors.

**Step 7: Commit**

```bash
git add src-tauri/
git commit -m "feat: Rust connection manager with PG/MySQL/SQLite pool support"
```

---

### Task 5: Wire Frontend → Rust Connection

**Files:**
- Create: `src/lib/tauri-commands.ts`
- Modify: `src/components/NewConnectionDialog.tsx`
- Modify: `src/store/connections.ts`

**Step 1: Create Tauri command wrappers**

```typescript
// src/lib/tauri-commands.ts
import { invoke } from "@tauri-apps/api/core";
import { Connection } from "../store/connections";

export interface ConnectionConfig {
  id: string;
  name: string;
  db_type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  color: string;
}

export async function connectDb(config: ConnectionConfig): Promise<string> {
  return invoke("connect_db", { config });
}

export async function disconnectDb(connectionId: string): Promise<void> {
  return invoke("disconnect_db", { connectionId });
}
```

**Step 2: Add "Connect" button to NewConnectionDialog**

```typescript
// In handleSave, after addConnection:
import { connectDb } from "../lib/tauri-commands";

async function handleConnect() {
  try {
    await connectDb({
      id: crypto.randomUUID(),
      name: form.name,
      db_type: dbType,
      host: form.host,
      port: parseInt(form.port),
      database: form.database,
      username: form.username,
      password: form.password,
      color: form.color,
    });
    // success
  } catch (e) {
    alert(`Connection failed: ${e}`);
  }
}
```

**Step 3: Test with a real local PostgreSQL connection**

Expected: no error alert, connection appears in list.

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: wire frontend connect button to Rust backend via Tauri invoke"
```

---

## Phase 2 — Tables, SQL Editor, Data Grid

### Task 6: Rust — Get Tables & Execute Query

**Files:**
- Create: `src-tauri/src/db/schema.rs`
- Create: `src-tauri/src/db/query.rs`
- Modify: `src-tauri/src/commands.rs`

**Step 1: Schema introspection (PostgreSQL)**

```rust
// src-tauri/src/db/schema.rs
use crate::db::connection::{ConnectionManager, DbPool};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TableInfo {
    pub schema: String,
    pub name: String,
}

pub async fn get_tables_pg(pool: &sqlx::PgPool) -> Result<Vec<TableInfo>, String> {
    let rows = sqlx::query!(
        "SELECT table_schema, table_name FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
         ORDER BY table_schema, table_name"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(|r| TableInfo {
            schema: r.table_schema.unwrap_or_default(),
            name: r.table_name.unwrap_or_default(),
        })
        .collect())
}
```

**Step 2: Add get_tables Tauri command**

```rust
// In commands.rs
#[tauri::command]
pub async fn get_tables(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<schema::TableInfo>, String> {
    let pools = manager.pools.lock().unwrap();
    match pools.get(&connection_id) {
        Some(DbPool::Postgres(pool)) => schema::get_tables_pg(pool).await,
        Some(DbPool::MySql(pool)) => schema::get_tables_mysql(pool).await,
        Some(DbPool::Sqlite(pool)) => schema::get_tables_sqlite(pool).await,
        None => Err("Connection not found".to_string()),
    }
}
```

**Step 3: Basic query executor (PostgreSQL rows → JSON)**

```rust
// src-tauri/src/db/query.rs
use sqlx::postgres::PgRow;
use sqlx::Row;
use crate::db::types::{QueryResult, ColumnInfo, CellValue};

pub async fn execute_pg(
    pool: &sqlx::PgPool,
    sql: &str,
    limit: i64,
    offset: i64,
) -> Result<QueryResult, String> {
    let start = std::time::Instant::now();

    let paginated = format!("{} LIMIT {} OFFSET {}", sql.trim_end_matches(';'), limit, offset);
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
                type_name: format!("{:?}", c.type_info()),
                is_geo: c.type_info().to_string().to_lowercase().contains("geometry"),
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
                        // WKB → GeoJSON via geozero (Task 10)
                        CellValue::Text("[geometry]".to_string())
                    } else {
                        row.try_get::<String, _>(i)
                            .map(CellValue::Text)
                            .or_else(|_| row.try_get::<i64, _>(i).map(|n| CellValue::Number(n as f64)))
                            .or_else(|_| row.try_get::<f64, _>(i).map(CellValue::Number))
                            .or_else(|_| row.try_get::<bool, _>(i).map(CellValue::Bool))
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
```

**Step 4: Add execute_query command**

```rust
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
    let pools = manager.pools.lock().unwrap();
    match pools.get(&connection_id) {
        Some(DbPool::Postgres(pool)) => query::execute_pg(pool, &sql, limit, offset).await,
        None => Err("Connection not found".to_string()),
        _ => Err("DB type not yet supported for queries".to_string()),
    }
}
```

**Step 5: cargo check**

```bash
cd src-tauri && cargo check
```

**Step 6: Commit**

```bash
git add src-tauri/
git commit -m "feat: Rust schema introspection and query executor"
```

---

### Task 7: Sidebar Tree (Schemas + Tables)

**Files:**
- Create: `src/components/SchemaTree.tsx`
- Modify: `src/store/connections.ts`
- Modify: `src/App.tsx`

**Step 1: Add active table state to store**

```typescript
// Add to ConnectionStore interface and create():
activeTable: string | null;
setActiveTable: (table: string | null) => void;
```

**Step 2: Create SchemaTree**

```typescript
// src/components/SchemaTree.tsx
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, Table } from "lucide-react";

interface TableInfo {
  schema: string;
  name: string;
}

interface Props {
  connectionId: string;
  onTableSelect: (schema: string, table: string) => void;
}

export function SchemaTree({ connectionId, onTableSelect }: Props) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<TableInfo[]>("get_tables", { connectionId })
      .then(setTables)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [connectionId]);

  const grouped = tables.reduce(
    (acc, t) => {
      if (!acc[t.schema]) acc[t.schema] = [];
      acc[t.schema].push(t.name);
      return acc;
    },
    {} as Record<string, string[]>
  );

  if (loading) return <div className="p-3 text-xs text-muted-foreground">Loading...</div>;

  return (
    <div className="py-2">
      {Object.entries(grouped).map(([schema, tableNames]) => (
        <div key={schema}>
          <button
            onClick={() =>
              setExpanded((prev) => {
                const next = new Set(prev);
                next.has(schema) ? next.delete(schema) : next.add(schema);
                return next;
              })
            }
            className="flex items-center gap-1 w-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider"
          >
            {expanded.has(schema) ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {schema}
          </button>
          {expanded.has(schema) &&
            tableNames.map((name) => (
              <button
                key={name}
                onClick={() => onTableSelect(schema, name)}
                className="flex items-center gap-2 w-full px-6 py-1 text-sm hover:bg-accent text-left"
              >
                <Table className="h-3 w-3 text-muted-foreground" />
                {name}
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}
```

**Step 3: Integrate in App.tsx below connection list**

**Step 4: Verify — connect to PG, see schemas collapse/expand, tables listed**

**Step 5: Commit**

```bash
git add src/
git commit -m "feat: schema tree sidebar with schema grouping and table selection"
```

---

### Task 8: Data Grid + SQL Editor

**Files:**
- Create: `src/components/DataGrid.tsx`
- Create: `src/components/SqlEditor.tsx`
- Create: `src/components/MainPanel.tsx`
- Modify: `src/App.tsx`

**Step 1: Install CodeMirror**

```bash
npm install @codemirror/lang-sql @codemirror/theme-one-dark codemirror @uiw/react-codemirror
```

**Step 2: Create SqlEditor**

```typescript
// src/components/SqlEditor.tsx
import CodeMirror from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { useTheme } from "next-themes"; // or your theme provider

interface Props {
  value: string;
  onChange: (val: string) => void;
  onRun: () => void;
}

export function SqlEditor({ value, onChange, onRun }: Props) {
  return (
    <div className="border rounded-md overflow-hidden">
      <CodeMirror
        value={value}
        height="150px"
        extensions={[sql()]}
        theme={oneDark}
        onChange={onChange}
        basicSetup={{ lineNumbers: true, foldGutter: false }}
      />
      <div className="flex items-center gap-2 px-3 py-2 border-t bg-muted/30">
        <button
          onClick={onRun}
          className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded hover:bg-primary/90"
        >
          ▶ Run (⌘Enter)
        </button>
      </div>
    </div>
  );
}
```

**Step 3: Create DataGrid using TanStack Table**

```typescript
// src/components/DataGrid.tsx
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import { Badge } from "./ui/badge";

interface QueryResult {
  columns: { name: string; type_name: string; is_geo: boolean }[];
  rows: any[][];
  total_count: number | null;
  execution_time_ms: number;
}

interface Props {
  result: QueryResult | null;
  onShowMap?: (geoColumnIndex: number) => void;
}

export function DataGrid({ result, onShowMap }: Props) {
  if (!result) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Run a query to see results
      </div>
    );
  }

  const columns: ColumnDef<any[]>[] = result.columns.map((col, i) => ({
    id: col.name,
    header: () => (
      <div className="flex items-center gap-1">
        <span>{col.name}</span>
        <span className="text-xs text-muted-foreground">{col.type_name}</span>
        {col.is_geo && (
          <Badge variant="secondary" className="text-xs px-1">🌍</Badge>
        )}
      </div>
    ),
    cell: ({ row }) => {
      const cell = row.original[i];
      if (!cell || cell.type === "Null") return <span className="text-muted-foreground">NULL</span>;
      if (cell.type === "Geo") return <span className="text-blue-500 cursor-pointer">geometry</span>;
      return <span className="truncate max-w-xs block">{String(cell.value)}</span>;
    },
  }));

  const table = useReactTable({
    data: result.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const geoColumns = result.columns
    .map((c, i) => ({ ...c, index: i }))
    .filter((c) => c.is_geo);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b text-xs text-muted-foreground">
        <span>{result.rows.length} rows · {result.execution_time_ms}ms</span>
        {geoColumns.length > 0 && onShowMap && (
          <button
            onClick={() => onShowMap(geoColumns[0].index)}
            className="flex items-center gap-1 text-blue-500 hover:text-blue-600"
          >
            🌍 Show on Map
          </button>
        )}
      </div>
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2 text-left font-medium border-b whitespace-nowrap">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-1.5 border-b border-muted/30 max-w-xs">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

**Step 4: Create MainPanel wiring them together**

```typescript
// src/components/MainPanel.tsx
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SqlEditor } from "./SqlEditor";
import { DataGrid } from "./DataGrid";

interface Props {
  connectionId: string;
  initialTable?: { schema: string; name: string };
}

export function MainPanel({ connectionId, initialTable }: Props) {
  const [sql, setSql] = useState(
    initialTable
      ? `SELECT * FROM "${initialTable.schema}"."${initialTable.name}"`
      : ""
  );
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke("execute_query", {
        connectionId,
        sql,
        limit: 300,
        offset: 0,
      });
      setResult(res as any);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [connectionId, sql]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden p-3 gap-3">
      <SqlEditor value={sql} onChange={setSql} onRun={runQuery} />
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">
          {error}
        </div>
      )}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Running...
        </div>
      ) : (
        <DataGrid result={result} />
      )}
    </div>
  );
}
```

**Step 5: Test end-to-end: connect → select table → see data**

**Step 6: Commit**

```bash
git add src/
git commit -m "feat: SQL editor + data grid with TanStack Table"
```

---

### Task 9: Dark/Light Mode Toggle

**Files:**
- Create: `src/components/Toolbar.tsx`
- Create: `src/lib/theme.ts`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Step 1: Add theme provider**

```bash
npm install next-themes
```

**Step 2: Wrap app in ThemeProvider**

```typescript
// src/main.tsx
import { ThemeProvider } from "next-themes";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="system">
    <App />
  </ThemeProvider>
);
```

**Step 3: Create Toolbar with toggle**

```typescript
// src/components/Toolbar.tsx
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "./ui/button";

export function Toolbar() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="h-10 border-b flex items-center justify-between px-4">
      <span className="font-semibold text-sm">TableLike</span>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </div>
  );
}
```

**Step 4: Verify dark/light toggle works with all components**

**Step 5: Commit**

```bash
git add src/
git commit -m "feat: dark/light mode toggle with next-themes"
```

---

## Phase 3 — Geo Killer Feature

### Task 10: WKB → GeoJSON in Rust

**Files:**
- Modify: `src-tauri/src/db/query.rs`
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add geozero features to Cargo.toml**

```toml
geozero = { version = "0.12", features = ["with-wkb", "with-geojson", "with-postgis-sqlx"] }
```

**Step 2: Replace `[geometry]` placeholder with real conversion**

```rust
// In query.rs, replace geometry handling:
use geozero::wkb::Wkb;
use geozero::ToJson;

if col.is_geo {
    if let Ok(bytes) = row.try_get::<Vec<u8>, _>(i) {
        match Wkb(bytes).to_json() {
            Ok(geojson) => {
                let json: serde_json::Value = serde_json::from_str(&geojson)
                    .unwrap_or(serde_json::Value::Null);
                CellValue::Geo(json)
            }
            Err(_) => CellValue::Text("[invalid geometry]".to_string()),
        }
    } else {
        CellValue::Null
    }
}
```

**Step 3: cargo check**

```bash
cd src-tauri && cargo check
```

**Step 4: Test with a PostGIS table — verify geo column returns GeoJSON**

**Step 5: Commit**

```bash
git add src-tauri/
git commit -m "feat: WKB to GeoJSON conversion via geozero for geometry columns"
```

---

### Task 11: MapLibre Map Drawer

**Files:**
- Create: `src/components/MapDrawer.tsx`
- Modify: `src/components/DataGrid.tsx`
- Modify: `src/components/MainPanel.tsx`

**Step 1: Install MapLibre**

```bash
npm install maplibre-gl
npm install -D @types/maplibre-gl
```

**Step 2: Create MapDrawer**

```typescript
// src/components/MapDrawer.tsx
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "./ui/drawer";

interface Props {
  open: boolean;
  onClose: () => void;
  geojson: any | null;
}

export function MapDrawer({ open, onClose, geojson }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!open || !mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [0, 20],
      zoom: 2,
    });

    mapInstanceRef.current = map;

    map.on("load", () => {
      if (!geojson) return;

      map.addSource("geo-data", { type: "geojson", data: geojson });

      // Layer for points
      map.addLayer({
        id: "geo-points",
        type: "circle",
        source: "geo-data",
        filter: ["==", "$type", "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#3b82f6",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff",
        },
      });

      // Layer for lines
      map.addLayer({
        id: "geo-lines",
        type: "line",
        source: "geo-data",
        filter: ["==", "$type", "LineString"],
        paint: { "line-color": "#3b82f6", "line-width": 2 },
      });

      // Layer for polygons
      map.addLayer({
        id: "geo-fill",
        type: "fill",
        source: "geo-data",
        filter: ["==", "$type", "Polygon"],
        paint: { "fill-color": "#3b82f6", "fill-opacity": 0.3 },
      });

      // Fit bounds to data
      const bounds = new maplibregl.LngLatBounds();
      // TODO: compute bounds from geojson features
    });

    return () => map.remove();
  }, [open, geojson]);

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent className="h-[70vh]">
        <DrawerHeader>
          <DrawerTitle>Map View</DrawerTitle>
        </DrawerHeader>
        <div ref={mapRef} className="flex-1 rounded-b-lg overflow-hidden" />
      </DrawerContent>
    </Drawer>
  );
}
```

**Step 3: Build FeatureCollection from query result in MainPanel**

```typescript
// In MainPanel, add:
function buildGeoJson(result: any, geoColIndex: number) {
  const features = result.rows
    .map((row: any[]) => {
      const cell = row[geoColIndex];
      if (!cell || cell.type !== "Geo") return null;
      return { type: "Feature", geometry: cell.value, properties: {} };
    })
    .filter(Boolean);
  return { type: "FeatureCollection", features };
}
```

**Step 4: Wire "Show on Map" button → MapDrawer**

**Step 5: Test with real PostGIS data — points/polygons appear on map**

**Step 6: Commit**

```bash
git add src/
git commit -m "feat: MapLibre drawer showing geo query results as GeoJSON"
```

---

## Phase 4 — Polish (Post-MVP)

### Task 12: Persist Connections to Disk

Store connection configs (without password) to `~/.tablelike/connections.json` via Tauri `app_data_dir`. Password via `tauri-plugin-keychain`.

### Task 13: MySQL + SQLite Query Support

Implement `execute_mysql` and `execute_sqlite` in `query.rs` mirroring the Postgres implementation.

### Task 14: SSH Tunnel Support

Use `openssh` Rust crate to create local port forward before connecting. Add SSH fields to connection dialog.

### Task 15: Row Detail Panel

Sliding panel on right showing selected row data formatted (JSON pretty-print for JSON columns, geo preview for geometry).

### Task 16: Export Results

Button to export current query result as CSV or GeoJSON file via Tauri `save_file` dialog.

---

## Quick Reference Commands

```bash
# Start dev
cargo tauri dev

# Check Rust only
cd src-tauri && cargo check

# Build production
cargo tauri build

# Add Shadcn component
npx shadcn@latest add <component>
```
