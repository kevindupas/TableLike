import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Connection, useConnectionStore } from "../store/connections";
import { connectDb, getPassword, savePassword } from "../lib/tauri-commands";

const DB_ABBR: Record<string, string> = { postgresql: "Pg", mysql: "My", sqlite: "Sl" };
const DB_COLORS: Record<string, string> = { postgresql: "#336791", mysql: "#e48e00", sqlite: "#7b9cdb" };

const STATUS_COLORS = [
  "#6b7280", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#3b82f6",
];

interface Props {
  conn: Connection | null;
  onClose: () => void;
}

export function EditConnectionDialog({ conn, onClose }: Props) {
  const { updateConnection, setConnected } = useConnectionStore();
  const [form, setForm] = useState({
    name: "",
    host: "",
    port: "",
    database: "",
    username: "",
    password: "",
    color: STATUS_COLORS[0],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conn) return;
    getPassword(conn.id).catch(() => "").then((pwd) => {
      setForm({
        name: conn.name,
        host: conn.host,
        port: String(conn.port),
        database: conn.database,
        username: conn.username,
        password: pwd,
        color: conn.color,
      });
    });
    setError(null);
  }, [conn]);

  if (!conn) return null;

  async function handleSave() {
    if (!conn) return;
    setLoading(true);
    setError(null);
    try {
      await connectDb({
        id: conn.id,
        name: form.name.trim() || conn.name,
        db_type: conn.type,
        host: form.host,
        port: parseInt(form.port) || 0,
        database: form.database,
        username: form.username,
        password: form.password,
        color: form.color,
      });
      if (form.password) await savePassword(conn.id, form.password);
      updateConnection(conn.id, {
        name: form.name.trim() || conn.name,
        host: form.host,
        port: parseInt(form.port) || 0,
        database: form.database,
        username: form.username,
        color: form.color,
      });
      setConnected(conn.id, true);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const abbr = DB_ABBR[conn.type] ?? conn.type;
  const color = DB_COLORS[conn.type] ?? "#888";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background border rounded-xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
              style={{ backgroundColor: color }}
            >
              {abbr}
            </div>
            <span className="text-sm font-medium">Edit {conn.name}</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={loading} className="h-8 text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Color tag</Label>
            <div className="flex gap-2">
              {STATUS_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  disabled={loading}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {conn.type !== "sqlite" ? (
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
              <Input value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} disabled={loading} className="h-8 text-sm" />
            </div>
          )}

          {error && (
            <div className="rounded bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-between px-4 py-3 border-t">
          <button onClick={onClose} disabled={loading} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
