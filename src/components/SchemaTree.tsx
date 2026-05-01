import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, ChevronDown, Table2 } from "lucide-react";

interface TableInfo {
  schema: string;
  name: string;
}

interface Props {
  connectionId: string;
  onTableSelect: (schema: string, table: string) => void;
  activeTable: { schema: string; name: string } | null;
}

export function SchemaTree({ connectionId, onTableSelect, activeTable }: Props) {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    invoke<TableInfo[]>("get_tables", { connectionId })
      .then((result) => {
        setTables(result);
        // Auto-expand first schema
        if (result.length > 0) {
          setExpanded(new Set([result[0].schema]));
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [connectionId]);

  const grouped = tables.reduce(
    (acc, t) => {
      if (!acc[t.schema]) acc[t.schema] = [];
      acc[t.schema].push(t.name);
      return acc;
    },
    {} as Record<string, string[]>
  );

  if (loading) {
    return (
      <div className="px-3 py-2 text-xs text-muted-foreground">
        Loading tables...
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-2 text-xs text-destructive">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {Object.entries(grouped).map(([schema, tableNames]) => (
        <div key={schema}>
          <button
            onClick={() =>
              setExpanded((prev) => {
                const next = new Set(prev);
                next.has(schema) ? next.delete(schema) : next.add(schema);
                return next;
              })
            }
            className="flex items-center gap-1 w-full px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wider"
          >
            {expanded.has(schema) ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">{schema}</span>
            <span className="ml-auto opacity-50">{tableNames.length}</span>
          </button>

          {expanded.has(schema) &&
            tableNames.map((name) => {
              const isActive =
                activeTable?.schema === schema && activeTable?.name === name;
              return (
                <button
                  key={name}
                  onClick={() => onTableSelect(schema, name)}
                  className={`flex items-center gap-2 w-full px-6 py-1 text-sm text-left transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Table2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
        </div>
      ))}

      {tables.length === 0 && (
        <p className="px-3 py-2 text-xs text-muted-foreground">No tables found</p>
      )}
    </div>
  );
}
