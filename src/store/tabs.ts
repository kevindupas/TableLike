import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type { QueryResult } from "../components/DataGrid";

export type FilterOperator =
  | "=" | "<>" | "<" | ">" | "<=" | ">="
  | "IN" | "NOT IN"
  | "IS NULL" | "IS NOT NULL"
  | "BETWEEN" | "NOT BETWEEN"
  | "LIKE" | "ILIKE"
  | "Contains" | "Not contains"
  | "Contains CI" | "Not contains CI"
  | "Has prefix" | "Has suffix"
  | "Has prefix CI" | "Has suffix CI";

export interface FilterRule {
  id: string;
  column: string;
  operator: FilterOperator;
  value: string;
  value2: string;
}

export interface Tab {
  id: string;
  connectionId: string;
  schema: string;
  table: string;
  label: string;
  sql: string;
  result: QueryResult | null;
  selectedRowIndex: number | null;
  loading: boolean;
  error: string | null;
  filters: FilterRule[];
  showFilterBar: boolean;
  sqlMode: boolean;
  limit: number;
  offset: number;
}

interface TabStore {
  tabs: Tab[];
  activeTabId: string | null;
  showDetailPanel: boolean;
  openTab: (connectionId: string, schema: string, table: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, partial: Partial<Tab>) => void;
  runTabQuery: (id: string) => Promise<void>;
  toggleDetailPanel: () => void;
  addFilter: (tabId: string) => void;
  removeFilter: (tabId: string, filterId: string) => void;
  updateFilter: (tabId: string, filterId: string, partial: Partial<FilterRule>) => void;
  toggleFilterBar: (tabId: string) => void;
  toggleSqlMode: (tabId: string) => void;
  setLimit: (tabId: string, limit: number) => void;
  nextPage: (tabId: string) => void;
  prevPage: (tabId: string) => void;
}

function buildWhereClause(filters: FilterRule[]): string {
  const active = filters.filter((f) => f.column && f.operator);
  if (active.length === 0) return "";

  const clauses = active.map((f) => {
    const col = `"${f.column}"`;
    switch (f.operator) {
      case "IS NULL": return `${col} IS NULL`;
      case "IS NOT NULL": return `${col} IS NOT NULL`;
      case "IN": return `${col} IN (${f.value})`;
      case "NOT IN": return `${col} NOT IN (${f.value})`;
      case "BETWEEN": return `${col} BETWEEN '${f.value.replace(/'/g, "''")}' AND '${f.value2.replace(/'/g, "''")}'`;
      case "NOT BETWEEN": return `${col} NOT BETWEEN '${f.value.replace(/'/g, "''")}' AND '${f.value2.replace(/'/g, "''")}'`;
      case "Contains": return `${col} LIKE '%${f.value.replace(/'/g, "''")}%'`;
      case "Not contains": return `${col} NOT LIKE '%${f.value.replace(/'/g, "''")}%'`;
      case "Contains CI": return `${col} ILIKE '%${f.value.replace(/'/g, "''")}%'`;
      case "Not contains CI": return `${col} NOT ILIKE '%${f.value.replace(/'/g, "''")}%'`;
      case "Has prefix": return `${col} LIKE '${f.value.replace(/'/g, "''")}%'`;
      case "Has suffix": return `${col} LIKE '%${f.value.replace(/'/g, "''")}'`;
      case "Has prefix CI": return `${col} ILIKE '${f.value.replace(/'/g, "''")}%'`;
      case "Has suffix CI": return `${col} ILIKE '%${f.value.replace(/'/g, "''")}'`;
      default: return `${col} ${f.operator} '${f.value.replace(/'/g, "''")}'`;
    }
  });

  return "WHERE " + clauses.join(" AND ");
}

export const useTabStore = create<TabStore>()(
  persist(
    (set, get) => ({
  tabs: [],
  activeTabId: null,
  showDetailPanel: true,

  openTab: (connectionId, schema, table) => {
    const existing = get().tabs.find(
      (t) =>
        t.connectionId === connectionId &&
        t.schema === schema &&
        t.table === table
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    const id = crypto.randomUUID();
    const sql = `SELECT * FROM "${schema}"."${table}"`;
    const tab: Tab = {
      id,
      connectionId,
      schema,
      table,
      label: `${schema}.${table}`,
      sql,
      result: null,
      selectedRowIndex: null,
      loading: false,
      error: null,
      filters: [],
      showFilterBar: false,
      sqlMode: false,
      limit: 300,
      offset: 0,
    };

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }));

    get().runTabQuery(id);
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const idx = tabs.findIndex((t) => t.id === id);
    const remaining = tabs.filter((t) => t.id !== id);

    let nextActiveId: string | null = null;
    if (activeTabId === id) {
      if (remaining.length > 0) {
        nextActiveId = remaining[Math.max(0, idx - 1)].id;
      }
    } else {
      nextActiveId = activeTabId;
    }

    set({ tabs: remaining, activeTabId: nextActiveId });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, partial) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, ...partial } : t)),
    })),

  runTabQuery: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;

    let sql = tab.sql;
    if (!tab.sqlMode) {
      const where = buildWhereClause(tab.filters);
      sql = `SELECT * FROM "${tab.schema}"."${tab.table}" ${where}`;
    }
    if (!sql.trim()) return;

    get().updateTab(id, { loading: true, error: null });
    try {
      const result = await invoke<QueryResult>("execute_query", {
        connectionId: tab.connectionId,
        sql,
        limit: tab.limit,
        offset: tab.offset,
      });
      get().updateTab(id, { result, loading: false, selectedRowIndex: null });
    } catch (e) {
      get().updateTab(id, { error: String(e), result: null, loading: false });
    }
  },

  toggleDetailPanel: () =>
    set((state) => ({ showDetailPanel: !state.showDetailPanel })),

  addFilter: (tabId) => {
    const rule: FilterRule = {
      id: crypto.randomUUID(),
      column: "",
      operator: "=",
      value: "",
      value2: "",
    };
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, filters: [...t.filters, rule] } : t
      ),
    }));
  },

  removeFilter: (tabId, filterId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, filters: t.filters.filter((f) => f.id !== filterId) }
          : t
      ),
    })),

  updateFilter: (tabId, filterId, partial) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              filters: t.filters.map((f) =>
                f.id === filterId ? { ...f, ...partial } : f
              ),
            }
          : t
      ),
    })),

  toggleFilterBar: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, showFilterBar: !t.showFilterBar } : t
      ),
    })),

  toggleSqlMode: (tabId) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, sqlMode: !t.sqlMode, offset: 0 } : t
      ),
    })),

  setLimit: (tabId, limit) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, limit, offset: 0 } : t
      ),
    }));
    get().runTabQuery(tabId);
  },

  nextPage: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    // If current page returned fewer rows than limit, already on last page
    if (tab.result && tab.result.rows.length < tab.limit) return;
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, offset: t.offset + t.limit } : t
      ),
    }));
    get().runTabQuery(tabId);
  },

  prevPage: (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab || tab.offset === 0) return;
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? { ...t, offset: Math.max(0, t.offset - t.limit) }
          : t
      ),
    }));
    get().runTabQuery(tabId);
  },
}),
    {
      name: "tablelike-tabs",
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({
          ...t,
          result: null,
          loading: false,
          error: null,
          selectedRowIndex: null,
        })),
        activeTabId: state.activeTabId,
        showDetailPanel: state.showDetailPanel,
      }),
    }
  )
);
