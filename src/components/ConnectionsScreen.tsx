import { useState } from "react";
import { Search, Plus, Database, HardDrive, RotateCcw } from "lucide-react";
import { Input } from "./ui/input";
import { useConnectionStore, Connection } from "../store/connections";
import { NewConnectionDialog } from "./NewConnectionDialog";
import { connectDb, getPassword } from "../lib/tauri-commands";

export function ConnectionsScreen() {
  const { connections, activeConnectionId, connectedIds, setActiveConnection, setConnected } =
    useConnectionStore();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const filtered = connections.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
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

  const DB_LABELS: Record<string, string> = {
    postgresql: "Pg",
    mysql: "My",
    sqlite: "Sl",
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r flex flex-col shrink-0 bg-muted/20">
        {/* Logo */}
        <div className="px-4 py-5 border-b">
          <h1 className="text-lg font-bold tracking-tight">TableLike</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Database Client</p>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search connection..."
              className="pl-7 h-7 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Connection list */}
        <div className="flex-1 overflow-y-auto py-1.5 px-2 space-y-0.5">
          {filtered.map((conn) => {
            const isConnected = connectedIds.has(conn.id);
            const isLoading = connecting === conn.id;
            return (
              <button
                key={conn.id}
                onDoubleClick={() => handleConnect(conn)}
                onClick={() => setActiveConnection(conn.id)}
                disabled={isLoading}
                className={`flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-left transition-colors ${
                  conn.id === activeConnectionId
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="relative shrink-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: conn.color }}
                  >
                    {isLoading ? "…" : DB_LABELS[conn.type]}
                  </div>
                  {isConnected && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate leading-tight">{conn.name}</div>
                  <div className="text-xs text-muted-foreground truncate leading-tight">
                    {conn.type === "sqlite"
                      ? conn.database
                      : `${conn.host}:${conn.port}`}
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              No connections yet
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t px-2 py-2 space-y-0.5">
          <button className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <HardDrive className="h-3.5 w-3.5" />
            Backup database...
          </button>
          <button className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <RotateCcw className="h-3.5 w-3.5" />
            Restore database...
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Create connection...
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex items-center justify-center">
        {connectError ? (
          <div className="max-w-sm text-center space-y-3">
            <Database className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-sm font-medium text-destructive">Connection failed</p>
            <p className="text-xs text-muted-foreground">{connectError}</p>
            <button
              onClick={() => setConnectError(null)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <div className="text-center space-y-2">
            <Database className="h-10 w-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">Double-click a connection to open</p>
          </div>
        )}
      </div>

      <NewConnectionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
