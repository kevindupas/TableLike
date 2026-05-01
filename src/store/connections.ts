import { create } from "zustand";

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
  setActiveConnection: (id: string) => void;
  addConnection: (conn: Connection) => void;
  removeConnection: (id: string) => void;
}

export const useConnectionStore = create<ConnectionStore>()((set) => ({
  connections: [],
  activeConnectionId: null,
  setActiveConnection: (id) => set({ activeConnectionId: id }),
  addConnection: (conn) =>
    set((state) => ({ connections: [...state.connections, conn] })),
  removeConnection: (id) =>
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
      activeConnectionId:
        state.activeConnectionId === id ? null : state.activeConnectionId,
    })),
}));
