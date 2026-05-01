import { create } from "zustand";
import { persist } from "zustand/middleware";
import { disconnectDb, deletePassword } from "../lib/tauri-commands";

export type DbType = "postgresql" | "mysql" | "sqlite";

export interface Connection {
  id: string;
  name: string;
  type: DbType;
  host: string;
  port: number;
  database: string;
  username: string;
  color: string;
}

interface ConnectionStore {
  connections: Connection[];
  activeConnectionId: string | null;
  connectedIds: Set<string>;
  setActiveConnection: (id: string) => void;
  addConnection: (conn: Connection) => void;
  updateConnection: (id: string, patch: Partial<Omit<Connection, "id">>) => void;
  removeConnection: (id: string) => void;
  setConnected: (id: string, connected: boolean) => void;
}

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set) => ({
      connections: [],
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
    }),
    {
      name: "tablelike-connections",
      partialize: (state) => ({
        connections: state.connections,
        activeConnectionId: state.activeConnectionId,
      }),
    }
  )
);
