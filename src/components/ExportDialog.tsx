import { useState } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { save } from "@tauri-apps/plugin-dialog";
import { Connection, ConnectionGroup, useConnectionStore } from "../store/connections";
import { exportConnections, getPassword } from "../lib/tauri-commands";

type Scope = "all" | "group" | "single";

interface Props {
  open: boolean;
  scope: Scope;
  groupId?: string;
  connId?: string;
  onClose: () => void;
}

export function ExportDialog({ open, scope, groupId, connId, onClose }: Props) {
  const { connections, groups } = useConnectionStore();
  const [includePasswords, setIncludePasswords] = useState(true);
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function getTargetConnections(): Connection[] {
    if (scope === "all") return connections;
    if (scope === "group") return connections.filter((c) => c.groupId === groupId);
    if (scope === "single") return connections.filter((c) => c.id === connId);
    return [];
  }

  function getTargetGroups(): ConnectionGroup[] {
    if (scope === "all") return groups;
    if (scope === "group") return groups.filter((g) => g.id === groupId);
    return [];
  }

  async function handleExport() {
    if (!password) return;
    setLoading(true);
    setError(null);
    try {
      const path = await save({
        defaultPath: "connections.tlexport",
        filters: [{ name: "TableLike Export", extensions: ["tlexport"] }],
      });
      if (!path) { setLoading(false); return; }

      const targetConns = getTargetConnections();
      const connPayloads = await Promise.all(
        targetConns.map(async (c) => ({
          id: c.id,
          name: c.name,
          db_type: c.type,
          host: c.host,
          port: c.port,
          database: c.database,
          username: c.username,
          color: c.color,
          group_id: c.groupId ?? null,
          password: includePasswords
            ? await getPassword(c.id).catch(() => null)
            : null,
        }))
      );

      const payload = {
        version: 1,
        connections: connPayloads,
        groups: getTargetGroups().map((g) => ({
          id: g.id,
          name: g.name,
          color: g.color,
        })),
      };

      await exportConnections(payload, password, path);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const scopeLabel =
    scope === "all" ? "all connections" :
    scope === "group" ? "this group" :
    "this connection";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background border rounded-xl shadow-2xl w-96 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-medium">Export {scopeLabel}</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includePasswords}
              onChange={(e) => setIncludePasswords(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm">Include databases password</span>
          </label>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Enter the password used to secure the file</Label>
            <div className="relative">
              <Input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="h-8 text-sm pr-8"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              SSH/SSL private keys will not be included in the export file
            </p>
          </div>

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
            onClick={handleExport}
            disabled={loading || !password}
            className="px-4 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50"
          >
            {loading ? "Exporting..." : "Save..."}
          </button>
        </div>
      </div>
    </div>
  );
}
