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
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_auth_method?: "key" | "password";
  ssh_password?: string;
  ssh_private_key_path?: string;
  ssh_use_password_auth?: boolean;
  ssh_add_legacy_kex?: boolean;
  ssh_add_legacy_host_key?: boolean;
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

export async function savePassword(connectionId: string, password: string): Promise<void> {
  return invoke<void>("save_password", { connectionId, password });
}

export async function getPassword(connectionId: string): Promise<string> {
  return invoke<string>("get_password", { connectionId });
}

export async function deletePassword(connectionId: string): Promise<void> {
  return invoke<void>("delete_password", { connectionId });
}

export async function exportConnections(
  payload: unknown,
  password: string,
  path: string,
): Promise<void> {
  return invoke<void>("export_connections", { payload, password, path });
}

export async function importConnections(
  path: string,
  password: string,
): Promise<unknown> {
  return invoke<unknown>("import_connections", { path, password });
}

export async function saveSshPassword(connectionId: string, password: string): Promise<void> {
  return invoke<void>("save_password", { connectionId: `ssh-${connectionId}`, password });
}

export async function getSshPassword(connectionId: string): Promise<string> {
  return invoke<string>("get_password", { connectionId: `ssh-${connectionId}` });
}

export async function deleteSshPassword(connectionId: string): Promise<void> {
  return invoke<void>("delete_password", { connectionId: `ssh-${connectionId}` });
}
