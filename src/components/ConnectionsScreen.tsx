import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Search, HardDrive, RotateCcw, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { useConnectionStore, Connection, SortBy } from "../store/connections";
import { NewConnectionDialog } from "./NewConnectionDialog";
import { EditConnectionDialog } from "./EditConnectionDialog";
import { ConnectionContextMenu } from "./ConnectionContextMenu";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { ExportDialog } from "./ExportDialog";
import { ImportDialog } from "./ImportDialog";
import { connectDb, getPassword } from "../lib/tauri-commands";

const DB_LABELS: Record<string, string> = {
  postgresql: "Pg",
  mysql: "My",
  sqlite: "Sl",
};

function sortConnections(conns: Connection[], sortBy: SortBy): Connection[] {
  if (sortBy === "name") return [...conns].sort((a, b) => a.name.localeCompare(b.name));
  if (sortBy === "driver") return [...conns].sort((a, b) => a.type.localeCompare(b.type));
  if (sortBy === "tag") return [...conns].sort((a, b) => a.type.localeCompare(b.type));
  return conns;
}

type ExportScope = "all" | "group" | "single";

export function ConnectionsScreen() {
  const {
    connections,
    groups,
    sortBy,
    activeConnectionId,
    connectedIds,
    setActiveConnection,
    setConnected,
    removeConnection,
    addConnection,
    addGroup,
    setSortBy,
    toggleGroupCollapsed,
  } = useConnectionStore();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editConn, setEditConn] = useState<Connection | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportState, setExportState] = useState<{ open: boolean; scope: ExportScope; groupId?: string; connId?: string }>({
    open: false, scope: "all",
  });
  const [contextMenu, setContextMenu] = useState<{ conn: Connection; x: number; y: number } | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    win.setResizable(false);
    win.setMaximizable(false);
    return () => {
      win.setResizable(true);
      win.setMaximizable(true);
    };
  }, []);

  const filtered = sortConnections(
    connections.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    sortBy,
  );

  async function handleConnect(conn: Connection) {
    if (connectedIds.has(conn.id)) {
      setActiveConnection(conn.id);
      return;
    }
    setConnecting(conn.id);
    setConnectError(null);
    try {
      const password = await getPassword(conn.id).catch(() => "");
      await connectDb({
        id: conn.id,
        name: conn.name,
        db_type: conn.type,
        host: conn.host,
        port: conn.port,
        database: conn.database,
        username: conn.username,
        password,
        color: conn.color,
      });
      setConnected(conn.id, true);
      setActiveConnection(conn.id);
    } catch (e) {
      setConnectError(String(e));
    } finally {
      setConnecting(null);
    }
  }

  // Group ungrouped connections + connections per group
  const ungrouped = filtered.filter((c) => !c.groupId);
  const groupedMap = new Map<string, Connection[]>();
  for (const g of groups) {
    groupedMap.set(g.id, filtered.filter((c) => c.groupId === g.id));
  }

  function renderConn(conn: Connection, indent = false) {
    const isConn = connectedIds.has(conn.id);
    const isLoading = connecting === conn.id;
    const isActive = conn.id === activeConnectionId;
    return (
      <button
        key={conn.id}
        onDoubleClick={() => handleConnect(conn)}
        onClick={() => { setActiveConnection(conn.id); setConnectError(null); }}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ conn, x: e.clientX, y: e.clientY }); }}
        disabled={isLoading}
        className={`flex items-center gap-2 w-full py-2.5 rounded text-left transition-colors ${indent ? "pl-8 pr-4" : "px-4"} ${
          isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
        }`}
      >
        <div className="relative shrink-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[14px]"
            style={{ backgroundColor: conn.color }}
          >
            {isLoading ? "…" : DB_LABELS[conn.type]}
          </div>
          {isConn && (
            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-background" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold truncate">{conn.name}</span>
            <span
              className="text-[11px] px-1 rounded font-medium shrink-0"
              style={{ backgroundColor: conn.color + "28", color: conn.color }}
            >
              {conn.type === "sqlite" ? "file" : "local"}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate italic">
            {conn.type === "sqlite" ? conn.database : `${conn.host}:${conn.port}`}
          </div>
        </div>
      </button>
    );
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden relative">
      {/* Blurred background layer */}
      <div className="absolute inset-0 bg-linear-to-br from-muted/60 via-background to-muted/40 backdrop-blur-3xl pointer-events-none" />

      {/* LEFT: logo + footer only */}
      <div className="flex flex-col w-64 shrink-0 relative z-10 bg-black/20 backdrop-blur-xl">
        {/* Logo */}
        <div className="px-4 pt-5 pb-4 flex-1 flex flex-col items-center text-center">
          <img src="/logo.png" alt="TableLike" width={160} height={160} />
          <div className="text-xl font-bold mt-2">TableLike</div>
          <div className="text-[10px] text-muted-foreground">Version 0.1.0 (beta)</div>
          <div className="text-[10px] text-orange-400">Open Source Preview</div>
          <div className="flex gap-1.5 mt-2">
            <button className="px-2 py-0.5 text-[10px] border rounded text-muted-foreground hover:bg-muted">GitHub</button>
            <button className="px-2 py-0.5 text-[10px] border rounded text-muted-foreground hover:bg-muted">Docs</button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-2 space-y-2.5 mb-8">
          <button className="flex items-center justify-center gap-1.5 w-full px-2 py-2 rounded-md text-sm text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground transition-colors">
            <HardDrive className="h-3.5 w-3.5 shrink-0" />
            Backup database...
          </button>
          <button className="flex items-center justify-center gap-1.5 w-full px-2 py-2 rounded-md text-sm text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground transition-colors">
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            Restore database...
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center justify-center gap-1.5 w-full px-2 py-2 rounded-md text-sm text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            Create connection...
          </button>
        </div>
      </div>

      {/* RIGHT: searchbar + connections list below */}
      <div className="flex flex-col flex-1 overflow-hidden relative z-10 bg-background/20 backdrop-blur-xl">
        {/* Search bar */}
        <div className="flex items-center h-10 shrink-0 px-2 gap-1">
          <button
            onClick={() => setDialogOpen(true)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              placeholder="Search for connections..."
              className="w-full h-7 text-xs bg-muted/40 border border-border rounded pl-6 pr-2 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Connections list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {connectError && (
            <div className="mb-2 px-2 py-1.5 rounded bg-destructive/10 border border-destructive/20">
              <p className="text-[10px] text-destructive">{connectError}</p>
              <button onClick={() => setConnectError(null)} className="text-[10px] underline text-muted-foreground">
                Dismiss
              </button>
            </div>
          )}

          {/* Groups */}
          {groups.map((group) => {
            const groupConns = groupedMap.get(group.id) ?? [];
            return (
              <div key={group.id}>
                <button
                  onClick={() => toggleGroupCollapsed(group.id)}
                  className="flex items-center gap-1.5 w-full px-2 py-1 text-left hover:bg-muted/40 rounded transition-colors"
                >
                  {group.collapsed
                    ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  }
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                  <span className="text-xs font-medium text-muted-foreground">{group.name}</span>
                  <span className="text-[10px] text-muted-foreground/60 ml-auto">{groupConns.length}</span>
                </button>
                {!group.collapsed && groupConns.map((c) => renderConn(c, true))}
              </div>
            );
          })}

          {/* Ungrouped */}
          {ungrouped.map((c) => renderConn(c, false))}

          {filtered.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-6">
              {connections.length === 0 ? "No connections yet" : "No results"}
            </p>
          )}
        </div>
      </div>

      <NewConnectionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <EditConnectionDialog conn={editConn} onClose={() => setEditConn(null)} />
      <CreateGroupDialog
        open={groupDialogOpen}
        onClose={() => setGroupDialogOpen(false)}
        onCreate={(name, color) => addGroup({ id: crypto.randomUUID(), name, color, collapsed: false })}
      />
      <ExportDialog
        open={exportState.open}
        scope={exportState.scope}
        groupId={exportState.groupId}
        connId={exportState.connId}
        onClose={() => setExportState({ open: false, scope: "all" })}
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />

      {contextMenu && (
        <ConnectionContextMenu
          conn={contextMenu.conn}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onConnect={() => handleConnect(contextMenu.conn)}
          onEdit={() => setEditConn(contextMenu.conn)}
          onDuplicate={() => {
            const src = contextMenu.conn;
            addConnection({ ...src, id: crypto.randomUUID(), name: `${src.name} copy` });
          }}
          onDelete={() => removeConnection(contextMenu.conn.id)}
          onNewConnection={() => setDialogOpen(true)}
          onNewGroup={() => setGroupDialogOpen(true)}
          onSortBy={(s: SortBy) => setSortBy(s)}
          currentSort={sortBy}
          onImport={() => setImportOpen(true)}
          onExportAll={() => setExportState({ open: true, scope: "all" })}
          onExportGroup={() => setExportState({ open: true, scope: "group", groupId: contextMenu.conn.groupId })}
          onExportSingle={() => setExportState({ open: true, scope: "single", connId: contextMenu.conn.id })}
        />
      )}
    </div>
  );
}
