import { useCallback, useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import { DataGrid, CellValue } from "./DataGrid";
import { MapDrawer } from "./MapDrawer";
import { TabBar } from "./TabBar";
import { FilterBar } from "./FilterBar";
import { BottomBar } from "./BottomBar";
import { SqlEditor } from "./SqlEditor";
import { RowContextMenu } from "./RowContextMenu";
import { useTabStore } from "../store/tabs";

interface ContextMenuState {
  x: number;
  y: number;
  rowIndex: number;
  row: CellValue[];
}

export function MainPanel() {
  const { tabs, activeTabId, updateTab, runTabQuery, addFilter, updateFilter } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const [mapOpen, setMapOpen] = useState(false);
  const [mapGeoJson, setMapGeoJson] = useState<FeatureCollection | null>(null);
  const [activeView, setActiveView] = useState<"data" | "structure">("data");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const handleRun = useCallback(() => {
    if (!activeTabId) return;
    runTabQuery(activeTabId);
  }, [activeTabId, runTabQuery]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleRun();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRun]);

  useEffect(() => {
    setMapOpen(false);
    setMapGeoJson(null);
    setActiveView("data");
    setContextMenu(null);
  }, [activeTabId]);

  function handleShowMap(geoColIndex: number, singleRowIndex?: number) {
    if (!activeTab?.result) return;
    const rows = singleRowIndex !== undefined
      ? [activeTab.result.rows[singleRowIndex]]
      : activeTab.result.rows;

    const features = rows
      .map((row) => {
        const cell = row[geoColIndex];
        if (!cell || cell.type !== "Geo") return null;
        return {
          type: "Feature" as const,
          geometry: cell.value.geojson as unknown as GeoJSON.Geometry,
          properties: {},
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);
    setMapGeoJson({ type: "FeatureCollection", features });
    setMapOpen(true);
  }

  function handleRowSelect(rowIndex: number) {
    if (!activeTabId) return;
    updateTab(activeTabId, { selectedRowIndex: rowIndex });
  }

  function handleContextMenu(e: React.MouseEvent, rowIndex: number) {
    e.preventDefault();
    if (!activeTab?.result) return;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      rowIndex,
      row: activeTab.result.rows[rowIndex],
    });
    updateTab(activeTab.id, { selectedRowIndex: rowIndex });
  }

  function handleFilterBy(column: string, value: string) {
    if (!activeTabId || !activeTab) return;
    // Show filter bar, add filter rule, run query
    if (!activeTab.showFilterBar) {
      updateTab(activeTabId, { showFilterBar: true });
    }
    addFilter(activeTabId);
    // Get the new filter id — it's the last one after addFilter
    setTimeout(() => {
      const tab = tabs.find((t) => t.id === activeTabId);
      if (!tab) return;
      const lastFilter = tab.filters[tab.filters.length - 1];
      if (lastFilter) {
        updateFilter(activeTabId, lastFilter.id, { column, operator: "=", value });
        runTabQuery(activeTabId);
      }
    }, 0);
  }

  if (tabs.length === 0) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Select a table from the sidebar</p>
        </div>
      </div>
    );
  }

  if (!activeTab) return null;

  const dataGrid = (
    <DataGrid
      result={activeTab.result}
      onShowMap={(geoColIndex) => handleShowMap(geoColIndex)}
      selectedRowIndex={activeTab.selectedRowIndex}
      onRowSelect={handleRowSelect}
      onContextMenu={handleContextMenu}
    />
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <TabBar />

      {activeTab.showFilterBar && !activeTab.sqlMode && (
        <FilterBar tabId={activeTab.id} />
      )}

      <div className="flex flex-col flex-1 overflow-hidden">
        {activeTab.sqlMode ? (
          <div className="flex flex-col flex-1 overflow-hidden p-3 gap-3">
            <SqlEditor
              value={activeTab.sql}
              onChange={(sql) => updateTab(activeTab.id, { sql })}
              onRun={handleRun}
              loading={activeTab.loading}
            />
            {activeTab.error && (
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded border border-destructive/20 shrink-0">
                {activeTab.error}
              </div>
            )}
            {activeTab.loading && !activeTab.result ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Running query...
              </div>
            ) : dataGrid}
          </div>
        ) : activeView === "structure" ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Structure view coming soon
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            {activeTab.error && (
              <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded border border-destructive/20 mx-3 mt-3 shrink-0">
                {activeTab.error}
              </div>
            )}
            {activeTab.loading && !activeTab.result ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                Running query...
              </div>
            ) : dataGrid}
          </div>
        )}
      </div>

      <BottomBar
        tabId={activeTab.id}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      <MapDrawer
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        geojson={mapGeoJson}
        title={`${activeTab.schema}.${activeTab.table}`}
      />

      {contextMenu && activeTab.result && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          row={contextMenu.row}
          columns={activeTab.result.columns}
          rowIndex={contextMenu.rowIndex}
          onClose={() => setContextMenu(null)}
          onShowMap={(geoColIndex) => {
            handleShowMap(geoColIndex, contextMenu.rowIndex);
            setContextMenu(null);
          }}
          onFilterBy={handleFilterBy}
        />
      )}
    </div>
  );
}
