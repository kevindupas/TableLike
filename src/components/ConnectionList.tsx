import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ConnectionItem } from "./ConnectionItem";
import { useConnectionStore } from "../store/connections";
import { NewConnectionDialog } from "./NewConnectionDialog";

export function ConnectionList() {
  const { connections, activeConnectionId, connectedIds, setActiveConnection } =
    useConnectionStore();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = connections.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col bg-background border-b">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search connection..."
            className="pl-8 h-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.map((conn) => (
          <ConnectionItem
            key={conn.id}
            connection={conn}
            isActive={conn.id === activeConnectionId}
            isConnected={connectedIds.has(conn.id)}
            onClick={() => setActiveConnection(conn.id)}
          />
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">
            No connections yet
          </p>
        )}
      </div>

      <div className="p-3 border-t">
        <Button
          variant="outline"
          className="w-full gap-2"
          size="sm"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Create connection
        </Button>
      </div>

      <NewConnectionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
