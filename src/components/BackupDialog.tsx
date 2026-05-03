import { useState, useEffect, useRef } from "react";
import { X, Search } from "lucide-react";
import { Connection, useConnectionStore } from "../store/connections";
import { listDatabases, startBackup, getJobStatus, removeJob, getPassword, getSshPassword } from "../lib/tauri-commands";
import { save as openSaveDialog } from "@tauri-apps/plugin-dialog";

type PgFormat = "custom" | "plain" | "tar";

interface PgOptions {
  format: PgFormat;
  dataOnly: boolean;
  schemaOnly: boolean;
  clean: boolean;
  noOwner: boolean;
  noPrivileges: boolean;
  gzip: boolean;
}

interface MysqlOptions {
  singleTransaction: boolean;
  routines: boolean;
  noData: boolean;
  addDropTable: boolean;
  noTablespaces: boolean;
  gzip: boolean;
}

function pgOptionsToFlags(opts: PgOptions): string[] {
  const flags: string[] = [`--format=${opts.format}`];
  if (opts.dataOnly) flags.push("--data-only");
  if (opts.schemaOnly) flags.push("--schema-only");
  if (opts.clean) flags.push("--clean");
  if (opts.noOwner) flags.push("--no-owner");
  if (opts.noPrivileges) flags.push("--no-privileges");
  // gzip only makes sense for plain/tar (custom is already compressed internally)
  if (opts.gzip && opts.format !== "custom") flags.push("--compress=9");
  return flags;
}

function mysqlOptionsToFlags(opts: MysqlOptions): string[] {
  const flags: string[] = [];
  if (opts.singleTransaction) flags.push("--single-transaction");
  if (opts.routines) flags.push("--routines");
  if (opts.noData) flags.push("--no-data");
  if (opts.addDropTable) flags.push("--add-drop-table");
  if (opts.noTablespaces) flags.push("--no-tablespaces");
  // gzip flag passed separately — backend handles piping
  return flags;
}

const DEFAULT_PG: PgOptions = {
  format: "custom",
  dataOnly: false,
  schemaOnly: false,
  clean: false,
  noOwner: false,
  noPrivileges: false,
  gzip: false,
};

