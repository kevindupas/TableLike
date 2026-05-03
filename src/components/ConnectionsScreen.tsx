import { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Search, HardDrive, RotateCcw, Plus, ChevronDown, ChevronRight } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  useDroppable,
  useDraggable,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  UniqueIdentifier,
} from "@dnd-kit/core";
import type { CollisionDetection } from "@dnd-kit/core";
import { useConnectionStore, Connection, ConnectionGroup, SortBy, Tag } from "../store/connections";
import { NewConnectionDialog } from "./NewConnectionDialog";
import { EditConnectionDialog } from "./EditConnectionDialog";
import { ConnectionContextMenu } from "./ConnectionContextMenu";
import { GroupContextMenu } from "./GroupContextMenu";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { EditGroupDialog } from "./EditGroupDialog";
import { ExportDialog } from "./ExportDialog";
import { ImportDialog } from "./ImportDialog";
import { ImportUrlDialog } from "./ImportUrlDialog";
import { BackupDialog } from "./BackupDialog";
import { RestoreDialog } from "./RestoreDialog";
import { connectDb, getPassword, getSshPassword } from "../lib/tauri-commands";
import { GroupAvatar } from "./GroupAvatar";

const DB_LABELS: Record<string, string> = { postgresql: "Pg", mysql: "My", sqlite: "Sl" };
type ExportScope = "all" | "group" | "single";

// Prefer grp: droppables (group headers) when pointer is directly over them,
// otherwise fall back to rectIntersection for between-zone gaps.
const customCollision: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const grpHit = pointerHits.find(c => String(c.id).startsWith("grp:"));
  if (grpHit) return [grpHit];
  const first = getFirstCollision(pointerHits);
  if (first) return [first];
  return rectIntersection(args);
};

// ── Between-zone droppable ───────────────────────────────────────────────────

