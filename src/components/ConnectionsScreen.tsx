import { useState } from "react";
import { Search, HardDrive, RotateCcw, Plus } from "lucide-react";
import { useConnectionStore, Connection } from "../store/connections";
import { NewConnectionDialog } from "./NewConnectionDialog";
import { connectDb, getPassword } from "../lib/tauri-commands";

const DB_LABELS: Record<string, string> = {
  postgresql: "Pg",
  mysql: "My",
  sqlite: "Sl",
};

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

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 border-r flex flex-col shrink-0 bg-muted/10">
        {/* Logo */}
        <div className="px-4 pt-5 pb-3 flex flex-col items-center text-center border-b">
          <svg width="52" height="52" viewBox="0 0 100 100" className="mb-1.5">
            <circle cx="50" cy="50" r="48" fill="#e8a020" />
            {/* Body */}
            <ellipse cx="50" cy="62" rx="28" ry="24" fill="#c87010" />
            {/* Head */}
            <ellipse cx="50" cy="42" rx="22" ry="20" fill="#e8a020" />
            {/* Ears */}
            <ellipse cx="25" cy="38" rx="10" ry="13" fill="#e8a020" />
            <ellipse cx="75" cy="38" rx="10" ry="13" fill="#e8a020" />
            <ellipse cx="25" cy="38" rx="6" ry="9" fill="#c87010" />
            <ellipse cx="75" cy="38" rx="6" ry="9" fill="#c87010" />
            {/* Eyes */}
            <circle cx="43" cy="38" r="3" fill="#fff" />
            <circle cx="57" cy="38" r="3" fill="#fff" />
            <circle cx="44" cy="39" r="1.5" fill="#333" />
            <circle cx="58" cy="39" r="1.5" fill="#333" />
            {/* Trunk */}
            <path d="M44 52 Q38 60 40 70 Q42 76 46 74 Q48 68 50 62" stroke="#c87010" strokeWidth="5" fill="none" strokeLinecap="round" />
            {/* Tusks */}
            <path d="M43 50 Q36 56 34 62" stroke="#fff8dc" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M57 50 Q64 56 66 62" stroke="#fff8dc" strokeWidth="3" fill="none" strokeLinecap="round" />
          </svg>
          <div className="text-sm font-bold tracking-tight">TableLike</div>
          <div className="text-[10px] text-muted-foreground">Version 0.1.0</div>
          <div className="text-[10px] text-orange-400 mt-0.5">Open Source Preview</div>
          <div className="flex gap-1.5 mt-2">
            <button className="px-2 py-0.5 text-[10px] border rounded text-muted-foreground hover:bg-muted transition-colors">
              GitHub
            </button>
            <button className="px-2 py-0.5 text-[10px] border rounded text-muted-foreground hover:bg-muted transition-colors">
              Docs
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-2 py-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              placeholder="Search for connections..."
              className="w-full pl-7 pr-2 h-6 text-xs bg-muted/40 border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Connection list */}
        <div className="flex-1 overflow-y-auto px-1 pb-1">
          {filtered.map((conn) => {
            const isConnected = connectedIds.has(conn.id);
            const isLoading = connecting === conn.id;
            const isActive = conn.id === activeConnectionId;
            return (
              <button
                key={conn.id}
                onDoubleClick={() => handleConnect(conn)}
                onClick={() => { setActiveConnection(conn.id); setConnectError(null); }}
                disabled={isLoading}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left transition-colors group ${
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted/60"
                }`}
              >
                <div className="relative shrink-0">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: conn.color }}
                  >
                    {isLoading ? "…" : DB_LABELS[conn.type]}
                  </div>
                  {isConnected && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-background" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold truncate leading-tight">{conn.name}</span>
                    <span
                      className="text-[9px] px-1 rounded shrink-0 font-medium"
                      style={{
                        backgroundColor: conn.color + "22",
                        color: conn.color,
                      }}
                    >
                      {conn.type === "sqlite" ? "file" : "local"}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate leading-tight">
                    {conn.type === "sqlite"
                      ? conn.database
                      : `${conn.host}:${conn.port}`}
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && connections.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-6">
              No connections yet
            </p>
          )}
          {filtered.length === 0 && connections.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-6">
              No results
            </p>
          )}
        </div>

        {/* Footer actions */}
        <div className="border-t px-1 py-1.5 space-y-0.5">
          {connectError && (
            <div className="px-2 py-1.5 mb-1 rounded bg-destructive/10 border border-destructive/20">
              <p className="text-[10px] text-destructive leading-tight">{connectError}</p>
              <button
                onClick={() => setConnectError(null)}
                className="text-[10px] text-muted-foreground underline mt-0.5"
              >
                Dismiss
              </button>
            </div>
          )}
          <button className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <HardDrive className="h-3 w-3 shrink-0" />
            Backup database...
          </button>
          <button className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <RotateCcw className="h-3 w-3 shrink-0" />
            Restore database...
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Plus className="h-3 w-3 shrink-0" />
            Create connection...
          </button>
        </div>
      </div>

      {/* Main area — intentionally empty like TablePlus */}
      <div className="flex-1 bg-background" />

      <NewConnectionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
