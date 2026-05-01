import { invoke } from "@tauri-apps/api/core";

export interface RustConnectionConfig {
  id: string;
  name: string;
  db_type: "postgresql" | "mysql" | "sqlite";
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  color: string;
}

export async function connectDb(config: RustConnectionConfig): Promise<string> {
  return invoke<string>("connect_db", { config });
}

export async function disconnectDb(connectionId: string): Promise<void> {
  return invoke<void>("disconnect_db", { connectionId });
}

export async function checkConnection(connectionId: string): Promise<boolean> {
  return invoke<boolean>("check_connection", { connectionId });
}
