import { useState } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useConnectionStore } from "../store/connections";
import { savePassword } from "../lib/tauri-commands";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ImportedConn {
  id: string;
  name: string;
  db_type: "postgresql" | "mysql" | "sqlite";
  host: string;
  port: number;
  database: string;
  username: string;
  color: string;
  group_id?: string | null;
  password?: string | null;
  password_mode?: string | null;
  ssl_mode?: string | null;
}

interface ImportedGroup {
  id: string;
  name: string;
  color: string;
}

interface ImportPayload {
  version: number;
  connections: ImportedConn[];
  groups: ImportedGroup[];
}

export function ImportUrlDialog({ open: isOpen, onClose }: Props) {
  const { addConnection, addGroup, groups } = useConnectionStore();
  const [url, setUrl] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleImport() {
    if (!url || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();

      // Write to a temp file via Tauri then call importConnections
      // Instead: decode in JS using same AES-256-GCM logic via SubtleCrypto
      // The export format: [4 salt][12 nonce][ciphertext] all raw bytes
      const buf = new Uint8Array(arrayBuffer);
      const salt = buf.slice(0, 4);
      const nonce = buf.slice(4, 16);
      const ciphertext = buf.slice(16);

      // Derive key: SHA-256(password + salt) × 10000 rounds
      const enc = new TextEncoder();
      let keyBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([...enc.encode(password), ...salt])));
      for (let i = 0; i < 9999; i++) {
        keyBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array([...keyBytes, ...salt])));
      }

      const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, cryptoKey, ciphertext);
      const raw: ImportPayload = JSON.parse(new TextDecoder().decode(plain));

      const existingGroupIds = new Set(groups.map((g) => g.id));
      for (const g of raw.groups ?? []) {
        if (!existingGroupIds.has(g.id)) {
          addGroup({ id: g.id, name: g.name, color: g.color, collapsed: false });
        }
      }

      for (const c of raw.connections ?? []) {
        const newId = crypto.randomUUID();
        addConnection({
          id: newId,
          name: c.name,
          type: c.db_type,
          host: c.host,
          port: c.port,
          database: c.database,
          username: c.username,
          color: c.color,
          groupId: c.group_id ?? undefined,
          passwordMode: (c.password_mode as any) ?? "keychain",
          sslMode: (c.ssl_mode as any) ?? "preferred",
        });
        if (c.password) {
          await savePassword(newId, c.password).catch(() => {});
        }
      }

      handleClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setUrl("");
    setPassword("");
    setError(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />
      <div className="relative bg-background border rounded-xl shadow-2xl w-96 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-medium">Import from URL</span>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/export.tlexport"
              className="h-8 text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Password</Label>
            <div className="relative">
              <Input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password used during export"
                className="h-8 text-sm pr-8"
                onKeyDown={(e) => e.key === "Enter" && handleImport()}
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPwd ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-between px-4 py-3 border-t">
          <button onClick={handleClose} disabled={loading} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !url || !password}
            className="px-4 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50"
          >
            {loading ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
