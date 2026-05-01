import { ReactNode } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
} from "@tanstack/react-table";
import { Badge } from "./ui/badge";

export interface QueryColumn {
  name: string;
  type_name: string;
  is_geo: boolean;
}

export interface CellValue {
  type: "Text" | "Number" | "Bool" | "Geo" | "Null";
  value?: string | number | boolean | object;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: CellValue[][];
  total_count: number | null;
  execution_time_ms: number;
}

interface Props {
  result: QueryResult | null;
  onShowMap?: (geoColumnIndex: number) => void;
}

function renderCell(cell: CellValue): ReactNode {
  if (!cell || cell.type === "Null") {
    return <span className="text-muted-foreground/50 italic text-xs">NULL</span>;
  }
  if (cell.type === "Geo") {
    return <span className="text-blue-500 text-xs font-mono">geometry</span>;
  }
  if (cell.type === "Bool") {
    return (
      <span className={cell.value ? "text-green-600" : "text-red-500"}>
        {cell.value ? "true" : "false"}
      </span>
    );
  }
  const str = String(cell.value ?? "");
  return (
    <span className="truncate block max-w-xs" title={str}>
      {str}
    </span>
  );
}

export function DataGrid({ result, onShowMap }: Props) {
  if (!result) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Run a query to see results
      </div>
    );
  }

  if (result.columns.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Query returned no results
      </div>
    );
  }

  const columns: ColumnDef<CellValue[], unknown>[] = result.columns.map(
    (col, i) => ({
      id: `col-${i}`,
      header: () => (
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="font-medium">{col.name}</span>
          <span className="text-xs text-muted-foreground font-normal">
            {col.type_name}
          </span>
          {col.is_geo && (
            <Badge variant="secondary" className="text-xs px-1 py-0">
              geo
            </Badge>
          )}
        </div>
      ),
      cell: ({ row }) => renderCell(row.original[i]),
    })
  );

  const table = useReactTable({
    data: result.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const geoColumns = result.columns
    .map((c, i) => ({ ...c, index: i }))
    .filter((c) => c.is_geo);

  return (
    <div className="flex flex-col flex-1 overflow-hidden border rounded-md">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/20 text-xs text-muted-foreground shrink-0">
        <span>
          {result.rows.length} rows · {result.execution_time_ms}ms
        </span>
        {geoColumns.length > 0 && onShowMap && (
          <button
            onClick={() => onShowMap(geoColumns[0].index)}
            className="text-blue-500 hover:text-blue-600 flex items-center gap-1"
          >
            🌍 Show on Map
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-muted/40 sticky top-0 z-10">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                <th className="w-8 px-2 py-1.5 text-left text-xs text-muted-foreground border-b font-normal">
                  #
                </th>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className="px-3 py-1.5 text-left border-b border-r last:border-r-0"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, rowIdx) => (
              <tr
                key={row.id}
                className="hover:bg-muted/20 border-b last:border-b-0"
              >
                <td className="w-8 px-2 py-1 text-xs text-muted-foreground/50 select-none">
                  {rowIdx + 1}
                </td>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-3 py-1 border-r last:border-r-0 max-w-xs"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
