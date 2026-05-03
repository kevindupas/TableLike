import { useState, useEffect, useRef } from "react";
import { X, Search } from "lucide-react";
import { Connection, useConnectionStore } from "../store/connections";
import { listDatabases, startBackup, getJobStatus, removeJob, getPassword, getSshPassword, getServerVersion } from "../lib/tauri-commands";
import { save as openSaveDialog, message } from "@tauri-apps/plugin-dialog";

const PG_FLAGS = [
  { flag: "--format=custom", defaultOn: true },
  { flag: "--format=plain", defaultOn: false },
  { flag: "--format=tar", defaultOn: false },
  { flag: "--data-only", defaultOn: false },
  { flag: "--schema-only", defaultOn: false },
  { flag: "--clean", defaultOn: false },
  { flag: "--create", defaultOn: false },
  { flag: "--no-owner", defaultOn: false },
  { flag: "--no-privileges", defaultOn: false },
];

const MYSQL_FLAGS = [
  { flag: "--single-transaction", defaultOn: true },
  { flag: "--routines", defaultOn: false },
  { flag: "--no-data", defaultOn: false },
  { flag: "--add-drop-table", defaultOn: false },
  { flag: "--add-drop-database", defaultOn: false },
  { flag: "--no-tablespaces", defaultOn: false },
  { flag: "--column-statistics=0", defaultOn: false },
  { flag: "--lock-tables=false", defaultOn: false },
  { flag: "--default-character-set=utf8mb4", defaultOn: false },
  { flag: "--compress", defaultOn: false },
  { flag: "--enable-cleartext-plugin", defaultOn: false },
];

interface Props {
  conn: Connection | null;
  onClose: () => void;
}

function buildConfig(c: Connection, password: string, sshPassword?: string) {
  return {
    id: c.id, name: c.name, db_type: c.type, host: c.host,
    port: c.port, database: c.database, username: c.username,
    password, color: c.color,
    ssh_host: c.ssh?.host, ssh_port: c.ssh?.port,
    ssh_username: c.ssh?.username, ssh_auth_method: c.ssh?.authMethod,
    ssh_password: sshPassword, ssh_private_key_path: c.ssh?.privateKeyPath,
    ssh_use_password_auth: c.ssh?.usePasswordAuth,
    ssh_add_legacy_host_key: c.ssh?.addLegacyHostKeyAlgos,
    ssh_add_legacy_kex: c.ssh?.addLegacyKexAlgos,
    ssh_backend: c.ssh?.backend,
  };
}