const DEFAULT_MYSQL: MysqlOptions = {
  singleTransaction: true,
  routines: false,
  noData: false,
  addDropTable: false,
  noTablespaces: false,
  gzip: false,
};

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

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? "bg-blue-500 border-blue-500" : "border-border group-hover:border-blue-400"}`}
      >
        {checked && <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
      <span className="text-xs text-foreground">{label}</span>
    </label>
  );
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
  const [pgOpts, setPgOpts] = useState<PgOptions>(DEFAULT_PG);
  const [mysqlOpts, setMysqlOpts] = useState<MysqlOptions>(DEFAULT_MYSQL);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobOutput, setJobOutput] = useState("");
  const [jobStatus, setJobStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPgOpts(DEFAULT_PG);
    setMysqlOpts(DEFAULT_MYSQL);
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

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [jobOutput]);

  function filename(): string {
    if (!selectedConn || !selectedDb) return "untitled";
    const date = new Date().toISOString().slice(0, 10);
    const connSlug = selectedConn.name.replace(/[^a-zA-Z0-9]/g, "-");
    if (selectedConn.type === "postgresql") {
      const gzip = pgOpts.gzip && pgOpts.format !== "custom";
      const ext = pgOpts.format === "custom" ? ".dump" : pgOpts.format === "tar" ? ".tar" : ".sql";
      return `${selectedDb}_${connSlug}_${date}${ext}${gzip ? ".gz" : ""}`;
    }
    if (selectedConn.type === "mysql") {
      return `${selectedDb}_${connSlug}_${date}.sql${mysqlOpts.gzip ? ".gz" : ""}`;
    }
    return `${selectedDb}_${connSlug}_${date}.db`;
  }

  async function handleStartBackup() {
    if (!selectedConn || !selectedDb) return;
    setError(null);
    try {
      const ext = selectedConn.type === "postgresql"
        ? (pgOpts.format === "custom" ? ["dump"] : pgOpts.format === "tar" ? ["tar", "tar.gz"] : ["sql", "sql.gz"])
        : selectedConn.type === "mysql" ? ["sql", "sql.gz"] : ["db", "sqlite"];

      const outputPath = await openSaveDialog({
        defaultPath: filename(),
        filters: [{ name: "Backup", extensions: ext }],
      });
      if (!outputPath || typeof outputPath !== "string") return;

      const id = crypto.randomUUID();
      const password = await getPassword(selectedConn.id).catch(() => "");
      const sshPassword = selectedConn.ssh?.authMethod === "password"
        ? await getSshPassword(selectedConn.id).catch(() => "") : undefined;

      const flags = selectedConn.type === "postgresql"
        ? pgOptionsToFlags(pgOpts)
        : selectedConn.type === "mysql"
        ? mysqlOptionsToFlags(mysqlOpts)
        : [];

      // Pass gzip as a special flag the backend can detect
      if (selectedConn.type === "mysql" && mysqlOpts.gzip) flags.push("--gzip");

      setJobId(id); setJobStatus("running"); setJobOutput("");

      await startBackup(buildConfig(selectedConn, password, sshPassword), selectedDb, outputPath, flags, id);
    } catch (e) {
      setError(String(e));
      setJobStatus("idle");
    }
  }

  function handleDone() {
    if (jobId) removeJob(jobId).catch(() => {});
    onClose();
  }

  const filteredConns = connections.filter(c => c.name.toLowerCase().includes(connSearch.toLowerCase()));
  const filteredDbs = databases.filter(d => d.toLowerCase().includes(dbSearch.toLowerCase()));

  const isPg = selectedConn?.type === "postgresql";
  const isMysql = selectedConn?.type === "mysql";
  const isSqlite = selectedConn?.type === "sqlite";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <span className="text-sm font-semibold">Backup database</span>
        <button onClick={handleDone} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-6 py-2 border-b shrink-0 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">File: </span>
        <span className="font-mono">{filename()}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Col 1: Connections */}
        <div className="w-64 border-r flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              value={connSearch} onChange={e => setConnSearch(e.target.value)}
              placeholder="Search connection..."
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
        <div className="w-56 border-r flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              value={dbSearch} onChange={e => setDbSearch(e.target.value)}
              placeholder="Search database..."
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
            <div className="overflow-y-auto flex-1 p-5 space-y-5">
              {isSqlite && (
                <p className="text-xs text-muted-foreground">SQLite backup is a direct file copy. No options needed.</p>
              )}

              {isPg && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Format</label>
                    <select
                      value={pgOpts.format}
                      onChange={e => setPgOpts(o => ({ ...o, format: e.target.value as PgFormat }))}
                      className="w-full text-xs bg-muted border border-border rounded px-2 py-1.5 outline-none focus:border-blue-500"
                    >
                      <option value="custom">Custom — compressed binary (recommended)</option>
                      <option value="plain">Plain — SQL text file</option>
                      <option value="tar">Tar — archive format</option>
                    </select>
                  </div>

                  <div className="space-y-2.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Options</label>
                    <Checkbox label="Data only (no schema)" checked={pgOpts.dataOnly} onChange={v => setPgOpts(o => ({ ...o, dataOnly: v, schemaOnly: v ? false : o.schemaOnly }))} />
                    <Checkbox label="Schema only (no data)" checked={pgOpts.schemaOnly} onChange={v => setPgOpts(o => ({ ...o, schemaOnly: v, dataOnly: v ? false : o.dataOnly }))} />
                    <Checkbox label="Clean (drop before create)" checked={pgOpts.clean} onChange={v => setPgOpts(o => ({ ...o, clean: v }))} />
                    <Checkbox label="No owner" checked={pgOpts.noOwner} onChange={v => setPgOpts(o => ({ ...o, noOwner: v }))} />
                    <Checkbox label="No privileges" checked={pgOpts.noPrivileges} onChange={v => setPgOpts(o => ({ ...o, noPrivileges: v }))} />
                  </div>

                  {pgOpts.format !== "custom" && (
                    <div className="space-y-2.5">
                      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Compression</label>
                      <Checkbox label="Compress file using Gzip" checked={pgOpts.gzip} onChange={v => setPgOpts(o => ({ ...o, gzip: v }))} />
                    </div>
                  )}
                  {pgOpts.format === "custom" && (
                    <p className="text-xs text-muted-foreground">Custom format is already compressed internally.</p>
                  )}
                </>
              )}

              {isMysql && (
                <>
                  <div className="space-y-2.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Options</label>
                    <Checkbox label="Single transaction (safe for InnoDB)" checked={mysqlOpts.singleTransaction} onChange={v => setMysqlOpts(o => ({ ...o, singleTransaction: v }))} />
                    <Checkbox label="Include stored routines" checked={mysqlOpts.routines} onChange={v => setMysqlOpts(o => ({ ...o, routines: v }))} />
                    <Checkbox label="Schema only (no data)" checked={mysqlOpts.noData} onChange={v => setMysqlOpts(o => ({ ...o, noData: v }))} />
                    <Checkbox label="Add DROP TABLE statements" checked={mysqlOpts.addDropTable} onChange={v => setMysqlOpts(o => ({ ...o, addDropTable: v }))} />
                    <Checkbox label="No tablespaces" checked={mysqlOpts.noTablespaces} onChange={v => setMysqlOpts(o => ({ ...o, noTablespaces: v }))} />
                  </div>
                  <div className="space-y-2.5">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Compression</label>
                    <Checkbox label="Compress file using Gzip" checked={mysqlOpts.gzip} onChange={v => setMysqlOpts(o => ({ ...o, gzip: v }))} />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div ref={outputRef} className="flex-1 bg-black p-4 font-mono text-xs text-green-400 overflow-y-auto whitespace-pre-wrap">
              {jobOutput || "Starting..."}
            </div>
          )}
          {error && (
            <div className="px-4 py-2 text-xs text-destructive border-t">{error}</div>
          )}
        </div>
      </div>

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
