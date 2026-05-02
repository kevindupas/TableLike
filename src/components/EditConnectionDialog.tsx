import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Connection, useConnectionStore } from "../store/connections";
import { connectDb, getPassword, savePassword, getSshPassword, saveSshPassword } from "../lib/tauri-commands";

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
  const [sshEnabled, setSshEnabled] = useState(false);
  const [form, setForm] = useState({
    name: "",
    host: "",
    port: "",
    database: "",
    username: "",
    password: "",
    color: STATUS_COLORS[0],
    // SSH fields
    sshHost: "",
    sshPort: "22",
    sshUser: "",
    sshPassword: "",
    sshKeyPath: "",
    sshUseKeyAuth: false,
    sshUseLegacyHostKey: false,
    sshUseLegacyKex: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conn) return;
    const loadData = async () => {
      const pwd = await getPassword(conn.id).catch(() => "");
      setForm({
        name: conn.name,
        host: conn.host,
        port: String(conn.port),
        database: conn.database,
        username: conn.username,
        password: pwd,
        color: conn.color,
        // SSH defaults (will be overridden below if conn.ssh exists)
        sshHost: "",
        sshPort: "22",
        sshUser: "",
        sshPassword: "",
        sshKeyPath: "",
        sshUseKeyAuth: false,
        sshUseLegacyHostKey: false,
        sshUseLegacyKex: false,
      });
      setSshEnabled(!!conn.ssh);
      if (conn.ssh) {
        const sshPwd = conn.ssh.authMethod === "password"
          ? await getSshPassword(conn.id).catch(() => "")
          : "";
        setForm(f => ({
          ...f,
          sshHost: conn.ssh!.host,
          sshPort: String(conn.ssh!.port),
          sshUser: conn.ssh!.username,
          sshUseKeyAuth: conn.ssh!.authMethod === "key",
          sshKeyPath: conn.ssh!.privateKeyPath ?? "",
          sshUseLegacyHostKey: conn.ssh!.addLegacyHostKeyAlgos,
          sshUseLegacyKex: conn.ssh!.addLegacyKexAlgos,
          sshPassword: sshPwd,
        }));
      }
    };
    loadData();
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
        ...(sshEnabled && {
          ssh_host: form.sshHost,
          ssh_port: parseInt(form.sshPort) || 22,
          ssh_username: form.sshUser,
          ssh_auth_method: form.sshUseKeyAuth ? "key" as const : "password" as const,
          ssh_password: !form.sshUseKeyAuth ? form.sshPassword : undefined,
          ssh_private_key_path: form.sshUseKeyAuth ? form.sshKeyPath : undefined,
          ssh_use_password_auth: !form.sshUseKeyAuth,
          ssh_add_legacy_host_key: form.sshUseLegacyHostKey,
          ssh_add_legacy_kex: form.sshUseLegacyKex,
        }),
      });
      if (form.password) await savePassword(conn.id, form.password);
      if (sshEnabled && !form.sshUseKeyAuth && form.sshPassword) {
        await saveSshPassword(conn.id, form.sshPassword);
      }
      updateConnection(conn.id, {
        name: form.name.trim() || conn.name,
        host: form.host,
        port: parseInt(form.port) || 0,
        database: form.database,
        username: form.username,
        color: form.color,
        ssh: sshEnabled ? {
          host: form.sshHost,
          port: parseInt(form.sshPort) || 22,
          username: form.sshUser,
          authMethod: form.sshUseKeyAuth ? "key" : "password",
          privateKeyPath: form.sshUseKeyAuth ? form.sshKeyPath : undefined,
          usePasswordAuth: !form.sshUseKeyAuth,
          addLegacyKexAlgos: form.sshUseLegacyKex,
          addLegacyHostKeyAlgos: form.sshUseLegacyHostKey,
        } : undefined,
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

              {/* Over SSH toggle — only for non-SQLite */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setSshEnabled(v => !v)}
                  disabled={loading}
                  className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                    sshEnabled
                      ? "bg-blue-500 text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Over SSH
                </button>
              </div>

              {sshEnabled && (
                <div className="space-y-3 pt-1 border-t">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs">SSH Server</Label>
                      <Input
                        value={form.sshHost}
                        onChange={(e) => setForm({ ...form, sshHost: e.target.value })}
                        placeholder="ssh.example.com"
                        disabled={loading}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Port</Label>
                      <Input
                        value={form.sshPort}
                        onChange={(e) => setForm({ ...form, sshPort: e.target.value })}
                        disabled={loading}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">SSH User</Label>
                    <Input
                      value={form.sshUser}
                      onChange={(e) => setForm({ ...form, sshUser: e.target.value })}
                      placeholder="ubuntu"
                      disabled={loading}
                      className="h-8 text-sm"
                    />
                  </div>
                  {!form.sshUseKeyAuth && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">SSH Password</Label>
                      <Input
                        type="password"
                        value={form.sshPassword}
                        onChange={(e) => setForm({ ...form, sshPassword: e.target.value })}
                        disabled={loading}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="ssh-key-auth-edit"
                      checked={form.sshUseKeyAuth}
                      onChange={(e) => setForm({ ...form, sshUseKeyAuth: e.target.checked })}
                      disabled={loading}
                      className="h-3.5 w-3.5"
                    />
                    <label htmlFor="ssh-key-auth-edit" className="text-xs cursor-pointer">Use SSH key</label>
                  </div>
                  {form.sshUseKeyAuth && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Private key path</Label>
                      <Input
                        value={form.sshKeyPath}
                        onChange={(e) => setForm({ ...form, sshKeyPath: e.target.value })}
                        placeholder="~/.ssh/id_rsa"
                        disabled={loading}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="ssh-legacy-hostkey-edit"
                        checked={form.sshUseLegacyHostKey}
                        onChange={(e) => setForm({ ...form, sshUseLegacyHostKey: e.target.checked })}
                        disabled={loading}
                        className="h-3.5 w-3.5"
                      />
                      <label htmlFor="ssh-legacy-hostkey-edit" className="text-xs cursor-pointer">Legacy: add ssh-rsa host key algo</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="ssh-legacy-kex-edit"
                        checked={form.sshUseLegacyKex}
                        onChange={(e) => setForm({ ...form, sshUseLegacyKex: e.target.checked })}
                        disabled={loading}
                        className="h-3.5 w-3.5"
                      />
                      <label htmlFor="ssh-legacy-kex-edit" className="text-xs cursor-pointer">Legacy: add diffie-hellman-group1-sha1 kex</label>
                    </div>
                  </div>
                </div>
              )}
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
