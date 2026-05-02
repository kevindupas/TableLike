import { useTabStore } from "../store/tabs";
import { CellValue, QueryColumn } from "./DataGrid";
import { ScrollArea } from "./ui/scroll-area";

export function DetailPanel() {
  const { tabs, activeTabId } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (!activeTab?.result || activeTab.selectedRowIndex === null) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground text-xs p-4 text-center">
        <p>Click a row to see details</p>
      </div>
    );
  }

  const { result, selectedRowIndex } = activeTab;
  const row = result.rows[selectedRowIndex];
  if (!row) return null;

  return (
    <ScrollArea className="flex-1">
      <div className="divide-y">
        {result.columns.map((col, i) => (
          <FieldRow key={col.name} column={col} cell={row[i]} />
        ))}
      </div>
    </ScrollArea>
  );
}

interface FieldRowProps {
  column: QueryColumn;
  cell: CellValue;
}

function FieldRow({ column, cell }: FieldRowProps) {
  const isEmpty = !cell || cell.type === "Null";
  const isGeo = cell?.type === "Geo";
  const isJson =
    cell?.type === "Text" &&
    (cell.value.startsWith("{") || cell.value.startsWith("["));

  return (
    <div className="px-3 py-2 space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium truncate flex-1">{column.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {column.type_name}
        </span>
      </div>
      <div className="text-xs">
        {isEmpty ? (
          <span className="text-muted-foreground/50 italic">NULL</span>
        ) : isGeo ? (
          <pre className="whitespace-pre-wrap break-all text-blue-500 font-mono text-xs max-h-32 overflow-y-auto">
            {cell.value.wkt ?? "geometry"}
          </pre>
        ) : isJson ? (
          <pre className="whitespace-pre-wrap break-all text-muted-foreground font-mono text-xs max-h-32 overflow-y-auto">
            {(() => {
              try {
                return JSON.stringify(JSON.parse(cell.value), null, 2);
              } catch {
                return cell.value;
              }
            })()}
          </pre>
        ) : (
          <span className="break-all">{String(cell.type === "Bool" ? cell.value : (cell as { value: unknown }).value ?? "")}</span>
        )}
      </div>
    </div>
  );
}
