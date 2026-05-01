# TableLike

A TablePlus-inspired open source database client built with Tauri 2, React and Rust. Supports PostgreSQL, MySQL and SQLite with native geo/GeoJSON support via MapLibre.

> **Status:** v0.1.0 beta — open source preview

---

## Features

- **Multi-database** — PostgreSQL, MySQL, SQLite
- **Schema browser** — sidebar tree of schemas and tables
- **Data grid** — paginated table view with TanStack Table
- **SQL editor** — write and run raw SQL queries
- **Geo support** — auto-detect geometry columns, render GeoJSON on an interactive MapLibre map
- **Tab system** — open multiple tables in tabs per connection
- **Row detail panel** — inspect a selected row in a side panel
- **Session persistence** — connections and open tabs survive restarts
- **Secure passwords** — stored in OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Dark / light / system theme**

---

## Tech Stack

| Layer | Tech |
|---|---|
| Desktop shell | Tauri 2 |
| Frontend | React 19, TypeScript, Vite 7 |
| Styling | Tailwind CSS 4, shadcn/ui |
| Table | TanStack Table v8 |
| Map | MapLibre GL JS 5 |
| State | Zustand 5 (with localStorage persistence) |
| Backend | Rust, sqlx 0.8 (async, native-tls) |
| Geo | geozero (WKB → GeoJSON) |
| Keychain | keyring 3 |

---

## Requirements

- [Node.js](https://nodejs.org) ≥ 18
- [Rust](https://rustup.rs) (stable toolchain)
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/) for your platform

**macOS only:** Xcode Command Line Tools

```bash
xcode-select --install
```

---

## Installation

### 1. Clone

```bash
git clone https://github.com/kevindupas/TableLike.git
cd TableLike
```

### 2. Install JS dependencies

```bash
npm install
```

### 3. Run in development

```bash
npm run tauri dev
```

This compiles the Rust backend and starts the Vite dev server. First build takes a few minutes.

### 4. Build for production

```bash
npm run tauri build
```

Output is in `src-tauri/target/release/bundle/`.

---

## Project Structure

```
TableLike/
├── src/                        # React frontend
│   ├── components/
│   │   ├── ConnectionsScreen.tsx   # Welcome / connections list
│   │   ├── DatabaseScreen.tsx      # Main app shell
│   │   ├── SchemaTree.tsx          # Sidebar schema/table tree
│   │   ├── MainPanel.tsx           # Tab bar + active panel
│   │   ├── DataGrid.tsx            # Table results grid
│   │   ├── SqlEditor.tsx           # SQL editor
│   │   ├── MapDrawer.tsx           # MapLibre geo drawer
│   │   ├── DetailPanel.tsx         # Row detail side panel
│   │   ├── FilterBar.tsx           # Column filters
│   │   ├── TabBar.tsx              # Open tabs
│   │   ├── BottomBar.tsx           # Status bar
│   │   ├── RowContextMenu.tsx      # Right-click menu
│   │   └── NewConnectionDialog.tsx # New connection wizard
│   ├── store/
│   │   ├── connections.ts          # Connection state (persisted)
│   │   └── tabs.ts                 # Tab state (persisted)
│   └── lib/
│       └── tauri-commands.ts       # Typed Tauri command wrappers
├── src-tauri/
│   └── src/
│       ├── commands.rs             # Tauri commands (connect, query, keychain)
│       ├── lib.rs                  # App setup and command registration
│       └── db/
│           ├── connection.rs       # Connection pool management
│           ├── query.rs            # Query execution (pg, mysql, sqlite)
│           └── types.rs            # Shared types (CellValue, QueryResult…)
└── public/
    └── logo.png
```

---

## Supported Databases

| Database | Status |
|---|---|
| PostgreSQL | ✅ Available |
| MySQL | ✅ Available |
| SQLite | ✅ Available |
| MariaDB, Redshift, MSSQL, ClickHouse… | 🔜 Planned |

---

## Geo Support

Columns with type `geometry` or `geography` (PostGIS) are automatically detected. In the data grid, right-click any row and select **Show Map** to render the geometry on an interactive MapLibre map.

---

## License

MIT
