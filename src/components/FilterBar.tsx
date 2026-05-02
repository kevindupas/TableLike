import { X, Plus, Play, Download } from "lucide-react";
import { useTabStore, FilterRule, FilterOperator } from "../store/tabs";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const OPERATORS: FilterOperator[] = [
  "=", "<>", "<", ">", "<=", ">=",
  "IN", "NOT IN",
  "IS NULL", "IS NOT NULL",
  "BETWEEN", "NOT BETWEEN",
  "LIKE", "ILIKE",
  "Contains", "Not contains",
  "Contains CI", "Not contains CI",
  "Has prefix", "Has suffix",
  "Has prefix CI", "Has suffix CI",
];

const NO_VALUE_OPS: FilterOperator[] = ["IS NULL", "IS NOT NULL"];
const TWO_VALUE_OPS: FilterOperator[] = ["BETWEEN", "NOT BETWEEN"];

interface Props {
  tabId: string;
}

export function FilterBar({ tabId }: Props) {
  const {
    tabs,
    addFilter,
    removeFilter,
    updateFilter,
    runTabQuery,
  } = useTabStore();

  const tabMaybe = tabs.find((t) => t.id === tabId);
  if (!tabMaybe) return null;

  const tab = tabMaybe;
  const columns = tab.result?.columns ?? [];

  function handleExport() {
    if (!tab.result) return;
    const header = tab.result.columns.map((c) => c.name).join(",");
    const rows = tab.result.rows.map((row) =>
      row
        .map((cell) => {
          if (!cell || cell.type === "Null") return "";
          if (cell.type === "Geo") return "[geometry]";
          const v = String(cell.value ?? "");
          return v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tab.table}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  return (
    <div className="border-b bg-muted/10 px-3 py-2 flex flex-col gap-2 shrink-0">
      {tab.filters.length === 0 && (
        <p className="text-xs text-muted-foreground">No filters. Click + to add one.</p>
      )}
      {tab.filters.map((rule) => (
        <FilterRow
          key={rule.id}
          rule={rule}
          columns={columns.map((c) => c.name)}
          onChange={(partial) => updateFilter(tabId, rule.id, partial)}
          onRemove={() => removeFilter(tabId, rule.id)}
        />
      ))}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => addFilter(tabId)}
        >
          <Plus className="h-3 w-3" /> Add filter
        </Button>
        {tab.filters.length > 0 && (
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => runTabQuery(tabId)}
          >
            <Play className="h-3 w-3" /> Apply
          </Button>
        )}
        {tab.result && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 ml-auto"
            onClick={handleExport}
          >
            <Download className="h-3 w-3" /> Export CSV
          </Button>
        )}
      </div>
    </div>
  );
}

interface FilterRowProps {
  rule: FilterRule;
  columns: string[];
  onChange: (partial: Partial<FilterRule>) => void;
  onRemove: () => void;
}

function FilterRow({ rule, columns, onChange, onRemove }: FilterRowProps) {
  const noValue = NO_VALUE_OPS.includes(rule.operator);
  const twoValues = TWO_VALUE_OPS.includes(rule.operator);

  return (
    <div className="flex items-center gap-2">
      {/* Column selector */}
      <select
        aria-label="Filter column"
        className="h-7 text-xs border rounded bg-background px-2 min-w-32"
        value={rule.column}
        onChange={(e) => onChange({ column: e.target.value })}
      >
        <option value="">Column…</option>
        {columns.map((col) => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>

      {/* Operator selector */}
      <select
        aria-label="Filter operator"
        className="h-7 text-xs border rounded bg-background px-2 min-w-36"
        value={rule.operator}
        onChange={(e) => onChange({ operator: e.target.value as FilterOperator })}
      >
        {OPERATORS.map((op) => (
          <option key={op} value={op}>{op}</option>
        ))}
      </select>

      {/* Value input(s) */}
      {!noValue && (
        <Input
          className="h-7 text-xs w-36"
          placeholder={twoValues ? "From" : "Value"}
          value={rule.value}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      )}
      {twoValues && (
        <Input
          className="h-7 text-xs w-36"
          placeholder="To"
          value={rule.value2}
          onChange={(e) => onChange({ value2: e.target.value })}
        />
      )}

      <button
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive ml-auto"
        aria-label="Remove filter"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
