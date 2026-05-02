import { create } from "zustand";
import { persist } from "zustand/middleware";
import { disconnectDb, deletePassword } from "../lib/tauri-commands";

export type DbType = "postgresql" | "mysql" | "sqlite";
export type SortBy = "none" | "name" | "driver" | "tag";

export interface ConnectionGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  icon?: string; // base64 data URL, max 64×64px
}

export interface SshConfig {
  host: string;
  port: number;
  username: string;
  authMethod: "key" | "password";
  password?: string;
  privateKeyPath?: string;
  usePasswordAuth: boolean;
  addLegacyKexAlgos: boolean;
  addLegacyHostKeyAlgos: boolean;
}

export interface Connection {
  id: string;
  name: string;
  type: DbType;
  host: string;
  port: number;
  database: string;
  username: string;
  color: string;
  groupId?: string;
  ssh?: SshConfig;
}

interface ConnectionStore {
  connections: Connection[];
  groups: ConnectionGroup[];
  sortBy: SortBy;
  // top-level order: group ids and ungrouped connection ids interleaved
  order: string[];
  activeConnectionId: string | null;
  connectedIds: Set<string>;
  setActiveConnection: (id: string) => void;
  addConnection: (conn: Connection) => void;
  updateConnection: (id: string, patch: Partial<Omit<Connection, "id">>) => void;
  removeConnection: (id: string) => void;
  setConnected: (id: string, connected: boolean) => void;
  setSortBy: (sort: SortBy) => void;
  addGroup: (group: ConnectionGroup) => void;
  updateGroup: (id: string, patch: Partial<Omit<ConnectionGroup, "id">>) => void;
  removeGroup: (id: string) => void;
  toggleGroupCollapsed: (id: string) => void;
  reorder: (newOrder: string[]) => void;
  moveConnectionToGroup: (connId: string, groupId: string | undefined) => void;
  reorderGroupChildren: (groupId: string, newOrder: string[]) => void;
}

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set) => ({
      connections: [],
      groups: [],
      sortBy: "none",
      order: [],
      activeConnectionId: null,
      connectedIds: new Set<string>(),
      setActiveConnection: (id) => set({ activeConnectionId: id }),
      addConnection: (conn) =>
        set((state) => ({
          connections: [...state.connections, conn],
          order: [...state.order, conn.id],
        })),
      updateConnection: (id, patch) =>
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === id ? { ...c, ...patch } : c
          ),
        })),
      removeConnection: (id) => {
        disconnectDb(id).catch(() => {});
        deletePassword(id).catch(() => {});
        set((state) => {
          const connectedIds = new Set(state.connectedIds);
          connectedIds.delete(id);
          return {
            connections: state.connections.filter((c) => c.id !== id),
            order: state.order.filter((o) => o !== id),
            activeConnectionId:
              state.activeConnectionId === id ? null : state.activeConnectionId,
            connectedIds,
          };
        });
      },
      setConnected: (id, connected) =>
        set((state) => {
          const connectedIds = new Set(state.connectedIds);
          if (connected) connectedIds.add(id);
          else connectedIds.delete(id);
          return { connectedIds };
        }),
      setSortBy: (sortBy) => set({ sortBy }),
      addGroup: (group) =>
        set((state) => ({
          groups: [...state.groups, group],
          order: [...state.order, group.id],
        })),
      updateGroup: (id, patch) =>
        set((state) => ({
          groups: state.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),
      removeGroup: (id) =>
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== id),
          order: state.order.filter((o) => o !== id),
          connections: state.connections.map((c) =>
            c.groupId === id ? { ...c, groupId: undefined } : c
          ),
        })),
      toggleGroupCollapsed: (id) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === id ? { ...g, collapsed: !g.collapsed } : g
          ),
        })),
      reorder: (newOrder) => set({ order: newOrder }),
      moveConnectionToGroup: (connId, groupId) =>
        set((state) => ({
          connections: state.connections.map((c) =>
            c.id === connId ? { ...c, groupId } : c
          ),
          // if moving out of group, add to top-level order if not already there
          order: groupId === undefined && !state.order.includes(connId)
            ? [...state.order, connId]
            : groupId !== undefined
            ? state.order.filter((o) => o !== connId)
            : state.order,
        })),
      reorderGroupChildren: (groupId, newOrder) =>
        set((state) => {
          const others = state.connections.filter((c) => c.groupId !== groupId);
          const inGroup = newOrder
            .map((id) => state.connections.find((c) => c.id === id))
            .filter(Boolean) as Connection[];
          return { connections: [...others, ...inGroup] };
        }),
    }),
    {
      name: "tablelike-connections",
      partialize: (state) => ({
        connections: state.connections,
        groups: state.groups,
        sortBy: state.sortBy,
        order: state.order,
        activeConnectionId: state.activeConnectionId,
      }),
    }
  )
);
