import { useEffect } from "react";
import { useConnectionStore } from "./store/connections";
import { connectDb, getPassword, getSshPassword } from "./lib/tauri-commands";
import { ConnectionsScreen } from "./components/ConnectionsScreen";
import { DatabaseScreen } from "./components/DatabaseScreen";

function App() {
  const { activeConnectionId, connectedIds } = useConnectionStore();
  const isConnected = !!activeConnectionId && connectedIds.has(activeConnectionId);

  useEffect(() => {
    const { connections, activeConnectionId, setConnected } = useConnectionStore.getState();
    if (!activeConnectionId) return;
    const conn = connections.find((c) => c.id === activeConnectionId);
    if (!conn) return;

    const autoReconnect = async () => {
      const password = await getPassword(conn.id).catch(() => "");
      const sshPassword = conn.ssh?.authMethod === "password"
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
      });
      setConnected(conn.id, true);
    };
    autoReconnect().catch(() => {});
  }, []); // run once on mount; read store state via getState() to avoid stale closure

  return isConnected ? <DatabaseScreen /> : <ConnectionsScreen />;
}

export default App;
