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
  const addConnection = useConnectionStore((s) => s.addConnection);

  function handleTypeSelect(type: DbType) {
    setDbType(type);
    setForm((f) => ({
      ...f,
      port: type === "postgresql" ? "5432" : type === "mysql" ? "3306" : "",
    }));
    setStep("configure");
  }

  function handleSave() {
    addConnection({
      id: crypto.randomUUID(),
      name: form.name.trim() || `${dbType} connection`,
      type: dbType,
      host: form.host,
      port: parseInt(form.port) || 0,
      database: form.database,
      username: form.username,
      color: form.color,
    });
    handleClose();
  }

  function handleClose() {
    onClose();
    setTimeout(() => {
      setStep("pick-type");
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
                    onChange={(e) =>
                      setForm({ ...form, database: e.target.value })
                    }
                    placeholder="/path/to/database.sqlite"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep("pick-type")}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>Save</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
