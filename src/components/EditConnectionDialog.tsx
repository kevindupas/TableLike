import { useState, useEffect, useRef } from "react";
import { X, ChevronDown, Plus, Minus } from "lucide-react";
import { open as openFilePicker } from "@tauri-apps/plugin-dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Connection, useConnectionStore, Tag, PasswordMode, SslMode, DEFAULT_TAGS } from "../store/connections";
import { connectDb, getPassword, savePassword, getSshPassword, saveSshPassword, detectSshKeys, testSshConnection } from "../lib/tauri-commands";
import { parseConnectionUrl } from "../lib/utils";

const DB_ABBR: Record<string, string> = { postgresql: "Pg", mysql: "My", sqlite: "Sl" };
const DB_COLORS: Record<string, string> = { postgresql: "#336791", mysql: "#e48e00", sqlite: "#7b9cdb" };

const STATUS_COLORS = ["#6b7280", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#3b82f6"];

const SSL_MODES: { value: SslMode; label: string }[] = [
  { value: "preferred",   label: "PREFERRED" },
  { value: "require",     label: "REQUIRE" },
  { value: "verify-ca",   label: "VERIFY-CA" },
  { value: "verify-full", label: "VERIFY-FULL" },
  { value: "disable",     label: "DISABLE" },
];

const PASSWORD_MODES: { value: PasswordMode; label: string }[] = [
  { value: "keychain", label: "Store in keychain" },
  { value: "ask",      label: "Ask every time" },
  { value: "none",     label: "No password" },
];

const SSH_PASSWORD_MODES: { value: PasswordMode; label: string }[] = [
  { value: "keychain", label: "Store in keychain" },
  { value: "ask",      label: "Ask every time" },
];

const SSH_BACKENDS: { value: "russh" | "openssh"; label: string }[] = [
  { value: "russh",   label: "Built-in (russh)" },
  { value: "openssh", label: "OpenSSH (system)" },
];

interface Props {
  conn: Connection | null;
  onClose: () => void;
}

function SelectDropdown<T extends string>({
  value, options, onChange, disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 h-8 px-2 text-xs bg-muted border border-border rounded hover:bg-muted/80 transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {current?.label}
        <ChevronDown className="h-3 w-3 text-muted-foreground ml-0.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded shadow-lg min-w-40 py-1">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors ${o.value === value ? "text-foreground font-medium" : "text-muted-foreground"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TagPicker({
  tags, selectedId, onChange, disabled,
}: {
  tags: Tag[];
  selectedId: string | undefined;
  onChange: (id: string | undefined) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");
  const ref = useRef<HTMLDivElement>(null);
  const { addTag, removeTag } = useConnectionStore();
  const selected = tags.find((t) => t.id === selectedId);

  useEffect(() => {
    if (!open) { setEditMode(false); setNewName(""); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleAdd() {
    if (!newName.trim()) return;
    const id = crypto.randomUUID();
    addTag({ id, name: newName.trim(), color: newColor });
    setNewName("");
    setNewColor("#3b82f6");
    setEditMode(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 h-8 px-2 text-xs bg-muted border border-border rounded hover:bg-muted/80 transition-colors disabled:opacity-50 min-w-25"
      >
        {selected ? (
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: selected.color }} />
            {selected.name}
          </span>
        ) : (
          <span className="text-muted-foreground">No tag</span>
        )}
        <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded shadow-lg w-56 py-1">
          <button
            type="button"
            onClick={() => { onChange(undefined); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors ${!selectedId ? "font-medium" : "text-muted-foreground"}`}
          >
            No tag
          </button>
          {tags.map((tag) => (
            <div key={tag.id} className="flex items-center group">
              <button
                type="button"
                onClick={() => { onChange(tag.id); setOpen(false); }}
                className={`flex-1 flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors text-left ${tag.id === selectedId ? "font-medium" : "text-muted-foreground"}`}
              >
                <span className="w-8 h-4 rounded shrink-0 border border-border/50" style={{ backgroundColor: tag.color }} />
                {tag.name}
              </button>
              {!DEFAULT_TAGS.find((d) => d.id === tag.id) && (
                <button
                  type="button"
                  onClick={() => removeTag(tag.id)}
                  className="px-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                >
                  <Minus className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          <div className="border-t border-border mt-1 pt-1 px-2 pb-2">
            {editMode ? (
              <div className="space-y-1.5 mt-1">
                <div className="flex gap-1">
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="h-6 w-8 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    placeholder="Tag name"
                    className="flex-1 h-6 text-xs bg-background border border-border rounded px-2 outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={handleAdd} className="flex-1 text-xs py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">Add</button>
                  <button type="button" onClick={() => setEditMode(false)} className="flex-1 text-xs py-1 bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => setEditMode(true)}
                  className="flex items-center justify-center gap-1 flex-1 text-xs py-1 bg-muted rounded hover:bg-muted/80 transition-colors text-muted-foreground"
                >
                  <Plus className="h-3 w-3" /> Add tag
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BootstrapModal({ sql, bash, onChange, onClose }: {
  sql: string; bash: string;
  onChange: (sql: string, bash: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"sql" | "bash">("sql");
  const [localSql, setLocalSql] = useState(sql);
  const [localBash, setLocalBash] = useState(bash);
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-background border rounded-xl shadow-2xl w-130 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-medium">Bootstrap Commands</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex border-b">
          {(["sql", "bash"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-xs font-medium transition-colors ${tab === t ? "border-b-2 border-blue-500 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t === "sql" ? "SQL Statements" : "Bash Script"}
            </button>
          ))}
        </div>
        <div className="p-4">
          <textarea
            value={tab === "sql" ? localSql : localBash}
            onChange={(e) => tab === "sql" ? setLocalSql(e.target.value) : setLocalBash(e.target.value)}
            placeholder={tab === "sql" ? "-- SQL to run after connect\nSET search_path = myschema;" : "#!/bin/bash\n# Script to run after connect"}
            className="w-full h-48 text-xs font-mono bg-muted border border-border rounded p-2 outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={() => { onChange(localSql, localBash); onClose(); }} className="px-4 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors">Save</button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Label className="text-xs text-right w-24 shrink-0">{label}</Label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

type TestState = "idle" | "testing" | "ok" | "fail";
function fieldCls(test: TestState, base = "") {
  if (test === "ok")   return `${base} bg-green-500/10 border-green-500/60`;
  if (test === "fail") return `${base} bg-red-500/10 border-red-500/60`;
  return base;
}

export function EditConnectionDialog({ conn, onClose }: Props) {
  const { updateConnection, setConnected, tags } = useConnectionStore();
  const [sshEnabled, setSshEnabled] = useState(false);
  const [otherOptionsOpen, setOtherOptionsOpen] = useState(false);
  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [testState, setTestState] = useState<TestState>("idle");
  const [sshTestState, setSshTestState] = useState<TestState>("idle");

  const [form, setForm] = useState({
    name: "", host: "", port: "", database: "", username: "", password: "",
    color: STATUS_COLORS[0],
    tagId: undefined as string | undefined,
    passwordMode: "keychain" as PasswordMode,
    sslMode: "preferred" as SslMode,
    sslKeyPath: "", sslCertPath: "", sslCaCertPath: "",
    bootstrapSql: "", bootstrapBash: "",
    loadSystemSchemas: false, disableChannelBinding: false,
    sshHost: "", sshPort: "22", sshUser: "", sshPassword: "", sshKeyPath: "",
    sshUseKeyAuth: false, sshUseLegacyHostKey: false, sshUseLegacyKex: false,
    sshPasswordMode: "keychain" as PasswordMode,
    sshBackend: "russh" as "russh" | "openssh",
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
        tagId: conn.tagId,
        passwordMode: conn.passwordMode ?? "keychain",
        sslMode: conn.sslMode ?? "preferred",
        sslKeyPath: conn.sslKeyPath ?? "",
        sslCertPath: conn.sslCertPath ?? "",
        sslCaCertPath: conn.sslCaCertPath ?? "",
        bootstrapSql: conn.bootstrapSql ?? "",
        bootstrapBash: conn.bootstrapBash ?? "",
        loadSystemSchemas: conn.loadSystemSchemas ?? false,
        disableChannelBinding: conn.disableChannelBinding ?? false,
        sshHost: "", sshPort: "22", sshUser: "", sshPassword: "", sshKeyPath: "",
        sshUseKeyAuth: false, sshUseLegacyHostKey: false, sshUseLegacyKex: false,
        sshPasswordMode: "keychain", sshBackend: "russh" as "russh" | "openssh",
      });
      setSshEnabled(!!conn.ssh);
      if (conn.ssh) {
        const sshPwd = conn.ssh.authMethod === "password"
          ? await getSshPassword(conn.id).catch(() => "")
          : "";
        setForm((f) => ({
          ...f,
          sshHost: conn.ssh!.host,
          sshPort: String(conn.ssh!.port),
          sshUser: conn.ssh!.username,
          sshUseKeyAuth: conn.ssh!.authMethod === "key",
          sshKeyPath: conn.ssh!.privateKeyPath ?? "",
          sshUseLegacyHostKey: conn.ssh!.addLegacyHostKeyAlgos,
          sshUseLegacyKex: conn.ssh!.addLegacyKexAlgos,
          sshPassword: sshPwd,
          sshPasswordMode: conn.ssh!.passwordMode ?? "keychain",
          sshBackend: conn.ssh!.backend ?? "russh",
        }));
      }
    };
    loadData();
    setError(null);
    setTestState("idle");
    setSshTestState("idle");
  }, [conn]);

  if (!conn) return null;

  function buildSshParams() {
    return {
      ssh_host: form.sshHost,
      ssh_port: parseInt(form.sshPort) || 22,
      ssh_username: form.sshUser,
      ssh_auth_method: form.sshUseKeyAuth ? "key" as const : "password" as const,
      ssh_password: !form.sshUseKeyAuth ? form.sshPassword : undefined,
      ssh_private_key_path: form.sshUseKeyAuth ? form.sshKeyPath : undefined,
      ssh_use_password_auth: !form.sshUseKeyAuth,
      ssh_add_legacy_host_key: form.sshUseLegacyHostKey,
      ssh_add_legacy_kex: form.sshUseLegacyKex,
      ssh_backend: form.sshBackend,
    };
  }

  async function handleTestSsh() {
    if (!conn) return;
    setSshTestState("testing");
    setError(null);
    try {
      await testSshConnection({
        id: `test-ssh-${crypto.randomUUID()}`,
        name: "test",
        db_type: conn.type,
        host: form.host,
        port: parseInt(form.port) || 0,
        database: form.database,
        username: form.username,
        password: form.password,
        color: form.color,
        ...buildSshParams(),
      });
      setSshTestState("ok");
    } catch (e) {
      setSshTestState("fail");
      setError(String(e));
    }
  }

  async function handleTest() {
    if (!conn) return;
    setTestState("testing");
    setError(null);
    try {
      if (sshEnabled) {
        setSshTestState("testing");
        try {
          await testSshConnection({
            id: `test-ssh-${crypto.randomUUID()}`,
            name: "test",
            db_type: conn.type,
            host: form.host,
            port: parseInt(form.port) || 0,
            database: form.database,
            username: form.username,
            password: form.password,
            color: form.color,
            ...buildSshParams(),
          });
          setSshTestState("ok");
        } catch (e) {
          setSshTestState("fail");
          setTestState("fail");
          setError(String(e));
          return;
        }
      }
      await connectDb({
        id: conn.id,
        name: conn.name,
        db_type: conn.type,
        host: form.host,
        port: parseInt(form.port) || 0,
        database: form.database,
        username: form.username,
        password: form.password,
        color: form.color,
        ...(sshEnabled && buildSshParams()),
      });
      setTestState("ok");
    } catch (e) {
      setTestState("fail");
      setError(String(e));
    }
  }

  function buildConnectionUpdate() {
    return {
      name: form.name.trim() || conn!.name,
      host: form.host,
      port: parseInt(form.port) || 0,
      database: form.database,
      username: form.username,
      color: form.color,
      tagId: form.tagId,
      passwordMode: form.passwordMode,
      sslMode: form.sslMode,
      sslKeyPath: form.sslKeyPath || undefined,
      sslCertPath: form.sslCertPath || undefined,
      sslCaCertPath: form.sslCaCertPath || undefined,
      bootstrapSql: form.bootstrapSql || undefined,
      bootstrapBash: form.bootstrapBash || undefined,
      loadSystemSchemas: form.loadSystemSchemas,
      disableChannelBinding: form.disableChannelBinding,
      ssh: sshEnabled ? {
        host: form.sshHost,
        port: parseInt(form.sshPort) || 22,
        username: form.sshUser,
        authMethod: form.sshUseKeyAuth ? "key" : "password" as "key" | "password",
        privateKeyPath: form.sshUseKeyAuth ? form.sshKeyPath : undefined,
        usePasswordAuth: !form.sshUseKeyAuth,
        addLegacyKexAlgos: form.sshUseLegacyKex,
        addLegacyHostKeyAlgos: form.sshUseLegacyHostKey,
        passwordMode: form.sshPasswordMode,
        backend: form.sshBackend,
      } : undefined,
    };
  }

  async function persistPasswords() {
    if (form.password) await savePassword(conn!.id, form.password);
    if (sshEnabled && !form.sshUseKeyAuth && form.sshPassword && form.sshPasswordMode !== "none") {
      await saveSshPassword(conn!.id, form.sshPassword);
    }
  }

  async function handleSave() {
    if (!conn) return;
    setLoading(true);
    setError(null);
    try {
      await persistPasswords();
      updateConnection(conn.id, buildConnectionUpdate());
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    if (!conn) return;
    setLoading(true);
    setError(null);
    try {
      await persistPasswords();
      if (sshEnabled) {
        setSshTestState("testing");
        try {
          await testSshConnection({
            id: `test-ssh-${crypto.randomUUID()}`,
            name: "test",
            db_type: conn.type,
            host: form.host,
            port: parseInt(form.port) || 0,
            database: form.database,
            username: form.username,
            password: form.password,
            color: form.color,
            ...buildSshParams(),
          });
          setSshTestState("ok");
        } catch (e) {
          setSshTestState("fail");
          setError(String(e));
          return;
        }
      }
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
        ...(sshEnabled && buildSshParams()),
      });
      updateConnection(conn.id, buildConnectionUpdate());
      setConnected(conn.id, true);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function pickSslFile(field: "sslKeyPath" | "sslCertPath" | "sslCaCertPath") {
    const result = await openFilePicker({ multiple: false, directory: false });
    if (typeof result === "string") setForm((f) => ({ ...f, [field]: result }));
  }

  async function pickSshKey() {
    const keys = await detectSshKeys().catch(() => [] as string[]);
    if (keys.length === 1) {
      setForm((f) => ({ ...f, sshKeyPath: keys[0] }));
      return;
    }
    const result = await openFilePicker({ multiple: false, directory: false });
    if (typeof result === "string") setForm((f) => ({ ...f, sshKeyPath: result }));
  }

  const abbr = DB_ABBR[conn.type] ?? conn.type;
  const dbColor = DB_COLORS[conn.type] ?? "#888";
  const ts = testState;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative bg-background border rounded-xl shadow-2xl w-135 max-h-[92vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: dbColor }}>
                {abbr}
              </div>
              <span className="text-sm font-medium">Edit {conn.name}</span>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form */}
          <div className="overflow-y-auto px-4 py-4 space-y-2.5">
            <FieldRow label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={loading} className="h-8 text-sm" />
            </FieldRow>

            <FieldRow label="Status color">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex gap-1.5">
                  {STATUS_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} disabled={loading}
                      className={`w-7 h-5 rounded border-2 transition-all ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-muted-foreground">Tag</span>
                  <TagPicker tags={tags} selectedId={form.tagId} onChange={(id) => setForm({ ...form, tagId: id })} disabled={loading} />
                </div>
              </div>
            </FieldRow>

            {conn.type !== "sqlite" ? (
              <>
                {/* URL import */}
                <FieldRow label="URL">
                  <Input
                    placeholder="postgresql://user:pass@host:5432/dbname"
                    disabled={loading}
                    className="h-8 text-sm font-mono"
                    onChange={(e) => {
                      const parsed = parseConnectionUrl(e.target.value);
                      if (!parsed) return;
                      setTestState("idle");
                      setForm((f) => ({
                        ...f,
                        host: parsed.host || f.host,
                        port: parsed.port || f.port,
                        database: parsed.database || f.database,
                        username: parsed.username || f.username,
                        password: parsed.password || f.password,
                      }));
                    }}
                  />
                </FieldRow>

                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] text-muted-foreground">OR</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <FieldRow label="Host/Socket">
                  <div className="flex gap-2">
                    <Input value={form.host} onChange={(e) => { setTestState("idle"); setForm({ ...form, host: e.target.value }); }} disabled={loading} className={`h-8 text-sm flex-1 ${fieldCls(ts)}`} />
                    <span className="text-xs text-muted-foreground self-center shrink-0">Port</span>
                    <Input value={form.port} onChange={(e) => { setTestState("idle"); setForm({ ...form, port: e.target.value }); }} disabled={loading} className={`h-8 text-sm w-20 ${fieldCls(ts)}`} />
                  </div>
                </FieldRow>

                <FieldRow label="User">
                  <div className="flex gap-2">
                    <Input value={form.username} onChange={(e) => { setTestState("idle"); setForm({ ...form, username: e.target.value }); }} disabled={loading} className={`h-8 text-sm flex-1 ${fieldCls(ts)}`} />
                    <div className="relative shrink-0">
                      <button type="button" onClick={() => setOtherOptionsOpen((v) => !v)} disabled={loading}
                        className="flex items-center gap-1 h-8 px-2 text-xs bg-muted border border-border rounded hover:bg-muted/80 transition-colors whitespace-nowrap"
                      >
                        Other options <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </button>
                      {otherOptionsOpen && (
                        <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded shadow-lg w-52 py-2 px-3 space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.loadSystemSchemas} onChange={(e) => setForm({ ...form, loadSystemSchemas: e.target.checked })} className="h-3.5 w-3.5" />
                            <span className="text-xs">Load system schemas</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.disableChannelBinding} onChange={(e) => setForm({ ...form, disableChannelBinding: e.target.checked })} className="h-3.5 w-3.5" />
                            <span className="text-xs">Disable channel binding</span>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </FieldRow>

                <FieldRow label="Password">
                  <div className="flex gap-2">
                    <Input type="password" value={form.password} onChange={(e) => { setTestState("idle"); setForm({ ...form, password: e.target.value }); }} disabled={loading} className={`h-8 text-sm flex-1 ${fieldCls(ts)}`} />
                    <SelectDropdown value={form.passwordMode} options={PASSWORD_MODES} onChange={(v) => setForm({ ...form, passwordMode: v })} disabled={loading} />
                  </div>
                </FieldRow>

                <FieldRow label="Database">
                  <div className="flex gap-2">
                    <Input value={form.database} onChange={(e) => { setTestState("idle"); setForm({ ...form, database: e.target.value }); }} disabled={loading} className={`h-8 text-sm flex-1 ${fieldCls(ts)}`} />
                    <button type="button" onClick={() => setBootstrapOpen(true)} disabled={loading}
                      className="h-8 px-2 text-xs bg-muted border border-border rounded hover:bg-muted/80 transition-colors whitespace-nowrap"
                    >
                      Bootstrap commands...
                    </button>
                  </div>
                </FieldRow>

                <FieldRow label="SSL mode">
                  <SelectDropdown value={form.sslMode} options={SSL_MODES} onChange={(v) => setForm({ ...form, sslMode: v })} disabled={loading} />
                </FieldRow>

                <FieldRow label="SSL keys">
                  <div className="flex gap-1.5 items-center">
                    <button type="button" onClick={() => pickSslFile("sslKeyPath")} disabled={loading}
                      className="flex-1 h-8 px-2 text-xs bg-muted border border-border rounded hover:bg-muted/80 transition-colors truncate text-left"
                      title={form.sslKeyPath || "Key..."}
                    >
                      {form.sslKeyPath ? form.sslKeyPath.split("/").pop() : "Key..."}
                    </button>
                    <button type="button" onClick={() => pickSslFile("sslCertPath")} disabled={loading}
                      className="flex-1 h-8 px-2 text-xs bg-muted border border-border rounded hover:bg-muted/80 transition-colors truncate text-left"
                      title={form.sslCertPath || "Cert..."}
                    >
                      {form.sslCertPath ? form.sslCertPath.split("/").pop() : "Cert..."}
                    </button>
                    <button type="button" onClick={() => pickSslFile("sslCaCertPath")} disabled={loading}
                      className="flex-1 h-8 px-2 text-xs bg-muted border border-border rounded hover:bg-muted/80 transition-colors truncate text-left"
                      title={form.sslCaCertPath || "CA Cert..."}
                    >
                      {form.sslCaCertPath ? form.sslCaCertPath.split("/").pop() : "CA Cert..."}
                    </button>
                    <button type="button" onClick={() => setForm({ ...form, sslKeyPath: "", sslCertPath: "", sslCaCertPath: "" })} disabled={loading}
                      className="h-8 w-8 flex items-center justify-center bg-muted border border-border rounded hover:bg-muted/80 transition-colors shrink-0"
                    >
                      <span className="text-xs">—</span>
                    </button>
                  </div>
                </FieldRow>

                <FieldRow label="">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setSshEnabled((v) => !v)} disabled={loading}
                      className={`px-3 py-1 text-xs rounded font-medium transition-colors ${sshEnabled ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                    >
                      Over SSH
                    </button>
                    {sshEnabled && (
                      <SelectDropdown
                        value={form.sshBackend}
                        options={SSH_BACKENDS}
                        onChange={(v) => setForm({ ...form, sshBackend: v })}
                        disabled={loading}
                      />
                    )}
                  </div>
                </FieldRow>

                {sshEnabled && (
                  <div className="border-t pt-2.5 space-y-2.5">
                    <FieldRow label="Server">
                      <div className="flex gap-2">
                        <Input value={form.sshHost} onChange={(e) => { setSshTestState("idle"); setForm({ ...form, sshHost: e.target.value }); }} placeholder="192.168.1.1" disabled={loading} className={`h-8 text-sm flex-1 ${fieldCls(sshTestState)}`} />
                        <span className="text-xs text-muted-foreground self-center shrink-0">Port</span>
                        <Input value={form.sshPort} onChange={(e) => { setSshTestState("idle"); setForm({ ...form, sshPort: e.target.value }); }} disabled={loading} className={`h-8 text-sm w-20 ${fieldCls(sshTestState)}`} />
                      </div>
                    </FieldRow>

                    <FieldRow label="User">
                      <Input value={form.sshUser} onChange={(e) => { setSshTestState("idle"); setForm({ ...form, sshUser: e.target.value }); }} placeholder="ubuntu" disabled={loading} className={`h-8 text-sm ${fieldCls(sshTestState)}`} />
                    </FieldRow>

                    {!form.sshUseKeyAuth && (
                      <FieldRow label="Password">
                        <div className="flex gap-2">
                          <Input type="password" value={form.sshPassword} onChange={(e) => { setSshTestState("idle"); setForm({ ...form, sshPassword: e.target.value }); }} disabled={loading} className={`h-8 text-sm flex-1 ${fieldCls(sshTestState)}`} />
                          <SelectDropdown value={form.sshPasswordMode} options={SSH_PASSWORD_MODES} onChange={(v) => setForm({ ...form, sshPasswordMode: v })} disabled={loading} />
                        </div>
                      </FieldRow>
                    )}

                    <FieldRow label="">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" id="edit-ssh-key-auth" checked={form.sshUseKeyAuth} onChange={(e) => setForm({ ...form, sshUseKeyAuth: e.target.checked })} disabled={loading} className="h-3.5 w-3.5" />
                        <label htmlFor="edit-ssh-key-auth" className="text-xs cursor-pointer">Use SSH key</label>
                        {form.sshUseKeyAuth && (
                          <>
                            <button type="button" onClick={pickSshKey} disabled={loading}
                              className={`flex-1 h-7 px-2 text-xs bg-muted border rounded hover:bg-muted/80 transition-colors truncate text-left ${fieldCls(sshTestState, "border-border")}`}
                              title={form.sshKeyPath || "Import a private key..."}
                            >
                              {form.sshKeyPath ? form.sshKeyPath.split("/").pop() : "Import a private key..."}
                            </button>
                            {form.sshKeyPath && (
                              <button type="button" onClick={() => setForm({ ...form, sshKeyPath: "" })} className="h-7 w-7 flex items-center justify-center bg-muted border border-border rounded hover:bg-muted/80 shrink-0">
                                <span className="text-xs">—</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </FieldRow>
                    {form.sshUseKeyAuth && (
                      <p className="text-[10px] text-muted-foreground pl-27">
                        TableLike will use ~/.ssh/config if you leave private key empty
                      </p>
                    )}

                    <FieldRow label="">
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={form.sshUseLegacyHostKey} onChange={(e) => setForm({ ...form, sshUseLegacyHostKey: e.target.checked })} disabled={loading} className="h-3.5 w-3.5" />
                          <span className="text-xs">Legacy: add ssh-rsa host key algo</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={form.sshUseLegacyKex} onChange={(e) => { setSshTestState("idle"); setForm({ ...form, sshUseLegacyKex: e.target.checked }); }} disabled={loading} className="h-3.5 w-3.5" />
                          <span className="text-xs">Legacy: add diffie-hellman-group1-sha1 kex</span>
                        </label>
                      </div>
                    </FieldRow>

                    <FieldRow label="">
                      <button
                        type="button"
                        onClick={handleTestSsh}
                        disabled={loading || sshTestState === "testing"}
                        className={`px-3 py-1 text-xs rounded border transition-colors disabled:opacity-50 ${
                          sshTestState === "ok"   ? "bg-green-500/10 border-green-500/60 text-green-600" :
                          sshTestState === "fail" ? "bg-red-500/10 border-red-500/60 text-red-600" :
                          "bg-muted border-border text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {sshTestState === "testing" ? "Testing SSH..." : sshTestState === "ok" ? "✓ SSH OK" : sshTestState === "fail" ? "✗ SSH failed" : "Test SSH connection"}
                      </button>
                    </FieldRow>
                  </div>
                )}
              </>
            ) : (
              <FieldRow label="File path">
                <div className="flex gap-2">
                  <Input value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} disabled={loading} className="h-8 text-sm flex-1" />
                  <button type="button" disabled={loading} onClick={async () => {
                    const r = await openFilePicker({ multiple: false, directory: false, filters: [{ name: "SQLite", extensions: ["sqlite", "db", "sqlite3"] }] });
                    if (typeof r === "string") setForm((f) => ({ ...f, database: r }));
                  }} className="h-8 px-2 text-xs bg-muted border border-border rounded hover:bg-muted/80 transition-colors whitespace-nowrap">
                    Browse...
                  </button>
                </div>
              </FieldRow>
            )}

            {error && (
              <div className="rounded bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">{error}</div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center px-4 py-3 border-t shrink-0">
            <button onClick={onClose} disabled={loading} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
            <div className="flex gap-2">
              <button onClick={handleTest} disabled={loading || testState === "testing"}
                className="px-4 py-1.5 text-sm bg-muted hover:bg-muted/80 text-foreground rounded border border-border transition-colors disabled:opacity-50"
              >
                {testState === "testing" ? "Testing..." : testState === "ok" ? "✓ Test" : testState === "fail" ? "✗ Test" : "Test"}
              </button>
              <button onClick={handleSave} disabled={loading}
                className="px-4 py-1.5 text-sm bg-muted hover:bg-muted/80 text-foreground rounded border border-border transition-colors disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save"}
              </button>
              <button onClick={handleConnect} disabled={loading}
                className="px-4 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50"
              >
                {loading ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {bootstrapOpen && (
        <BootstrapModal
          sql={form.bootstrapSql}
          bash={form.bootstrapBash}
          onChange={(sql, bash) => setForm((f) => ({ ...f, bootstrapSql: sql, bootstrapBash: bash }))}
          onClose={() => setBootstrapOpen(false)}
        />
      )}
    </>
  );
}
