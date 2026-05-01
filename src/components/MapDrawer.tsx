import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Geometry } from "geojson";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "./ui/drawer";

interface Props {
  open: boolean;
  onClose: () => void;
  geojson: FeatureCollection | null;
  title?: string;
}

export function MapDrawer({ open, onClose, geojson, title }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!open || !mapContainerRef.current) return;

    // Small delay to ensure the drawer is fully rendered before mounting the map
    const timeout = setTimeout(() => {
      if (!mapContainerRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
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

      map.on("load", () => {
        if (!geojson || geojson.features.length === 0) return;

        map.addSource("geo-data", {
          type: "geojson",
          data: geojson,
        });

        // Points
        map.addLayer({
          id: "geo-points",
          type: "circle",
          source: "geo-data",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 6,
            "circle-color": "#3b82f6",
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#ffffff",
          },
        });

        // Lines
        map.addLayer({
          id: "geo-lines",
          type: "line",
          source: "geo-data",
          filter: ["==", ["geometry-type"], "LineString"],
          paint: {
            "line-color": "#3b82f6",
            "line-width": 2,
          },
        });

        // Polygon fill
        map.addLayer({
          id: "geo-fill",
          type: "fill",
          source: "geo-data",
          filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
          paint: {
            "fill-color": "#3b82f6",
            "fill-opacity": 0.2,
          },
        });

        // Polygon outline
        map.addLayer({
          id: "geo-outline",
          type: "line",
          source: "geo-data",
          filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]],
          paint: {
            "line-color": "#3b82f6",
            "line-width": 1.5,
          },
        });

        // Fit map to data bounds
        const bounds = new maplibregl.LngLatBounds();
        let hasValidBounds = false;

        geojson.features.forEach((feature) => {
          if (!feature.geometry) return;

          const coords = extractCoordinates(feature.geometry);
          coords.forEach(([lng, lat]) => {
            if (isFinite(lng) && isFinite(lat)) {
              bounds.extend([lng, lat]);
              hasValidBounds = true;
            }
          });
        });

        if (hasValidBounds) {
          map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
        }
      });
    }, 100);

    return () => {
      clearTimeout(timeout);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [open, geojson]);

  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent className="h-[75vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle>{title ?? "Map View"}</DrawerTitle>
          {geojson && (
            <DrawerDescription className="text-xs">
              {geojson.features.length} feature
              {geojson.features.length !== 1 ? "s" : ""}
            </DrawerDescription>
          )}
        </DrawerHeader>
        <div className="flex-1 px-4 pb-4 overflow-hidden">
          <div
            ref={mapContainerRef}
            className="w-full h-full rounded-md overflow-hidden border"
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

type Coordinate = [number, number];

function extractCoordinates(geometry: Geometry): Coordinate[] {
  switch (geometry.type) {
    case "Point":
      return [[geometry.coordinates[0], geometry.coordinates[1]]];
    case "MultiPoint":
    case "LineString":
      return geometry.coordinates.map((c) => [c[0], c[1]]);
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.flat().map((c) => [c[0], c[1]]);
    case "MultiPolygon":
      return geometry.coordinates.flat(2).map((c) => [c[0], c[1]]);
    case "GeometryCollection":
      return geometry.geometries.flatMap(extractCoordinates);
    default:
      return [];
  }
}
