import { useEffect, useRef, useCallback } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry } from "geojson";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  geojson: FeatureCollection | null;
  title?: string;
}

export function MapDrawer({ open, onClose, geojson, title }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const geojsonRef = useRef(geojson);
  geojsonRef.current = geojson;

  const initMap = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (!node) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      return;
    }

    const map = new maplibregl.Map({
      container: node,
      style: {
        version: 8,
        sources: {
          "osm-tiles": {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "osm-tiles",
            type: "raster",
            source: "osm-tiles",
          },
        ],
      },
      center: [0, 20],
      zoom: 1,
    });

    mapRef.current = map;

    map.once("load", () => {
      map.resize();
      if (geojsonRef.current && geojsonRef.current.features.length > 0) {
        loadGeoJson(map, geojsonRef.current);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When geojson changes after map is already loaded
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      updateGeoJson(map, geojson);
    }
  }, [geojson]);

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col" style={{ height: "60vh" }}>
      {/* Backdrop */}
      <div className="absolute inset-x-0 -top-screen bottom-0 bg-black/20" onClick={onClose} style={{ top: "-100vh" }} />

      {/* Panel */}
      <div className="relative flex flex-col bg-background border-t rounded-t-xl shadow-xl overflow-hidden h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <div>
            <p className="text-sm font-medium">{title ?? "Map View"}</p>
            {geojson && (
              <p className="text-xs text-muted-foreground">
                {geojson.features.length} feature{geojson.features.length !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close map"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Map container — always mounted when panel is open */}
        <div ref={initMap} className="flex-1 w-full" />
      </div>
    </div>
  );
}

function loadGeoJson(map: maplibregl.Map, geojson: FeatureCollection | null) {
  if (!geojson || geojson.features.length === 0) return;

  if (map.getSource("geo-data")) {
    (map.getSource("geo-data") as maplibregl.GeoJSONSource).setData(geojson);
  } else {
    map.addSource("geo-data", { type: "geojson", data: geojson });

    map.addLayer({
      id: "geo-points",
      type: "circle",
      source: "geo-data",
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 6, "circle-color": "#3b82f6", "circle-stroke-width": 1.5, "circle-stroke-color": "#fff" },
    });

    map.addLayer({
      id: "geo-lines",
      type: "line",
      source: "geo-data",
      filter: ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]],
      paint: { "line-color": "#3b82f6", "line-width": 2 },
    });

    map.addLayer({
      id: "geo-fill",
      type: "fill",
      source: "geo-data",
      filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
      paint: { "fill-color": "#3b82f6", "fill-opacity": 0.2 },
    });

    map.addLayer({
      id: "geo-outline",
      type: "line",
      source: "geo-data",
      filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
      paint: { "line-color": "#3b82f6", "line-width": 1.5 },
    });
  }

  fitBounds(map, geojson);
}

function updateGeoJson(map: maplibregl.Map, geojson: FeatureCollection | null) {
  const src = map.getSource("geo-data") as maplibregl.GeoJSONSource | undefined;
  if (src && geojson) {
    src.setData(geojson);
    fitBounds(map, geojson);
  } else if (geojson) {
    loadGeoJson(map, geojson);
  }
}

function fitBounds(map: maplibregl.Map, geojson: FeatureCollection) {
  const bounds = new maplibregl.LngLatBounds();
  let valid = false;
  geojson.features.forEach((f) => {
    if (!f.geometry) return;
    extractCoordinates(f.geometry).forEach(([lng, lat]) => {
      if (isFinite(lng) && isFinite(lat)) { bounds.extend([lng, lat]); valid = true; }
    });
  });
  if (valid) map.fitBounds(bounds, { padding: 50, maxZoom: 16, animate: false });
}

type Coord = [number, number];

function extractCoordinates(geometry: Geometry): Coord[] {
  switch (geometry.type) {
    case "Point": return [[geometry.coordinates[0], geometry.coordinates[1]]];
    case "MultiPoint":
    case "LineString": return geometry.coordinates.map((c) => [c[0], c[1]]);
    case "MultiLineString":
    case "Polygon": return geometry.coordinates.flat().map((c) => [c[0], c[1]]);
    case "MultiPolygon": return geometry.coordinates.flat(2).map((c) => [c[0], c[1]]);
    case "GeometryCollection": return geometry.geometries.flatMap(extractCoordinates);
    default: return [];
  }
}
