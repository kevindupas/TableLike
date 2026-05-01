import { ConnectionList } from "./components/ConnectionList";
import { SchemaTree } from "./components/SchemaTree";
import { MainPanel } from "./components/MainPanel";
import { useConnectionStore } from "./store/connections";

function App() {
  const { activeConnectionId, activeTable, setActiveTable } =
    useConnectionStore();

  function handleTableSelect(schema: string, name: string) {
    setActiveTable({ schema, name });
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
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
        <MainPanel
          connectionId={activeConnectionId}
          initialTable={activeTable ?? undefined}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Select a connection to get started</p>
        </div>
      )}
    </div>
  );
}

export default App;