export function BackupDialog({ conn, onClose }: Props) {
  const { connections } = useConnectionStore();
  const [selectedConn, setSelectedConn] = useState<Connection | null>(conn);
  const [connSearch, setConnSearch] = useState("");
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [dbSearch, setDbSearch] = useState("");
  const [dbLoading, setDbLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [activeFlags, setActiveFlags] = useState<Set<string>>(new Set());
  const [gzip, setGzip] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobOutput, setJobOutput] = useState("");
  const [jobStatus, setJobStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [serverVersion, setServerVersion] = useState<string>("");

  useEffect(() => {
    if (!selectedConn) return;
    const flagList = selectedConn.type === "postgresql" ? PG_FLAGS : selectedConn.type === "mysql" ? MYSQL_FLAGS : [];
    setActiveFlags(new Set(flagList.filter(f => f.defaultOn).map(f => f.flag)));
    setGzip(false);
  }, [selectedConn?.type]);

  useEffect(() => {
    if (!selectedConn) { setDatabases([]); setSelectedDb(null); return; }
    setDbLoading(true); setDbError(null); setSelectedDb(null);
    const load = async () => {
      try {
        const password = await getPassword(selectedConn.id).catch(() => "");
        const sshPassword = selectedConn.ssh?.authMethod === "password"
          ? await getSshPassword(selectedConn.id).catch(() => "") : undefined;
        const dbs = await listDatabases(buildConfig(selectedConn, password, sshPassword));
        setDatabases(dbs);
      } catch (e) {
        setDbError(String(e));
      } finally {
        setDbLoading(false);
      }
    };
    load();
  }, [selectedConn?.id]);

  useEffect(() => {
    if (!selectedConn || selectedConn.type === "sqlite") { setServerVersion(""); return; }
    const load = async () => {
      try {
        const password = await getPassword(selectedConn.id).catch(() => "");
        const sshPassword = selectedConn.ssh?.authMethod === "password"
          ? await getSshPassword(selectedConn.id).catch(() => "") : undefined;
        const v = await getServerVersion(buildConfig(selectedConn, password, sshPassword));
        setServerVersion(v);
      } catch {
        setServerVersion("");
      }
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

  const flagList = selectedConn?.type === "postgresql" ? PG_FLAGS
    : selectedConn?.type === "mysql" ? MYSQL_FLAGS : [];

  const availableFlags = flagList.filter(f => !activeFlags.has(f.flag));

  function addFlag(flag: string) {
    setActiveFlags(prev => new Set([...prev, flag]));
  }

  function removeFlag(flag: string) {
    setActiveFlags(prev => { const next = new Set(prev); next.delete(flag); return next; });
  }

  function filename(): string {
    if (!selectedConn || !selectedDb) return "untitled";
    const date = new Date().toISOString().slice(0, 10);
    const connSlug = selectedConn.name.replace(/[^a-zA-Z0-9]/g, "-");
    const ext = selectedConn.type === "postgresql" ? ".dump" : selectedConn.type === "mysql" ? ".sql" : ".db";
    return `${selectedDb}_${connSlug}_${date}${ext}${gzip ? ".gz" : ""}`;
  }

  async function proceedWithBackup() {
    if (!selectedConn || !selectedDb) return;
    setError(null);
    try {
      const outputPath = await openSaveDialog({
        defaultPath: filename(),
        filters: selectedConn.type === "postgresql"
          ? [{ name: "Dump", extensions: ["dump", "sql", "tar", "dump.gz", "sql.gz"] }]
          : selectedConn.type === "mysql"
          ? [{ name: "SQL", extensions: ["sql", "sql.gz"] }]
          : [{ name: "SQLite", extensions: ["db", "sqlite"] }],
      });
      if (!outputPath || typeof outputPath !== "string") return;

      const id = crypto.randomUUID();
      const password = await getPassword(selectedConn.id).catch(() => "");
      const sshPassword = selectedConn.ssh?.authMethod === "password"
        ? await getSshPassword(selectedConn.id).catch(() => "") : undefined;

      const flags = Array.from(activeFlags);
      if (gzip) flags.push("--gzip");
      if (serverVersion) flags.push(`--server-version=${serverVersion}`);

      setJobId(id); setJobStatus("running"); setJobOutput(`Backup database '${selectedDb}'\nDumping...\n`);
      await startBackup(buildConfig(selectedConn, password, sshPassword), selectedDb, outputPath, flags, id);
    } catch (e) {
      setError(String(e));
      setJobStatus("idle");
    }
  }

  async function handleStartBackup() {
    if (!selectedConn || !selectedDb) return;
    setError(null);
    if (gzip && activeFlags.has("--format=custom")) {
      await message("You should use option --format=custom instead of Gzip", { title: "Warning", kind: "warning" });
      return;
    }
    await proceedWithBackup();
  }

  function handleDone() {
    if (jobId) removeJob(jobId).catch(() => {});
    onClose();
  }

  function handleCloseModal() {
    if (jobId) removeJob(jobId).catch(() => {});
    setJobId(null);
    setJobStatus("idle");
    setJobOutput("");
  }

  const filteredConns = connections.filter(c => c.name.toLowerCase().includes(connSearch.toLowerCase()));
  const filteredDbs = databases.filter(d => d.toLowerCase().includes(dbSearch.toLowerCase()));
  const showGzip = selectedConn?.type === "postgresql" || selectedConn?.type === "mysql";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <span className="text-sm font-semibold">Backup database</span>
        <button onClick={handleDone} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-6 py-2 border-b shrink-0 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">File name: </span>
        <span className="font-mono">{filename()}</span>
      </div>

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

        {/* Col 3: Options */}
        <div className="flex-1 flex flex-col">
          {/* Version selector — pg/mysql only */}
          {selectedConn && selectedConn.type !== "sqlite" && (
            <div className="px-4 pt-4 pb-2 border-b flex items-center gap-2">
              <select
                value={serverVersion}
                onChange={e => setServerVersion(e.target.value)}
                className="flex-1 text-xs bg-muted border border-border rounded px-2 py-1 outline-none"
              >
                {!serverVersion && <option value="">Detecting...</option>}
                {serverVersion && <option value={serverVersion}>{selectedConn.type === "postgresql" ? "PostgreSQL" : "MySQL"} {serverVersion}</option>}
                {selectedConn.type === "postgresql"
                  ? ["18.0","17.0","16.0","15.0","14.0","13.0","12.0","11.0","10.0","9.6","9.5","9.4"].filter(v => v !== serverVersion).map(v => (
                      <option key={v} value={v}>PostgreSQL {v}</option>
                    ))
                  : ["8.0","5.7","5.6"].filter(v => v !== serverVersion).map(v => (
                      <option key={v} value={v}>MySQL {v}</option>
                    ))
                }
              </select>
            </div>
          )}

          {/* Active flags as chips */}
          <div className="overflow-y-auto flex-1 p-4 space-y-1">
            {Array.from(activeFlags).map(flag => (
              <button
                key={flag}
                onClick={() => removeFlag(flag)}
                className="w-full text-left px-3 py-1.5 text-xs rounded font-mono transition-colors bg-blue-500/20 text-blue-400 border border-blue-500/40 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/40 group"
              >
                <span>{flag}</span>
                <span className="float-right text-muted-foreground group-hover:text-red-400">×</span>
              </button>
            ))}

            {availableFlags.length > 0 && (
              <div className="pt-1">
                <select
                  value=""
                  onChange={e => { if (e.target.value) addFlag(e.target.value); }}
                  className="w-full text-xs bg-muted border border-border rounded px-2 py-1.5 outline-none text-muted-foreground font-mono"
                >
                  <option value="">Add option...</option>
                  {availableFlags.map(f => (
                    <option key={f.flag} value={f.flag}>{f.flag}</option>
                  ))}
                </select>
              </div>
            )}

            {showGzip && (
              <label className="flex items-center gap-2 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={gzip}
                  onChange={e => setGzip(e.target.checked)}
                  className="rounded border-border accent-blue-500"
                />
                <span className="text-xs text-muted-foreground font-mono">Compress file using Gzip</span>
              </label>
            )}
          </div>

          {error && (
            <div className="px-4 py-2 text-xs text-destructive border-t">{error}</div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 px-6 py-3 border-t shrink-0">
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
      </div>


      {/* Output modal */}
      {jobStatus !== "idle" && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="w-125 bg-background border rounded-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <span className="text-sm font-semibold">Backup database</span>
              {(jobStatus === "done" || jobStatus === "error") && (
                <button onClick={handleCloseModal} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="bg-black p-4 font-mono text-xs text-green-400 whitespace-pre-wrap min-h-30 max-h-75 overflow-y-auto">
              {jobOutput || "Starting..."}
            </div>
            <div className="flex justify-end px-4 py-3 border-t">
              {jobStatus === "running" && (
                <span className="text-xs text-muted-foreground animate-pulse">Running...</span>
              )}
              {(jobStatus === "done" || jobStatus === "error") && (
                <button onClick={handleCloseModal} className="px-4 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors">
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
