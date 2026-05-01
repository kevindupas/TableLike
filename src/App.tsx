import { ConnectionList } from "./components/ConnectionList";
import { SchemaTree } from "./components/SchemaTree";
import { useConnectionStore } from "./store/connections";

function App() {
  const { activeConnectionId, activeTable, setActiveTable } = useConnectionStore();

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
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        {activeTable ? (
          <p className="text-sm">
            Selected: {activeTable.schema}.{activeTable.name}
          </p>
        ) : activeConnectionId ? (
          <p className="text-sm">Select a table from the sidebar</p>
        ) : (
          <p className="text-sm">Select a connection to get started</p>
        )}
      </div>
    </div>
  );
}

export default App;
