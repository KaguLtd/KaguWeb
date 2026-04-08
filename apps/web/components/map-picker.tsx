"use client";

import dynamic from "next/dynamic";

const LeafletSurface = dynamic(
  () => import("./leaflet-surface").then((module) => module.LeafletSurface),
  { ssr: false }
);

type MapPickerProps = {
  latitude: number | null;
  longitude: number | null;
  onPick: (value: { latitude: number; longitude: number }) => void;
};

export function MapPicker({ latitude, longitude, onPick }: MapPickerProps) {
  const center: [number, number] =
    latitude !== null && longitude !== null ? [latitude, longitude] : [41.0082, 28.9784];

  const markers =
    latitude !== null && longitude !== null
      ? [
          {
            id: "picked",
            latitude,
            longitude,
            label: "Secili proje konumu",
            description: "Haritaya tiklayarak koordinati guncelleyin.",
            tone: "selected" as const
          }
        ]
      : [];

  return (
    <LeafletSurface
      center={center}
      markers={markers}
      onPick={onPick}
      selectable
      zoom={latitude !== null && longitude !== null ? 13 : 6}
    />
  );
}
