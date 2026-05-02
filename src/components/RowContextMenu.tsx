import { useEffect, useRef } from "react";
import { CellValue, QueryColumn } from "./DataGrid";

interface Props {
  x: number;
  y: number;
  row: CellValue[];
  columns: QueryColumn[];
  rowIndex: number;
  onClose: () => void;
  onShowMap: (geoColIndex: number) => void;
  onFilterBy: (column: string, value: string) => void;
}

export function RowContextMenu({ x, y, row, columns, onClose, onShowMap, onFilterBy }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Adjust position so menu doesn't overflow viewport
  const menuWidth = 200;
  const menuHeight = 200;
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
  const adjustedY = y + menuHeight > window.innerHeight ? y - menuHeight : y;

  const geoCol = columns.findIndex((c) => c.is_geo);
  const geoCell = geoCol !== -1 ? row[geoCol] : undefined;
  const hasGeo = geoCell?.type === "Geo";

  function cellText(cell: CellValue): string {
    if (!cell || cell.type === "Null") return "";
    if (cell.type === "Geo") return cell.value.wkt ?? "";
    if (cell.type === "Bool") return cell.value ? "true" : "false";
    return String(cell.value ?? "");
  }

  function copyRow(format: "json" | "csv") {
    if (format === "json") {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => {
        const cell = row[i];
        if (!cell || cell.type === "Null") obj[col.name] = null;
        else if (cell.type === "Geo") obj[col.name] = cell.value.wkt ?? null;
        else obj[col.name] = cell.value;
      });
      navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
    } else {
      const vals = row.map(cellText).map((v) =>
        v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v
      );
      navigator.clipboard.writeText(vals.join(","));
    }
    onClose();
  }

  const menuItems: Array<{ label: string; action: () => void; divider?: boolean } | { divider: true; label?: never; action?: never }> = [
    ...(hasGeo ? [{ label: "🌍 Show on Map", action: () => { onShowMap(geoCol); onClose(); } }, { divider: true as const }] : []),
    {
      label: "Copy row as JSON",
      action: () => copyRow("json"),
    },
    {
      label: "Copy row as CSV",
      action: () => copyRow("csv"),
    },
    { divider: true as const },
    ...columns
      .map((col, i) => {
        const cell = row[i];
        const val = cellText(cell);
        if (!val || cell?.type === "Null" || cell?.type === "Geo") return null;
        return {
          label: `Filter: ${col.name} = "${val.length > 20 ? val.slice(0, 20) + "…" : val}"`,
          action: () => { onFilterBy(col.name, val); onClose(); },
        };
      })
      .filter((item): item is { label: string; action: () => void } => item !== null)
      .slice(0, 3),
  ];

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-popover border rounded shadow-lg py-1 min-w-48 text-sm"
      style={{ left: adjustedX, top: adjustedY }}
    >
      {menuItems.map((item, i) =>
        item.divider ? (
          <div key={i} className="my-1 border-t" />
        ) : (
          <button
            key={i}
            className="w-full text-left px-3 py-1.5 hover:bg-accent hover:text-accent-foreground truncate"
            onClick={item.action}
          >
            {item.label}
          </button>
        )
      )}
    </div>
  );
}
