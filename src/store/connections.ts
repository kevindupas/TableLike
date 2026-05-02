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
}

interface ConnectionStore {
  connections: Connection[];
  groups: ConnectionGroup[];
  sortBy: SortBy;
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
}

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set) => ({
      connections: [],
      groups: [],
      sortBy: "none",
      activeConnectionId: null,
      connectedIds: new Set<string>(),
      setActiveConnection: (id) => set({ activeConnectionId: id }),
      addConnection: (conn) =>
        set((state) => ({ connections: [...state.connections, conn] })),
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
        set((state) => ({ groups: [...state.groups, group] })),
      updateGroup: (id, patch) =>
        set((state) => ({
          groups: state.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),
      removeGroup: (id) =>
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== id),
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
    }),
    {
      name: "tablelike-connections",
      partialize: (state) => ({
        connections: state.connections,
        groups: state.groups,
        sortBy: state.sortBy,
        activeConnectionId: state.activeConnectionId,
      }),
    }
  )
);
