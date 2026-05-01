import { useEffect } from "react";
import { ConnectionList } from "./components/ConnectionList";
import { SchemaTree } from "./components/SchemaTree";
import { MainPanel } from "./components/MainPanel";
import { Toolbar } from "./components/Toolbar";
import { DetailPanel } from "./components/DetailPanel";
import { useConnectionStore } from "./store/connections";
import { useTabStore } from "./store/tabs";
import { connectDb, getPassword } from "./lib/tauri-commands";

function App() {
  const { activeConnectionId } = useConnectionStore();
  const { openTab, showDetailPanel, tabs, activeTabId } = useTabStore();

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
      .catch(() => {
        // Connection failed — stay disconnected silently
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  function handleTableSelect(schema: string, name: string) {
    if (!activeConnectionId) return;
    openTab(activeConnectionId, schema, name);
  }

  const activeTable = activeTab
    ? { schema: activeTab.schema, name: activeTab.table }
    : null;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="flex flex-col w-60 border-r shrink-0">
          <ConnectionList />
          {activeConnectionId && (
            <SchemaTree
              connectionId={activeConnectionId}
              onTableSelect={handleTableSelect}
              activeTable={activeTable}
            />
          )}
        </div>

        {/* Main area */}
        {activeConnectionId ? (
          <MainPanel />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Select a connection to get started</p>
          </div>
        )}

        {/* Detail panel */}
        {showDetailPanel && activeTab && (
          <div className="w-72 border-l shrink-0 flex flex-col">
            <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground">
              Row Detail
            </div>
            <DetailPanel />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
