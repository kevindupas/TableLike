import { useEffect } from "react";
import { useConnectionStore } from "./store/connections";
import { connectDb, getPassword } from "./lib/tauri-commands";

function ConnectionsScreen() {
  return <div className="h-screen bg-background text-foreground flex items-center justify-center text-muted-foreground text-sm">Connections (placeholder)</div>;
}

function DatabaseScreen() {
  return <div className="h-screen bg-background text-foreground flex items-center justify-center text-muted-foreground text-sm">Database (placeholder)</div>;
}

function App() {
  const { activeConnectionId, connectedIds } = useConnectionStore();
  const isConnected = !!activeConnectionId && connectedIds.has(activeConnectionId);

  useEffect(() => {
    const { connections, activeConnectionId, setConnected } = useConnectionStore.getState();
    if (!activeConnectionId) return;
    const conn = connections.find((c) => c.id === activeConnectionId);
    if (!conn) return;

    getPassword(conn.id)
      .catch(() => "")
      .then((password) =>
        connectDb({
          id: conn.id,
          name: conn.name,
          db_type: conn.type,
          host: conn.host,
          port: conn.port,
          database: conn.database,
          username: conn.username,
          password,
          color: conn.color,
        })
      )
      .then(() => setConnected(conn.id, true))
      .catch(() => {});
  }, []); // run once on mount; read store state via getState() to avoid stale closure

  return isConnected ? <DatabaseScreen /> : <ConnectionsScreen />;
}

export default App;
