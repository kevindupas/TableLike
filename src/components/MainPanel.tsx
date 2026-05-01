import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FeatureCollection } from "geojson";
import { SqlEditor } from "./SqlEditor";
import { DataGrid, QueryResult } from "./DataGrid";
import { MapDrawer } from "./MapDrawer";

interface Props {
  connectionId: string;
  initialTable?: { schema: string; name: string };
}

export function MainPanel({ connectionId, initialTable }: Props) {
  const defaultSql = initialTable
    ? `SELECT * FROM "${initialTable.schema}"."${initialTable.name}"`
    : "";

  const [sql, setSql] = useState(defaultSql);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapGeoJson, setMapGeoJson] = useState<FeatureCollection | null>(null);

  // Update SQL when table changes
  useEffect(() => {
    if (initialTable) {
      setSql(
        `SELECT * FROM "${initialTable.schema}"."${initialTable.name}"`
      );
      setResult(null);
      setError(null);
    }
  }, [initialTable?.schema, initialTable?.name]);

  function handleShowMap(geoColIndex: number) {
    if (!result) return;

    const features = result.rows
      .map((row) => {
        const cell = row[geoColIndex];
        if (!cell || cell.type !== "Geo" || !cell.value) return null;
        return {
          type: "Feature" as const,
          geometry: cell.value as unknown as GeoJSON.Geometry,
          properties: {},
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    setMapGeoJson({
      type: "FeatureCollection",
      features,
    });
    setMapOpen(true);
  }

  const runQuery = useCallback(async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<QueryResult>("execute_query", {
        connectionId,
        sql,
        limit: 300,
        offset: 0,
      });
      setResult(res);
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [connectionId, sql]);

  // Cmd+Enter to run
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        runQuery();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [runQuery]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden p-3 gap-3">
      <SqlEditor
        value={sql}
        onChange={setSql}
        onRun={runQuery}
        loading={loading}
      />

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded border border-destructive/20 shrink-0">
          {error}
        </div>
      )}

      {loading && !result ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Running query...
        </div>
      ) : (
        <DataGrid result={result} onShowMap={handleShowMap} />
      )}

      <MapDrawer
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        geojson={mapGeoJson}
        title={initialTable ? `${initialTable.schema}.${initialTable.name}` : "Map View"}
      />
    </div>
  );
}
