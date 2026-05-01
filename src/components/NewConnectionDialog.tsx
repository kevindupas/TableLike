import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { DbType, useConnectionStore } from "../store/connections";
import { connectDb, savePassword } from "../lib/tauri-commands";

const DB_OPTIONS: { type: DbType; label: string; color: string }[] = [
  { type: "postgresql", label: "PostgreSQL", color: "#336791" },
  { type: "mysql", label: "MySQL", color: "#e48e00" },
  { type: "sqlite", label: "SQLite", color: "#7b9cdb" },
];

const STATUS_COLORS = [
  "#6b7280",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#3b82f6",
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addConnection = useConnectionStore((s) => s.addConnection);
  const setConnected = useConnectionStore((s) => s.setConnected);
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection);

  function handleTypeSelect(type: DbType) {
    setDbType(type);
    setForm((f) => ({
      ...f,
      port: type === "postgresql" ? "5432" : type === "mysql" ? "3306" : "",
    }));
    setStep("configure");
  }

  async function handleSave() {
    setLoading(true);
    setError(null);

    const id = crypto.randomUUID();

    try {
      await connectDb({
        id,
        name: form.name.trim() || `${dbType} connection`,
        db_type: dbType,
        host: form.host,
        port: parseInt(form.port) || 0,
        database: form.database,
        username: form.username,
        password: form.password,
        color: form.color,
      });

      if (form.password) await savePassword(id, form.password);

      // Only add to store after successful connection
      addConnection({
        id,
        name: form.name.trim() || `${dbType} connection`,
        type: dbType,
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
      setError(null);
      setForm({
        name: "",
        host: "127.0.0.1",
        port: "5432",
        database: "",
        username: "",
        password: "",
        color: STATUS_COLORS[0],
      });
    }, 200);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
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
              <DialogTitle>
                {DB_OPTIONS.find((d) => d.type === dbType)?.label} Connection
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="conn-name">Name</Label>
                <Input
                  id="conn-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="My Database"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label>Status color</Label>
                <div className="flex gap-2">
                  {STATUS_COLORS.map((c) => (
                    <button
                      key={c}
                      aria-label={`Select color ${c}`}
                      onClick={() => setForm({ ...form, color: c })}
                      disabled={loading}
                      className={`w-8 h-8 rounded border-2 transition-all ${
                        form.color === c
                          ? "border-foreground scale-110"
                          : "border-transparent"
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
                      <Label htmlFor="conn-host">Host</Label>
                      <Input
                        id="conn-host"
                        value={form.host}
                        disabled={loading}
                        onChange={(e) =>
                          setForm({ ...form, host: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="conn-port">Port</Label>
                      <Input
                        id="conn-port"
                        value={form.port}
                        disabled={loading}
                        onChange={(e) =>
                          setForm({ ...form, port: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="conn-user">User</Label>
                    <Input
                      id="conn-user"
                      value={form.username}
                      disabled={loading}
                      onChange={(e) =>
                        setForm({ ...form, username: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="conn-password">Password</Label>
                    <Input
                      id="conn-password"
                      type="password"
                      value={form.password}
                      disabled={loading}
                      onChange={(e) =>
                        setForm({ ...form, password: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="conn-database">Database</Label>
                    <Input
                      id="conn-database"
                      value={form.database}
                      disabled={loading}
                      onChange={(e) =>
                        setForm({ ...form, database: e.target.value })
                      }
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="conn-file">File path</Label>
                  <Input
                    id="conn-file"
                    value={form.database}
                    disabled={loading}
                    onChange={(e) =>
                      setForm({ ...form, database: e.target.value })
                    }
                    placeholder="/path/to/database.sqlite"
                  />
                </div>
              )}

              {error && (
                <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button
                variant="outline"
                onClick={() => setStep("pick-type")}
                disabled={loading}
              >
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                  {loading ? "Connecting..." : "Save"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
