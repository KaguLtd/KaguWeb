"use client";

import dynamic from "next/dynamic";

const LeafletSurface = dynamic(
  () => import("./leaflet-surface").then((module) => module.LeafletSurface),
  { ssr: false }
);

type TrackingMapProps = {
  projectMarkers: Array<{
    id: string;
    label: string;
    description?: string | null;
    latitude: number;
    longitude: number;
  }>;
  fieldMarkers: Array<{
    id: string;
    label: string;
    description?: string | null;
    latitude: number;
    longitude: number;
  }>;
  linePoints?: Array<[number, number]>;
};

export function TrackingMap({
  projectMarkers,
  fieldMarkers,
  linePoints = []
}: TrackingMapProps) {
  const firstPoint =
    fieldMarkers[0] ??
    projectMarkers[0] ?? {
      latitude: 41.0082,
      longitude: 28.9784
    };

  return (
    <LeafletSurface
      center={[firstPoint.latitude, firstPoint.longitude]}
      lines={linePoints.length > 1 ? [{ id: "history", points: linePoints }] : []}
      markers={[
        ...projectMarkers.map((marker) => ({
          ...marker,
          tone: "project" as const
        })),
        ...fieldMarkers.map((marker) => ({
          ...marker,
          tone: "field" as const
        }))
      ]}
      zoom={projectMarkers.length || fieldMarkers.length ? 11 : 6}
    />
  );
}
