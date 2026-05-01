import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { DbType, useConnectionStore } from "../store/connections";
import { connectDb, savePassword } from "../lib/tauri-commands";

interface DbOption {
  type: DbType;
  label: string;
  color: string;
  abbr: string;
  available: boolean;
}

const DB_OPTIONS: DbOption[] = [
  { type: "postgresql", label: "PostgreSQL",        color: "#336791", abbr: "Pg", available: true  },
  { type: "postgresql", label: "Amazon Redshift",   color: "#cc2264", abbr: "Rs", available: false },
  { type: "mysql",      label: "MySQL",             color: "#e48e00", abbr: "Ms", available: true  },
  { type: "mysql",      label: "MariaDB & SingleStore", color: "#c0765a", abbr: "Mr", available: false },
  { type: "postgresql", label: "Microsoft SQL Server", color: "#b91c1c", abbr: "Ss", available: false },
  { type: "postgresql", label: "Cassandra",         color: "#1287b1", abbr: "Cs", available: false },
  { type: "postgresql", label: "ClickHouse",        color: "#f5c518", abbr: "Ch", available: false },
  { type: "postgresql", label: "BigQuery",          color: "#4285f4", abbr: "Bq", available: false },
  { type: "postgresql", label: "DynamoDB (Beta)",   color: "#4053d3", abbr: "Dn", available: false },
  { type: "postgresql", label: "LibSQL",            color: "#22c55e", abbr: "Ls", available: false },
  { type: "postgresql", label: "Cloudflare D1",     color: "#f97316", abbr: "D1", available: false },
  { type: "postgresql", label: "Mongo",             color: "#47a248", abbr: "Mg", available: false },
  { type: "postgresql", label: "Snowflake",         color: "#29b5e8", abbr: "Nf", available: false },
  { type: "postgresql", label: "Redis",             color: "#dc382d", abbr: "Re", available: false },
  { type: "sqlite",     label: "SQLite",            color: "#7b9cdb", abbr: "Sl", available: true  },
  { type: "postgresql", label: "DuckDB",            color: "#f0a500", abbr: "Du", available: false },
  { type: "postgresql", label: "Oracle",            color: "#c74634", abbr: "Oc", available: false },
  { type: "postgresql", label: "Cockroach",         color: "#6933ff", abbr: "Cr", available: false },
  { type: "postgresql", label: "Greenplum",         color: "#00a36c", abbr: "Gp", available: false },
  { type: "postgresql", label: "Vertica",           color: "#1a1a2e", abbr: "Ve", available: false },
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
  const [selectedOption, setSelectedOption] = useState<DbOption | null>(null);
  const [dbTypeSearch, setDbTypeSearch] = useState("");
  const [form, setForm] = useState({
    name: "",
    host: "127.0.0.1",
    port: "5432",
    database: "",
    username: "",
    password: "",
    color: STATUS_COLORS[0],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addConnection = useConnectionStore((s) => s.addConnection);
  const setConnected = useConnectionStore((s) => s.setConnected);
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection);

  const filteredOptions = DB_OPTIONS.filter((db) =>
    db.label.toLowerCase().includes(dbTypeSearch.toLowerCase())
  );

  function handleTypeSelect(option: DbOption) {
    if (!option.available) return;
    setSelectedOption(option);
    setForm((f) => ({
      ...f,
      port: option.type === "postgresql" ? "5432" : option.type === "mysql" ? "3306" : "",
    }));
    setStep("configure");
  }

  async function handleSave() {
    if (!selectedOption) return;
    setLoading(true);
    setError(null);
    const id = crypto.randomUUID();
    try {
      await connectDb({
        id,
        name: form.name.trim() || `${selectedOption.label} connection`,
        db_type: selectedOption.type,
        host: form.host,
        port: parseInt(form.port) || 0,
        database: form.database,
        username: form.username,
        password: form.password,
        color: form.color,
      });
      if (form.password) await savePassword(id, form.password);
      addConnection({
        id,
        name: form.name.trim() || `${selectedOption.label} connection`,
        type: selectedOption.type,
        host: form.host,
        port: parseInt(form.port) || 0,
        database: form.database,
        username: form.username,
        color: form.color,
      });
      setConnected(id, true);
      setActiveConnection(id);
      handleClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (loading) return;
    onClose();
    setTimeout(() => {
      setStep("pick-type");
      setSelectedOption(null);
      setDbTypeSearch("");
      setError(null);
      setForm({ name: "", host: "127.0.0.1", port: "5432", database: "", username: "", password: "", color: STATUS_COLORS[0] });
    }, 200);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-background border rounded-xl shadow-2xl w-135 max-h-[90vh] flex flex-col overflow-hidden">
        {step === "pick-type" ? (
          <>
            {/* Header search */}
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                autoFocus
                placeholder="Search..."
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                value={dbTypeSearch}
                onChange={(e) => setDbTypeSearch(e.target.value)}
              />
            </div>

            {/* Grid */}
            <div className="overflow-y-auto p-4">
              <div className="grid grid-cols-6 gap-3">
                {filteredOptions.map((db, i) => (
                  <button
                    key={i}
                    onClick={() => handleTypeSelect(db)}
                    disabled={!db.available}
                    className={`flex flex-col items-center gap-1.5 p-2 rounded-lg transition-colors ${
                      db.available
                        ? "hover:bg-accent cursor-pointer"
                        : "opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                      style={{ backgroundColor: db.color }}
                    >
                      {db.abbr}
                    </div>
                    <span className="text-[10px] text-center leading-tight text-muted-foreground line-clamp-2">
                      {db.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <button
                onClick={handleClose}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Import from URL
                </button>
                <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  New Group
                </button>
                <button
                  disabled
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded opacity-40 cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Configure header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: selectedOption?.color }}
                >
                  {selectedOption?.abbr}
                </div>
                <span className="text-sm font-medium">{selectedOption?.label} Connection</span>
              </div>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Form */}
            <div className="overflow-y-auto px-4 py-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={`My ${selectedOption?.label}`}
                  disabled={loading}
                  className="h-8 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Color tag</Label>
                <div className="flex gap-2">
                  {STATUS_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      disabled={loading}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${
                        form.color === c ? "border-foreground scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {selectedOption?.type !== "sqlite" ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs">Host</Label>
                      <Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} disabled={loading} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Port</Label>
                      <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} disabled={loading} className="h-8 text-sm" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">User</Label>
                    <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={loading} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Password</Label>
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} disabled={loading} className="h-8 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Database</Label>
                    <Input value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} disabled={loading} className="h-8 text-sm" />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">File path</Label>
                  <Input value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} placeholder="/path/to/database.sqlite" disabled={loading} className="h-8 text-sm" />
                </div>
              )}

              {error && (
                <div className="rounded bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-between px-4 py-3 border-t">
              <button
                onClick={() => setStep("pick-type")}
                disabled={loading}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Back
              </button>
              <div className="flex gap-2">
                <button onClick={handleClose} disabled={loading} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="px-4 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50"
                >
                  {loading ? "Connecting..." : "Connect"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
