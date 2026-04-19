"use client";

import { divIcon, LatLngExpression } from "leaflet";
import { useEffect, useMemo } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
  useMapEvents
} from "react-leaflet";

type SurfaceMarker = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
  description?: string | null;
  tone?: "project" | "field" | "selected";
};

type SurfaceLine = {
  id: string;
  color?: string;
  points: Array<[number, number]>;
};

type LeafletSurfaceProps = {
  center: [number, number];
  zoom?: number;
  markers: SurfaceMarker[];
  lines?: SurfaceLine[];
  selectable?: boolean;
  onPick?: (value: { latitude: number; longitude: number }) => void;
};

function createMarkerIcon(tone: SurfaceMarker["tone"]) {
  return divIcon({
    className: "map-marker-shell",
    html: `<span class="map-marker map-marker-${tone ?? "project"}"><span class="map-marker-core"></span></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

const markerIcons = {
  project: createMarkerIcon("project"),
  field: createMarkerIcon("field"),
  selected: createMarkerIcon("selected")
} as const;

function MapPicker({
  selectable,
  onPick
}: Pick<LeafletSurfaceProps, "selectable" | "onPick">) {
  useMapEvents({
    click(event) {
      if (!selectable || !onPick) {
        return;
      }

      onPick({
        latitude: Number(event.latlng.lat.toFixed(6)),
        longitude: Number(event.latlng.lng.toFixed(6))
      });
    }
  });

  return null;
}

function ViewportController({
  center,
  zoom = 11,
  markers,
  lines = []
}: Pick<LeafletSurfaceProps, "center" | "zoom" | "markers" | "lines">) {
  const map = useMap();
  const viewportKey = useMemo(
    () =>
      JSON.stringify({
        center,
        zoom,
        markers: markers.map((marker) => [marker.id, marker.latitude, marker.longitude]),
        lines: lines.map((line) => [line.id, ...line.points.flat()])
      }),
    [center, lines, markers, zoom]
  );

  useEffect(() => {
    const points: Array<[number, number]> = [];

    for (const marker of markers) {
      points.push([marker.latitude, marker.longitude]);
    }

    for (const line of lines) {
      points.push(...line.points);
    }

    if (points.length > 1) {
      map.fitBounds(points, {
        padding: [32, 32],
        maxZoom: Math.max(zoom, 13)
      });
      return;
    }

    const [latitude, longitude] = points[0] ?? center;
    map.setView([latitude, longitude], zoom);
  }, [center, lines, map, markers, viewportKey, zoom]);

  return null;
}

export function LeafletSurface({
  center,
  zoom = 11,
  markers,
  lines = [],
  selectable = false,
  onPick
}: LeafletSurfaceProps) {
  return (
    <MapContainer center={center as LatLngExpression} className="leaflet-surface" zoom={zoom} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ViewportController center={center} lines={lines} markers={markers} zoom={zoom} />
      <MapPicker onPick={onPick} selectable={selectable} />
      {lines.map((line) => (
        <Polyline
          key={line.id}
          color={line.color ?? "#466f84"}
          pathOptions={{ weight: 4, opacity: 0.78 }}
          positions={line.points}
        />
      ))}
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          icon={markerIcons[marker.tone ?? "project"]}
          position={[marker.latitude, marker.longitude]}
        >
          <Popup>
            <strong>{marker.label}</strong>
            {marker.description ? <div>{marker.description}</div> : null}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
