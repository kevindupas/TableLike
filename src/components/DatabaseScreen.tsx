import { ArrowLeft, Code, PanelRight, Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "./ui/button";
import { SchemaTree } from "./SchemaTree";
import { MainPanel } from "./MainPanel";
import { DetailPanel } from "./DetailPanel";
import { useConnectionStore } from "../store/connections";
import { useTabStore } from "../store/tabs";

export function DatabaseScreen() {
  const { connections, activeConnectionId, setConnected } =
    useConnectionStore();
  const { tabs, activeTabId, showDetailPanel, toggleDetailPanel, toggleSqlMode, openTab } = useTabStore();
  const { theme, setTheme } = useTheme();

  const activeConn = connections.find((c) => c.id === activeConnectionId) ?? null;
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const activeTable = activeTab ? { schema: activeTab.schema, name: activeTab.table } : null;

  function handleTableSelect(schema: string, name: string) {
    if (!activeConnectionId) return;
    openTab(activeConnectionId, schema, name);
  }

  function handleDisconnect() {
    if (!activeConnectionId) return;
    setConnected(activeConnectionId, false);
  }

  function cycleTheme() {
    const resolved = theme ?? "system";
    if (resolved === "light") setTheme("dark");
    else if (resolved === "dark") setTheme("system");
    else setTheme("light");
  }

  const selectedTheme = theme ?? "system";

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Toolbar */}
      <div className="h-9 border-b flex items-center gap-2 px-2 shrink-0 bg-background">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleDisconnect}
          title="Back to connections"
          aria-label="Back to connections"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {activeConn && (
          <>
            <div
              className="w-4 h-4 rounded-full shrink-0"
              style={{ backgroundColor: activeConn.color }}
            />
            <span className="text-sm font-medium truncate max-w-xs">
              {activeConn.name}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {activeConn.type === "sqlite"
                ? activeConn.database
                : `${activeConn.host}:${activeConn.port} / ${activeConn.database}`}
            </span>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          {activeTab && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${activeTab.sqlMode ? "text-foreground" : "text-muted-foreground"}`}
              onClick={() => toggleSqlMode(activeTab.id)}
              title="Toggle SQL editor"
              aria-pressed={activeTab.sqlMode}
            >
              <Code className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${showDetailPanel ? "text-foreground" : "text-muted-foreground"}`}
            onClick={toggleDetailPanel}
            title="Toggle detail panel"
            aria-pressed={showDetailPanel}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={cycleTheme}
            title={`Theme: ${selectedTheme}`}
          >
            {selectedTheme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : selectedTheme === "light" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 border-r shrink-0 flex flex-col overflow-hidden">
          {activeConnectionId && (
            <SchemaTree
              connectionId={activeConnectionId}
              onTableSelect={handleTableSelect}
              activeTable={activeTable}
            />
          )}
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <MainPanel />
        </div>

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
