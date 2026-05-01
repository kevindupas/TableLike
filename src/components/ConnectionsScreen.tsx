import { useState } from "react";
import { ChevronRight, Search, HardDrive, RotateCcw, Plus } from "lucide-react";
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

      {/* LEFT COLUMN: logo + connections list + footer */}
      <div className="flex flex-col w-56 shrink-0 overflow-hidden">

        {/* Logo */}
        <div className="px-4 pt-5 pb-4">
          <svg width="52" height="52" viewBox="0 0 100 100">
            <ellipse cx="50" cy="55" rx="30" ry="26" fill="#d4891a" />
            <ellipse cx="50" cy="40" rx="24" ry="22" fill="#e8a020" />
            <ellipse cx="24" cy="36" rx="11" ry="14" fill="#e8a020" />
            <ellipse cx="76" cy="36" rx="11" ry="14" fill="#e8a020" />
            <ellipse cx="24" cy="36" rx="7" ry="10" fill="#d4891a" />
            <ellipse cx="76" cy="36" rx="7" ry="10" fill="#d4891a" />
            <circle cx="43" cy="36" r="3.5" fill="#fff" />
            <circle cx="57" cy="36" r="3.5" fill="#fff" />
            <circle cx="44" cy="37" r="2" fill="#1a1a1a" />
            <circle cx="58" cy="37" r="2" fill="#1a1a1a" />
            <path d="M44 50 Q37 58 39 68 Q41 74 45 72 Q47 65 50 60" stroke="#d4891a" strokeWidth="6" fill="none" strokeLinecap="round" />
            <path d="M43 49 Q36 55 33 62" stroke="#f0d090" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M57 49 Q64 55 67 62" stroke="#f0d090" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          </svg>
          <div className="text-base font-bold mt-1">TableLike</div>
          <div className="text-[10px] text-muted-foreground">Version 0.1.0 (beta)</div>
          <div className="text-[10px] text-orange-400">Open Source Preview</div>
          <div className="flex gap-1.5 mt-2">
            <button className="px-2 py-0.5 text-[10px] border rounded text-muted-foreground hover:bg-muted">GitHub</button>
            <button className="px-2 py-0.5 text-[10px] border rounded text-muted-foreground hover:bg-muted">Docs</button>
          </div>
        </div>

        {/* Connections list — fills remaining height */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {filtered.map((conn) => {
            const isConn = connectedIds.has(conn.id);
            const isLoading = connecting === conn.id;
            const isActive = conn.id === activeConnectionId;
            return (
              <button
                key={conn.id}
                onDoubleClick={() => handleConnect(conn)}
                onClick={() => { setActiveConnection(conn.id); setConnectError(null); }}
                disabled={isLoading}
                className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left transition-colors ${
                  isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
                }`}
              >
                <div className="relative shrink-0">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
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
                    <span className="text-[9px] px-1 rounded font-medium shrink-0"
                      style={{ backgroundColor: conn.color + "28", color: conn.color }}>
                      {conn.type === "sqlite" ? "file" : "local"}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate italic">
                    {conn.type === "sqlite" ? conn.database : `${conn.host}:${conn.port}`}
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-6">
              {connections.length === 0 ? "No connections yet" : "No results"}
            </p>
          )}
        </div>

        {/* Error */}
        {connectError && (
          <div className="mx-2 mb-1 px-2 py-1.5 rounded bg-destructive/10 border border-destructive/20">
            <p className="text-[10px] text-destructive">{connectError}</p>
            <button onClick={() => setConnectError(null)} className="text-[10px] underline text-muted-foreground">Dismiss</button>
          </div>
        )}

        {/* Footer */}
        <div className="border-t px-1.5 py-2 space-y-0.5">
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

      {/* RIGHT: searchbar on top + empty zone */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Search top bar */}
        <div className="flex items-center h-8 border-b shrink-0 px-2 gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            placeholder="Search for connections..."
            className="flex-1 h-full text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* Empty zone */}
        <div className="flex-1 bg-muted/10" />
      </div>

      <NewConnectionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