function BetweenZone({ id, active, dragging }: { id: string; active: boolean; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const highlight = isOver || active;
  // Height must be non-zero so dnd-kit can detect pointer intersection.
  // Negative margin collapses the visual space so layout is unaffected.
  return (
    <div
      ref={setNodeRef}
      className="relative"
      style={{ height: dragging ? 12 : 0, marginTop: dragging ? -6 : 0, marginBottom: dragging ? -6 : 0 }}
    >
      {highlight && (
        <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-0.5 bg-blue-500 rounded-full z-30" />
      )}
    </div>
  );
}

// ── Draggable connection row ─────────────────────────────────────────────────

interface ConnRowProps {
  conn: Connection;
  tag?: Tag;
  indent?: boolean;
  isActive: boolean;
  isConn: boolean;
  isLoading: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  ghost?: boolean;
}

function ConnRow({ conn, tag, indent, isActive, isConn, isLoading, onClick, onDoubleClick, onContextMenu, ghost }: ConnRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: conn.id,
    data: { type: "conn", conn },
    disabled: ghost,
  });

  return (
    <div ref={ghost ? undefined : setNodeRef} style={{ opacity: isDragging ? 0.3 : 1 }}>
      <button
        {...(ghost ? {} : { ...attributes, ...listeners })}
        onDoubleClick={onDoubleClick}
        onClick={onClick}
        onContextMenu={onContextMenu}
        disabled={isLoading}
        className={`flex items-center gap-2 w-full py-2.5 rounded text-left transition-colors cursor-grab active:cursor-grabbing ${indent ? "pl-8 pr-4" : "px-4"} ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"}`}
      >
        <div className="relative shrink-0">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[14px]" style={{ backgroundColor: conn.color }}>
            {isLoading ? "…" : DB_LABELS[conn.type]}
          </div>
          {isConn && <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-background" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold truncate">{conn.name}</span>
            {tag && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0" style={{ backgroundColor: tag.color + "28", color: tag.color }}>
                {tag.name}
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground truncate italic">
            {conn.type === "sqlite" ? conn.database : conn.ssh ? `SSH : ${conn.ssh.username}@${conn.ssh.host}` : `${conn.host}:${conn.port}`}
          </div>
        </div>
      </button>
    </div>
  );
}

// ── Draggable group header + droppable drop-into-group zone ──────────────────

interface GroupRowProps {
  group: ConnectionGroup;
  count: number;
  isOverDrop: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  ghost?: boolean;
}

function GroupRow({ group, count, isOverDrop, collapsed, onToggle, onContextMenu, ghost }: GroupRowProps) {
  const { attributes, listeners, setNodeRef: dragRef, isDragging } = useDraggable({
    id: group.id,
    data: { type: "group", group },
    disabled: ghost,
  });
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: `grp:${group.id}` });

  const highlight = isOverDrop || isOver;

  return (
    <div ref={ghost ? undefined : dragRef} style={{ opacity: isDragging ? 0.3 : 1 }}>
      <div
        ref={ghost ? undefined : dropRef}
        onContextMenu={onContextMenu}
        onClick={onToggle}
        className={`flex items-center gap-1.5 w-full px-4 py-2.5 rounded transition-colors cursor-grab active:cursor-grabbing ${highlight ? "bg-blue-500/20 ring-1 ring-blue-500" : "hover:bg-muted/40"}`}
        {...(ghost ? {} : { ...attributes, ...listeners })}
      >
        {collapsed
          ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
        <GroupAvatar name={group.name} color={group.color} icon={group.icon} size={28} />
        <span className="text-xs font-medium text-muted-foreground truncate">{group.name}</span>
        <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">{count}</span>
      </div>
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export function ConnectionsScreen() {
  const {
    connections, groups, tags, sortBy, order,
    activeConnectionId, connectedIds,
    setActiveConnection, setConnected,
    removeConnection, removeGroup,
    addConnection, addGroup, updateGroup,
    setSortBy, toggleGroupCollapsed,
    reorder, moveConnectionToGroup, reorderGroupChildren,
  } = useConnectionStore();

  const tagMap = new Map(tags.map((t) => [t.id, t]));

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editConn, setEditConn] = useState<Connection | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<ConnectionGroup | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrlOpen, setImportUrlOpen] = useState(false);
  const [exportState, setExportState] = useState<{ open: boolean; scope: ExportScope; groupId?: string; connId?: string }>({ open: false, scope: "all" });
  const [connCtx, setConnCtx] = useState<{ conn: Connection; x: number; y: number } | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [groupCtx, setGroupCtx] = useState<{ group: ConnectionGroup; x: number; y: number } | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null);

  const connectionsRef = useRef(connections);
  const groupsRef = useRef(groups);
  const orderRef = useRef(order);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);
  useEffect(() => { groupsRef.current = groups; }, [groups]);
  useEffect(() => { orderRef.current = order; }, [order]);

  useEffect(() => {
    const win = getCurrentWindow();
    win.setResizable(false);
    win.setMaximizable(false);
    return () => { win.setResizable(true); win.setMaximizable(true); };
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  async function handleConnect(conn: Connection) {
    if (connectedIds.has(conn.id)) { setActiveConnection(conn.id); return; }

    const password = await getPassword(conn.id).catch(() => "");

    setConnecting(conn.id);
    setConnectError(null);
    try {
      const sshPassword = conn.ssh?.authMethod === "password" && (conn.ssh.passwordMode ?? "keychain") !== "none"
        ? await getSshPassword(conn.id).catch(() => "")
        : undefined;
      await connectDb({
        id: conn.id,
        name: conn.name,
        db_type: conn.type,
        host: conn.host,
        port: conn.port,
        database: conn.database,
        username: conn.username,
        password,
        color: conn.color,
        ssh_host: conn.ssh?.host,
        ssh_port: conn.ssh?.port,
        ssh_username: conn.ssh?.username,
        ssh_auth_method: conn.ssh?.authMethod,
        ssh_password: sshPassword,
        ssh_private_key_path: conn.ssh?.privateKeyPath,
        ssh_use_password_auth: conn.ssh?.usePasswordAuth,
        ssh_add_legacy_host_key: conn.ssh?.addLegacyHostKeyAlgos,
        ssh_add_legacy_kex: conn.ssh?.addLegacyKexAlgos,
        ssh_backend: conn.ssh?.backend,
      });
      setConnected(conn.id, true);
      setActiveConnection(conn.id);
    } catch (e) {
      setConnectError(String(e));
    } finally {
      setConnecting(null);
    }
  }

  // ── Build display order ────────────────────────────────────────────────────

  const searchLower = search.toLowerCase();
  const visibleConnIds = new Set(connections.filter(c => c.name.toLowerCase().includes(searchLower)).map(c => c.id));
  const groupMap = new Map(groups.map(g => [g.id, g]));
  const connMap = new Map(connections.map(c => [c.id, c]));

  function buildTopLevel(conns: typeof connections, grps: typeof groups, ord: typeof order) {
    const gMap = new Map(grps.map(g => [g.id, g]));
    const cMap = new Map(conns.map(c => [c.id, c]));
    const knownSet = new Set(ord);
    const extras = grps.map(g => g.id).filter(id => !knownSet.has(id));
    const extraConns = conns.filter(c => !c.groupId && !knownSet.has(c.id)).map(c => c.id);
    return [
      ...ord.filter(id => { const c = cMap.get(id); return gMap.has(id) || (c != null && !c.groupId); }),
      ...extras,
      ...extraConns,
    ];
  }

  const allTopLevel = buildTopLevel(connections, groups, order);

  const activeDragConn = activeId ? connMap.get(activeId) ?? null : null;
  const activeDragGroup = activeId ? groupMap.get(activeId) ?? null : null;

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    setOverId(e.over?.id ?? null);
  }

  function handleDragEnd(e: DragEndEvent) {
    const draggedId = String(e.active.id);
    const dropId = e.over ? String(e.over.id) : null;

    setActiveId(null);
    setOverId(null);

    const conns = connectionsRef.current;
    const grps = groupsRef.current;
    const ord = orderRef.current;

    const draggedConn = conns.find(c => c.id === draggedId);
    const draggedGroup = grps.find(g => g.id === draggedId);

    // ── Connection drag ──────────────────────────────────────────────────────
    if (draggedConn) {
      if (!dropId) {
        // Dropped on nothing → eject from group if grouped
        if (draggedConn.groupId) moveConnectionToGroup(draggedId, undefined);
        return;
      }

      // Dropped on a group header → enter that group
      if (dropId.startsWith("grp:")) {
        const targetGroupId = dropId.slice(4);
        if (draggedConn.groupId !== targetGroupId) {
          moveConnectionToGroup(draggedId, targetGroupId);
        }
        return;
      }

      // Dropped on a between-zone: "bz:<afterId>:<ctxGroup|none>"
      if (dropId.startsWith("bz:")) {
        const parts = dropId.split(":");
        // afterId might itself contain ":" so we join from index 2 back, context group is last segment
        const afterId = parts.slice(1, parts.length - 1).join(":");
        const ctxRaw = parts[parts.length - 1];
        const targetGroupId = ctxRaw === "none" ? undefined : ctxRaw;

        if (draggedConn.groupId !== targetGroupId) {
          moveConnectionToGroup(draggedId, targetGroupId);
        }

        if (targetGroupId) {
          // Reorder within group
          const groupChildren = conns.filter(c => c.groupId === targetGroupId).map(c => c.id);
          const others = groupChildren.filter(id => id !== draggedId);
          const insertIdx = afterId === "start" ? 0 : others.findIndex(id => id === afterId) + 1;
          const newOrder = [...others.slice(0, insertIdx), draggedId, ...others.slice(insertIdx)];
          reorderGroupChildren(targetGroupId, newOrder);
        } else {
          // Reorder top-level
          const topIds = buildTopLevel(conns, grps, ord);
          const others = topIds.filter(id => id !== draggedId);
          const insertIdx = afterId === "start" ? 0 : others.findIndex(id => id === afterId) + 1;
          others.splice(insertIdx, 0, draggedId);
          reorder(others);
        }
        return;
      }
    }

    // ── Group drag ───────────────────────────────────────────────────────────
    if (draggedGroup && dropId?.startsWith("bz:")) {
      const parts = dropId.split(":");
      const afterId = parts.slice(1, parts.length - 1).join(":");
      const topIds = buildTopLevel(conns, grps, ord);
      const others = topIds.filter(id => id !== draggedId);
      const insertIdx = afterId === "start" ? 0 : others.findIndex(id => id === afterId) + 1;
      others.splice(insertIdx, 0, draggedId);
      reorder(others);
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  // Between-zone id: "bz:<afterId>:<ctxGroup|none>"
  // afterId = "start" for top of list, otherwise the id of the item above the gap
  function bzId(afterId: string, groupId: string | undefined) {
    return `bz:${afterId}:${groupId ?? "none"}`;
  }

  function renderBZ(afterId: string, groupId?: string) {
    const id = bzId(afterId, groupId);
    return <BetweenZone key={id} id={id} active={overId === id} dragging={activeId !== null} />;
  }

  // ── Build item list ────────────────────────────────────────────────────────

  const items: React.ReactNode[] = [];
  items.push(renderBZ("start"));

  for (const topId of allTopLevel) {
    const group = groupMap.get(topId);
    if (group) {
      const children = connections.filter(c => c.groupId === group.id && visibleConnIds.has(c.id));
      items.push(
        <GroupRow
          key={group.id}
          group={group}
          count={children.length}
          isOverDrop={overId === `grp:${group.id}`}
          collapsed={group.collapsed}
          onToggle={() => toggleGroupCollapsed(group.id)}
          onContextMenu={(e) => { e.preventDefault(); setGroupCtx({ group, x: e.clientX, y: e.clientY }); }}
        />
      );
      items.push(renderBZ(group.id));

      if (!group.collapsed) {
        items.push(renderBZ("start", group.id));
        for (const child of children) {
          items.push(
            <ConnRow
              key={child.id}
              conn={child}
              tag={child.tagId ? tagMap.get(child.tagId) : undefined}
              indent
              isActive={child.id === activeConnectionId}
              isConn={connectedIds.has(child.id)}
              isLoading={connecting === child.id}
              onClick={() => { setActiveConnection(child.id); setConnectError(null); }}
              onDoubleClick={() => handleConnect(child)}
              onContextMenu={(e) => { e.preventDefault(); setConnCtx({ conn: child, x: e.clientX, y: e.clientY }); }}
            />
          );
          items.push(renderBZ(child.id, group.id));
        }
      }
      continue;
    }
    const conn = connMap.get(topId);
    if (!conn || !visibleConnIds.has(conn.id)) continue;
    items.push(
      <ConnRow
        key={conn.id}
        conn={conn}
        tag={conn.tagId ? tagMap.get(conn.tagId) : undefined}
        isActive={conn.id === activeConnectionId}
        isConn={connectedIds.has(conn.id)}
        isLoading={connecting === conn.id}
        onClick={() => { setActiveConnection(conn.id); setConnectError(null); }}
        onDoubleClick={() => handleConnect(conn)}
        onContextMenu={(e) => { e.preventDefault(); setConnCtx({ conn, x: e.clientX, y: e.clientY }); }}
      />
    );
    items.push(renderBZ(conn.id));
  }

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollision}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setActiveId(null); setOverId(null); }}
    >
    <div className="flex h-screen bg-background text-foreground overflow-hidden relative">
      <div className="absolute inset-0 bg-linear-to-br from-muted/60 via-background to-muted/40 backdrop-blur-3xl pointer-events-none" />

      {/* LEFT sidebar */}
      <div className="flex flex-col w-64 shrink-0 relative z-10 bg-black/20 backdrop-blur-xl">
        <div className="px-4 pt-5 pb-4 flex-1 flex flex-col items-center text-center">
          <img src="/logo.png" alt="TableLike" width={160} height={160} />
          <div className="text-xl font-bold mt-2">TableLike</div>
          <div className="text-[10px] text-muted-foreground">Version 0.1.0 (beta)</div>
          <div className="text-[10px] text-orange-400">Open Source Preview</div>
          <div className="flex gap-1.5 mt-2">
            <button className="px-2 py-0.5 text-[10px] border rounded text-muted-foreground hover:bg-muted">GitHub</button>
            <button className="px-2 py-0.5 text-[10px] border rounded text-muted-foreground hover:bg-muted">Docs</button>
          </div>
        </div>
        <div className="px-6 py-2 space-y-2.5 mb-8">
          <button onClick={() => setBackupOpen(true)} className="flex items-center justify-center gap-1.5 w-full px-2 py-2 rounded-md text-sm text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground transition-colors">
            <HardDrive className="h-3.5 w-3.5 shrink-0" />Backup database...
          </button>
          <button onClick={() => setRestoreOpen(true)} className="flex items-center justify-center gap-1.5 w-full px-2 py-2 rounded-md text-sm text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground transition-colors">
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />Restore database...
          </button>
          <button onClick={() => setDialogOpen(true)} className="flex items-center justify-center gap-1.5 w-full px-2 py-2 rounded-md text-sm text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground transition-colors">
            <Plus className="h-3.5 w-3.5 shrink-0" />Create connection...
          </button>
        </div>
      </div>

      {/* RIGHT panel */}
      <div className="flex flex-col flex-1 overflow-hidden relative z-10 bg-background/20 backdrop-blur-xl">
        <div className="flex items-center h-10 shrink-0 px-2 gap-1">
          <button onClick={() => setDialogOpen(true)} className="text-muted-foreground hover:text-foreground shrink-0">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              placeholder="Search for connections..."
              className="w-full h-7 text-xs bg-muted/40 border border-border rounded pl-6 pr-2 outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {connectError && (
            <div className="mb-2 px-2 py-1.5 rounded bg-destructive/10 border border-destructive/20">
              <p className="text-[10px] text-destructive">{connectError}</p>
              <button onClick={() => setConnectError(null)} className="text-[10px] underline text-muted-foreground">Dismiss</button>
            </div>
          )}

          {items}

          {connections.length === 0 && <p className="text-[10px] text-muted-foreground text-center py-6">No connections yet</p>}
        </div>
      </div>

      {/* Dialogs */}
      <NewConnectionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onNewGroup={() => setGroupDialogOpen(true)}
        onImportFile={() => { setDialogOpen(false); setImportOpen(true); }}
        onImportUrl={() => { setDialogOpen(false); setImportUrlOpen(true); }}
      />
      <EditConnectionDialog conn={editConn} onClose={() => setEditConn(null)} />
      <CreateGroupDialog open={groupDialogOpen} onClose={() => setGroupDialogOpen(false)} onCreate={(name, color, icon) => addGroup({ id: crypto.randomUUID(), name, color, icon, collapsed: false })} />
      <EditGroupDialog group={editGroup} onClose={() => setEditGroup(null)} onSave={(id, name, color, icon) => updateGroup(id, { name, color, icon })} />
      <ExportDialog open={exportState.open} scope={exportState.scope} groupId={exportState.groupId} connId={exportState.connId} onClose={() => setExportState({ open: false, scope: "all" })} />
      <ImportDialog open={importOpen} onClose={() => { setImportOpen(false); setDialogOpen(true); }} />
      <ImportUrlDialog open={importUrlOpen} onClose={() => { setImportUrlOpen(false); setDialogOpen(true); }} />
      {backupOpen && <BackupDialog conn={null} onClose={() => setBackupOpen(false)} />}
      {restoreOpen && <RestoreDialog conn={null} onClose={() => setRestoreOpen(false)} />}



      {connCtx && (
        <ConnectionContextMenu
          conn={connCtx.conn} x={connCtx.x} y={connCtx.y}
          onClose={() => setConnCtx(null)}
          onConnect={() => handleConnect(connCtx.conn)}
          onEdit={() => setEditConn(connCtx.conn)}
          onDuplicate={() => { const s = connCtx.conn; addConnection({ ...s, id: crypto.randomUUID(), name: `${s.name} copy` }); }}
          onDelete={() => removeConnection(connCtx.conn.id)}
          onNewConnection={() => setDialogOpen(true)}
          onNewGroup={() => setGroupDialogOpen(true)}
          onSortBy={(s: SortBy) => setSortBy(s)}
          currentSort={sortBy}
          onImport={() => setImportOpen(true)}
          onExportAll={() => setExportState({ open: true, scope: "all" })}
          onExportGroup={() => setExportState({ open: true, scope: "group", groupId: connCtx.conn.groupId })}
          onExportSingle={() => setExportState({ open: true, scope: "single", connId: connCtx.conn.id })}
        />
      )}

      {groupCtx && (
        <GroupContextMenu
          group={groupCtx.group} x={groupCtx.x} y={groupCtx.y}
          onClose={() => setGroupCtx(null)}
          onEdit={() => setEditGroup(groupCtx.group)}
          onNewConnection={() => setDialogOpen(true)}
          onNewGroup={() => setGroupDialogOpen(true)}
          onExportGroup={() => setExportState({ open: true, scope: "group", groupId: groupCtx.group.id })}
          onDelete={() => removeGroup(groupCtx.group.id)}
        />
      )}

      <DragOverlay dropAnimation={null}>
        {activeDragConn && (
          <div className="w-56 opacity-90 shadow-xl rounded ring-1 ring-blue-500/60 bg-background/80">
            <ConnRow
              conn={activeDragConn}
              isActive={false}
              isConn={connectedIds.has(activeDragConn.id)}
              isLoading={false}
              onClick={() => {}} onDoubleClick={() => {}} onContextMenu={() => {}}
              ghost
            />
          </div>
        )}
        {activeDragGroup && (
          <div className="w-56 opacity-90 shadow-xl rounded ring-1 ring-blue-500/60 bg-background/80">
            <GroupRow
              group={activeDragGroup}
              count={connections.filter(c => c.groupId === activeDragGroup.id).length}
              isOverDrop={false}
              collapsed={activeDragGroup.collapsed}
              onToggle={() => {}} onContextMenu={() => {}}
              ghost
            />
          </div>
        )}
      </DragOverlay>
    </div>
    </DndContext>
  );
}
