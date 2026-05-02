import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Search, HardDrive, RotateCcw, Plus, ChevronDown, ChevronRight } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useConnectionStore, Connection, ConnectionGroup, SortBy } from "../store/connections";
import { NewConnectionDialog } from "./NewConnectionDialog";
import { EditConnectionDialog } from "./EditConnectionDialog";
import { ConnectionContextMenu } from "./ConnectionContextMenu";
import { GroupContextMenu } from "./GroupContextMenu";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { EditGroupDialog } from "./EditGroupDialog";
import { ExportDialog } from "./ExportDialog";
import { ImportDialog } from "./ImportDialog";
import { connectDb, getPassword } from "../lib/tauri-commands";

const DB_LABELS: Record<string, string> = { postgresql: "Pg", mysql: "My", sqlite: "Sl" };

type ExportScope = "all" | "group" | "single";

// ── Sortable connection row ──────────────────────────────────────────────────

interface ConnRowProps {
  conn: Connection;
  indent?: boolean;
  isActive: boolean;
  isConn: boolean;
  isLoading: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  dragOverlay?: boolean;
}

function ConnRow({
  conn,
  indent,
  isActive,
  isConn,
  isLoading,
  onClick,
  onDoubleClick,
  onContextMenu,
  dragOverlay,
}: ConnRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: conn.id, disabled: dragOverlay });

  const style = dragOverlay
    ? {}
    : {
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
        opacity: isDragging ? 0.3 : 1,
      };

  return (
    <div ref={dragOverlay ? undefined : setNodeRef} style={style}>
      <button
        {...(dragOverlay ? {} : { ...attributes, ...listeners })}
        onDoubleClick={onDoubleClick}
        onClick={onClick}
        onContextMenu={onContextMenu}
        disabled={isLoading}
        className={`flex items-center gap-2 w-full py-2.5 rounded text-left transition-colors cursor-grab active:cursor-grabbing ${
          indent ? "pl-8 pr-4" : "px-4"
        } ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"}`}
      >
        <div className="relative shrink-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[14px]"
            style={{ backgroundColor: conn.color }}
          >
            {isLoading ? "…" : DB_LABELS[conn.type]}
          </div>
          {isConn && (
            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-background" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold truncate">{conn.name}</span>
            <span
              className="text-[11px] px-1 rounded font-medium shrink-0"
              style={{ backgroundColor: conn.color + "28", color: conn.color }}
            >
              {conn.type === "sqlite" ? "file" : "local"}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground truncate italic">
            {conn.type === "sqlite" ? conn.database : `${conn.host}:${conn.port}`}
          </div>
        </div>
      </button>
    </div>
  );
}

// ── Droppable group header ───────────────────────────────────────────────────

interface GroupHeaderProps {
  group: ConnectionGroup;
  count: number;
  isOver: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  dragHandleProps?: Record<string, unknown>;
  dragRef?: (el: HTMLElement | null) => void;
  dragStyle?: React.CSSProperties;
}

function GroupHeader({
  group,
  count,
  isOver,
  collapsed,
  onToggle,
  onContextMenu,
  dragHandleProps,
  dragRef,
  dragStyle,
}: GroupHeaderProps) {
  return (
    <div
      ref={dragRef}
      style={dragStyle}
      className={`flex items-center gap-1.5 w-full px-2 py-1 rounded transition-colors ${
        isOver ? "bg-blue-500/20 ring-1 ring-blue-500" : "hover:bg-muted/40"
      }`}
      onContextMenu={onContextMenu}
    >
      <div {...(dragHandleProps ?? {})} className="flex items-center gap-1.5 flex-1 cursor-grab active:cursor-grabbing min-w-0" onClick={onToggle}>
        {collapsed
          ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        }
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
        <span className="text-xs font-medium text-muted-foreground truncate">{group.name}</span>
        <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">{count}</span>
      </div>
    </div>
  );
}

// ── Sortable group (header + children) ──────────────────────────────────────

interface SortableGroupProps {
  group: ConnectionGroup;
  children: Connection[];
  isOverGroup: boolean;
  connectedIds: Set<string>;
  connecting: string | null;
  activeConnectionId: string | null;
  onConnect: (c: Connection) => void;
  onSelect: (c: Connection) => void;
  onConnContextMenu: (e: React.MouseEvent, c: Connection) => void;
  onGroupContextMenu: (e: React.MouseEvent, g: ConnectionGroup) => void;
  onToggle: () => void;
}

function SortableGroup({
  group,
  children,
  isOverGroup,
  connectedIds,
  connecting,
  activeConnectionId,
  onConnect,
  onSelect,
  onConnContextMenu,
  onGroupContextMenu,
  onToggle,
}: SortableGroupProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const childIds = children.map((c) => c.id);

  return (
    <div ref={setNodeRef} style={style}>
      <GroupHeader
          group={group}
          count={children.length}
          isOver={isOverGroup}
          collapsed={group.collapsed}
          onToggle={onToggle}
          onContextMenu={(e) => { e.preventDefault(); onGroupContextMenu(e, group); }}
          dragHandleProps={{ ...attributes, ...listeners }}
        />

      {!group.collapsed && (
        <SortableContext items={childIds} strategy={verticalListSortingStrategy}>
          {children.map((conn) => (
            <ConnRow
              key={conn.id}
              conn={conn}
              indent
              isActive={conn.id === activeConnectionId}
              isConn={connectedIds.has(conn.id)}
              isLoading={connecting === conn.id}
              onClick={() => onSelect(conn)}
              onDoubleClick={() => onConnect(conn)}
              onContextMenu={(e) => { e.preventDefault(); onConnContextMenu(e, conn); }}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────

export function ConnectionsScreen() {
  const {
    connections,
    groups,
    sortBy,
    order,
    activeConnectionId,
    connectedIds,
    setActiveConnection,
    setConnected,
    removeConnection,
    removeGroup,
    addConnection,
    addGroup,
    updateGroup,
    setSortBy,
    toggleGroupCollapsed,
    reorder,
    moveConnectionToGroup,
    reorderGroupChildren,
  } = useConnectionStore();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editConn, setEditConn] = useState<Connection | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<ConnectionGroup | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportState, setExportState] = useState<{ open: boolean; scope: ExportScope; groupId?: string; connId?: string }>({ open: false, scope: "all" });
  const [connContextMenu, setConnContextMenu] = useState<{ conn: Connection; x: number; y: number } | null>(null);
  const [groupContextMenu, setGroupContextMenu] = useState<{ group: ConnectionGroup; x: number; y: number } | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    win.setResizable(false);
    win.setMaximizable(false);
    return () => {
      win.setResizable(true);
      win.setMaximizable(true);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  async function handleConnect(conn: Connection) {
    if (connectedIds.has(conn.id)) { setActiveConnection(conn.id); return; }
    setConnecting(conn.id);
    setConnectError(null);
    try {
      const password = await getPassword(conn.id).catch(() => "");
      await connectDb({ id: conn.id, name: conn.name, db_type: conn.type, host: conn.host, port: conn.port, database: conn.database, username: conn.username, password, color: conn.color });
      setConnected(conn.id, true);
      setActiveConnection(conn.id);
    } catch (e) {
      setConnectError(String(e));
    } finally {
      setConnecting(null);
    }
  }

  // Build ordered list respecting order array, filtered by search
  const searchLower = search.toLowerCase();
  const filteredConnIds = new Set(
    connections.filter((c) => c.name.toLowerCase().includes(searchLower)).map((c) => c.id)
  );

  // Ensure all items are in order (new items appended at end)
  const allIds = [...new Set([...order, ...groups.map((g) => g.id), ...connections.filter((c) => !c.groupId).map((c) => c.id)])];

  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const connMap = new Map(connections.map((c) => [c.id, c]));

  function getGroupChildren(groupId: string): Connection[] {
    return connections.filter((c) => c.groupId === groupId && filteredConnIds.has(c.id));
  }

  // Top-level ordered items (groups + ungrouped connections)
  const topLevelIds = allIds.filter((id) => {
    if (groupMap.has(id)) return true;
    const c = connMap.get(id);
    return c && !c.groupId && filteredConnIds.has(c.id);
  });

  // Active dragged item info
  const activeDragConn = activeId ? connMap.get(activeId) : null;
  const activeDragGroup = activeId ? groupMap.get(activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) { setDragOverGroupId(null); return; }
    const activeId = String(active.id);
    const overId = String(over.id);
    const draggedConn = connMap.get(activeId);
    if (!draggedConn) { setDragOverGroupId(null); return; }
    // Hovering over a group header → highlight it
    if (groupMap.has(overId)) {
      setDragOverGroupId(overId);
    // Hovering over a child conn inside a group → highlight that group
    } else {
      const overConn = connMap.get(overId);
      setDragOverGroupId(overConn?.groupId ?? null);
    }
  }, [connMap, groupMap]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setDragOverGroupId(null);
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const draggedConn = connMap.get(activeId);
    const overConn = connMap.get(overId);
    const overGroup = groupMap.get(overId);

    // Dragging a connection
    if (draggedConn) {
      // Drop ON a group header → move into that group
      if (overGroup) {
        if (draggedConn.groupId !== overGroup.id) {
          moveConnectionToGroup(activeId, overGroup.id);
        }
        return;
      }

      // Drop ON a sibling inside same group → reorder within group
      if (overConn && draggedConn.groupId && draggedConn.groupId === overConn.groupId) {
        const groupId = draggedConn.groupId;
        const groupChildren = connections.filter((c) => c.groupId === groupId);
        const oldIdx = groupChildren.findIndex((c) => c.id === activeId);
        const newIdx = groupChildren.findIndex((c) => c.id === overId);
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          reorderGroupChildren(groupId, arrayMove(groupChildren, oldIdx, newIdx).map((c) => c.id));
        }
        return;
      }

      // Drop ON a top-level item (ungrouped conn or group) while dragged item is inside a group → exit group
      if (draggedConn.groupId && topLevelIds.includes(overId)) {
        moveConnectionToGroup(activeId, undefined);
        const newTopLevel = [...topLevelIds, activeId];
        const withoutActive = newTopLevel.filter((id) => id !== activeId);
        const overIdx = withoutActive.indexOf(overId);
        withoutActive.splice(overIdx + 1, 0, activeId);
        reorder(withoutActive);
        return;
      }

      // Reorder top-level ungrouped connections
      if (!draggedConn.groupId && topLevelIds.includes(activeId) && topLevelIds.includes(overId) && activeId !== overId) {
        const oldIdx = topLevelIds.indexOf(activeId);
        const newIdx = topLevelIds.indexOf(overId);
        reorder(arrayMove(topLevelIds, oldIdx, newIdx));
      }
      return;
    }

    // Dragging a group → reorder top-level
    if (groupMap.has(activeId) && topLevelIds.includes(overId) && activeId !== overId) {
      const oldIdx = topLevelIds.indexOf(activeId);
      const newIdx = topLevelIds.indexOf(overId);
      reorder(arrayMove(topLevelIds, oldIdx, newIdx));
    }
  }, [connMap, groupMap, topLevelIds, connections, moveConnectionToGroup, reorder, reorderGroupChildren]);

  return (
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
          <button className="flex items-center justify-center gap-1.5 w-full px-2 py-2 rounded-md text-sm text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground transition-colors">
            <HardDrive className="h-3.5 w-3.5 shrink-0" />Backup database...
          </button>
          <button className="flex items-center justify-center gap-1.5 w-full px-2 py-2 rounded-md text-sm text-muted-foreground bg-muted/50 hover:bg-muted hover:text-foreground transition-colors">
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

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {connectError && (
            <div className="mb-2 px-2 py-1.5 rounded bg-destructive/10 border border-destructive/20">
              <p className="text-[10px] text-destructive">{connectError}</p>
              <button onClick={() => setConnectError(null)} className="text-[10px] underline text-muted-foreground">Dismiss</button>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
              {topLevelIds.map((id) => {
                const group = groupMap.get(id);
                if (group) {
                  const children = getGroupChildren(group.id);
                  return (
                    <SortableGroup
                      key={group.id}
                      group={group}
                      children={children}
                      isOverGroup={dragOverGroupId === group.id}
                      connectedIds={connectedIds}
                      connecting={connecting}
                      activeConnectionId={activeConnectionId}
                      onConnect={handleConnect}
                      onSelect={(c) => { setActiveConnection(c.id); setConnectError(null); }}
                      onConnContextMenu={(e, c) => setConnContextMenu({ conn: c, x: e.clientX, y: e.clientY })}
                      onGroupContextMenu={(e, g) => setGroupContextMenu({ group: g, x: e.clientX, y: e.clientY })}
                      onToggle={() => toggleGroupCollapsed(group.id)}
                    />
                  );
                }
                const conn = connMap.get(id);
                if (!conn) return null;
                return (
                  <ConnRow
                    key={conn.id}
                    conn={conn}
                    isActive={conn.id === activeConnectionId}
                    isConn={connectedIds.has(conn.id)}
                    isLoading={connecting === conn.id}
                    onClick={() => { setActiveConnection(conn.id); setConnectError(null); }}
                    onDoubleClick={() => handleConnect(conn)}
                    onContextMenu={(e) => { e.preventDefault(); setConnContextMenu({ conn, x: e.clientX, y: e.clientY }); }}
                  />
                );
              })}
            </SortableContext>

            <DragOverlay>
              {activeDragConn && (
                <ConnRow
                  conn={activeDragConn}
                  indent={false}
                  isActive={false}
                  isConn={connectedIds.has(activeDragConn.id)}
                  isLoading={false}
                  onClick={() => {}}
                  onDoubleClick={() => {}}
                  onContextMenu={() => {}}
                  dragOverlay
                />
              )}
              {activeDragGroup && (
                <div className="px-2 py-1 rounded bg-muted/80 border text-xs font-medium flex items-center gap-2 shadow-lg">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: activeDragGroup.color }} />
                  {activeDragGroup.name}
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {connections.length === 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-6">No connections yet</p>
          )}
          {connections.length > 0 && topLevelIds.length === 0 && search && (
            <p className="text-[10px] text-muted-foreground text-center py-6">No results</p>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <NewConnectionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
      <EditConnectionDialog conn={editConn} onClose={() => setEditConn(null)} />
      <CreateGroupDialog
        open={groupDialogOpen}
        onClose={() => setGroupDialogOpen(false)}
        onCreate={(name, color) => addGroup({ id: crypto.randomUUID(), name, color, collapsed: false })}
      />
      <EditGroupDialog
        group={editGroup}
        onClose={() => setEditGroup(null)}
        onSave={(id, name, color) => updateGroup(id, { name, color })}
      />
      <ExportDialog
        open={exportState.open}
        scope={exportState.scope}
        groupId={exportState.groupId}
        connId={exportState.connId}
        onClose={() => setExportState({ open: false, scope: "all" })}
      />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />

      {/* Connection context menu */}
      {connContextMenu && (
        <ConnectionContextMenu
          conn={connContextMenu.conn}
          x={connContextMenu.x}
          y={connContextMenu.y}
          onClose={() => setConnContextMenu(null)}
          onConnect={() => handleConnect(connContextMenu.conn)}
          onEdit={() => setEditConn(connContextMenu.conn)}
          onDuplicate={() => {
            const src = connContextMenu.conn;
            addConnection({ ...src, id: crypto.randomUUID(), name: `${src.name} copy` });
          }}
          onDelete={() => removeConnection(connContextMenu.conn.id)}
          onNewConnection={() => setDialogOpen(true)}
          onNewGroup={() => setGroupDialogOpen(true)}
          onSortBy={(s: SortBy) => setSortBy(s)}
          currentSort={sortBy}
          onImport={() => setImportOpen(true)}
          onExportAll={() => setExportState({ open: true, scope: "all" })}
          onExportGroup={() => setExportState({ open: true, scope: "group", groupId: connContextMenu.conn.groupId })}
          onExportSingle={() => setExportState({ open: true, scope: "single", connId: connContextMenu.conn.id })}
        />
      )}

      {/* Group context menu */}
      {groupContextMenu && (
        <GroupContextMenu
          group={groupContextMenu.group}
          x={groupContextMenu.x}
          y={groupContextMenu.y}
          onClose={() => setGroupContextMenu(null)}
          onEdit={() => setEditGroup(groupContextMenu.group)}
          onNewConnection={() => setDialogOpen(true)}
          onNewGroup={() => setGroupDialogOpen(true)}
          onExportGroup={() => setExportState({ open: true, scope: "group", groupId: groupContextMenu.group.id })}
          onDelete={() => removeGroup(groupContextMenu.group.id)}
        />
      )}
    </div>
  );
}
