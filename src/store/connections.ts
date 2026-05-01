import { create } from "zustand";
import { disconnectDb } from "../lib/tauri-commands";

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
  activeTable: { schema: string; name: string } | null;
  connectedIds: Set<string>;
  setActiveConnection: (id: string) => void;
  setActiveTable: (table: { schema: string; name: string } | null) => void;
  addConnection: (conn: Connection) => void;
  removeConnection: (id: string) => void;
  setConnected: (id: string, connected: boolean) => void;
}

export const useConnectionStore = create<ConnectionStore>()((set) => ({
  connections: [],
  activeConnectionId: null,
  activeTable: null,
  connectedIds: new Set<string>(),
  setActiveConnection: (id) => set({ activeConnectionId: id, activeTable: null }),
  setActiveTable: (table) => set({ activeTable: table }),
  addConnection: (conn) =>
    set((state) => ({ connections: [...state.connections, conn] })),
  removeConnection: (id) => {
    disconnectDb(id).catch(() => {});
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
      if (connected) {
        connectedIds.add(id);
      } else {
        connectedIds.delete(id);
      }
      return { connectedIds };
    }),
}));
