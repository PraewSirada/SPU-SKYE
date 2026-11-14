"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  getThaiAqiMeta,
  type District,
  type DistrictStation,
  type ThaiAqiTier,
} from "@/lib/forecastService";


const LONGDO_API_KEY = process.env.NEXT_PUBLIC_LONGDO_API_KEY ?? "";
const LONGDO_SCRIPT_URL = `https://api.longdo.com/map/?key=${LONGDO_API_KEY}`;

const BANGKOK_CENTER = {
  lat: 13.7563,
  lon: 100.5018,
};

const DEFAULT_ZOOM = 12;

interface LongdoLocation {
  lon: number;
  lat: number;
}

interface LongdoMarkerOptions {
  title?: string;
  detail?: string;
  icon?: {
    html: string;
    offset?: { x: number; y: number };
  };
}

interface LongdoCircleOptions {
  lineWidth?: number;
  lineColor?: string;
  fillColor?: string;
}

interface LongdoOverlays {
  add: (overlay: unknown) => void;
  clear?: () => void;
}

interface LongdoUiWidget {
  visible?: (show: boolean) => void;
}

interface LongdoMapInstance {
  Overlays: LongdoOverlays;
  Event?: {
    bind: (eventName: string, handler: (overlay: unknown) => void) => void;
    unbind?: (eventName: string, handler: (overlay: unknown) => void) => void;
  };
  Ui?: {
    DPad?: LongdoUiWidget;
    Zoombar?: LongdoUiWidget;
    Geolocation?: LongdoUiWidget;
    Toolbar?: LongdoUiWidget;
    LayerSelector?: LongdoUiWidget;
    Fullscreen?: LongdoUiWidget;
    Crosshair?: LongdoUiWidget;
    Scale?: LongdoUiWidget;
  };
  location: (loc?: LongdoLocation, smooth?: boolean) => LongdoLocation;
  zoom: (level?: number, smooth?: boolean) => number;
  resize?: () => void;
}

interface LongdoNamespace {
  Map: new (options: {
    placeholder: HTMLElement;
    location?: LongdoLocation;
    zoom?: number;
    lastView?: boolean;
  }) => LongdoMapInstance;
  Marker: new (
    location: LongdoLocation,
    options?: LongdoMarkerOptions
  ) => unknown;
  Circle?: new (
    location: LongdoLocation,
    radius: number,
    options?: LongdoCircleOptions
  ) => unknown;
}

declare global {
  interface Window {
    longdo?: LongdoNamespace;
  }
}

export interface LongdoPM25MapProps {
  stations?: DistrictStation[];
  selectedStationId?: District | null;
  lang?: "TH" | "EN";
  centerLat?: number;
  centerLon?: number;
  zoom?: number;
  resetSignal?: number;
  showPmLayer?: boolean;
  showWindLayer?: boolean;
  sensorTitle?: string;
  sensorReading?: number;
  onSelectStation?: (station: DistrictStation) => void;
  onZoomChange?: (nextZoom: number) => void;
  className?: string;
}

type MarkerDensityMode = "full" | "compact" | "mini";

function getMarkerDensityMode(zoomLevel: number): MarkerDensityMode {
  if (zoomLevel >= 12) return "full";
  if (zoomLevel >= 10.5) return "compact";
  return "mini";
}

const HALO_FILL_BY_TIER: Record<ThaiAqiTier, string> = {
  "Very Good": "rgba(0, 176, 240, 0.22)",
  Good: "rgba(34, 197, 94, 0.22)",
  Moderate: "rgba(234, 179, 8, 0.24)",
  "Unhealthy for Sensitive": "rgba(249, 115, 22, 0.24)",
  Unhealthy: "rgba(239, 68, 68, 0.24)",
};

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildToonFaceSvg(
  tier: ThaiAqiTier,
  color: string,
  sizePx = 38
): string {
  const shadowColor =
    tier === "Very Good"
      ? "#0284C7"
      : tier === "Good"
        ? "#16A34A"
        : tier === "Moderate"
          ? "#CA8A04"
          : tier === "Unhealthy for Sensitive"
            ? "#C2410C"
            : "#B91C1C";

  let faceMarks = "";
  if (tier === "Very Good") {
    faceMarks = `
      <path d="M13.5 20.5C14.8 16.5 19.2 16.5 20.5 20.5" stroke="#0F172A" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M27.5 20.5C28.8 16.5 33.2 16.5 34.5 20.5" stroke="#0F172A" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M15.5 26.5C17 34 31 34 32.5 26.5H15.5Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2.4" stroke-linejoin="round"/>
    `;
  } else if (tier === "Good") {
    faceMarks = `
      <circle cx="17" cy="20" r="2.8" fill="#0F172A"/>
      <circle cx="31" cy="20" r="2.8" fill="#0F172A"/>
      <path d="M17 27.5C19.8 32 28.2 32 31 27.5" stroke="#0F172A" stroke-width="2.8" stroke-linecap="round"/>
    `;
  } else if (tier === "Moderate") {
    faceMarks = `
      <circle cx="17" cy="21" r="2.6" fill="#0F172A"/>
      <circle cx="31" cy="21" r="2.6" fill="#0F172A"/>
      <path d="M17.5 29.5H30.5" stroke="#0F172A" stroke-width="2.8" stroke-linecap="round"/>
    `;
  } else if (tier === "Unhealthy for Sensitive") {
    faceMarks = `
      <circle cx="17" cy="20.5" r="2.5" fill="#0F172A"/>
      <circle cx="31" cy="20.5" r="2.5" fill="#0F172A"/>
      <path d="M12.5 26.5C12.5 24.5 14 23 16 23H32C34 23 35.5 24.5 35.5 26.5V32C35.5 36 30.2 38.5 24 38.5C17.8 38.5 12.5 36 12.5 32V26.5Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2.4" stroke-linejoin="round"/>
    `;
  } else {
    faceMarks = `
      <path d="M14.5 18.5L19.5 22.5M19.5 18.5L14.5 22.5" stroke="#0F172A" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M28.5 18.5L33.5 22.5M33.5 18.5L28.5 22.5" stroke="#0F172A" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M12.5 26.5C12.5 24.5 14 23 16 23H32C34 23 35.5 24.5 35.5 26.5V32C35.5 36 30.2 38.5 24 38.5C17.8 38.5 12.5 36 12.5 32V26.5Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="2.4" stroke-linejoin="round"/>
    `;
  }

  return `
    <svg width="${sizePx}" height="${sizePx}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="20" fill="${color}" stroke="#0F172A" stroke-width="2.5"/>
      <path d="M36.5 9A19 19 0 0 1 11.5 38.5A18.5 18.5 0 0 0 36.5 9Z" fill="${shadowColor}"/>
      ${faceMarks}
    </svg>
  `;
}

function buildStationMarkerHtml(
  station: DistrictStation,
  lang: "TH" | "EN",
  isSelected: boolean,
  showWindLayer: boolean,
  density: MarkerDensityMode
): string {
  const meta = getThaiAqiMeta(station.currentPM25);
  const pillText = meta.tier === "Moderate" ? "#0F172A" : "#FFFFFF";
  const label = escapeHtml(lang === "TH" ? station.nameTh : station.nameEn);

  // Zoomed way out (< 10.5): render tiny clutter-free translucent AQI dot without giant emoji faces
  if (density === "mini") {
    const dotSize = isSelected ? 15 : 11;
    const dotShadow = isSelected
      ? "box-shadow:0 0 0 2.5px #005A50, 1.5px 1.5px 0px #0f172a;"
      : "box-shadow:1px 1px 0px #0f172a;";
    const dotOpacity = isSelected ? 0.85 : 0.65;
    const selectedBadge = isSelected
      ? `<div style="margin-top:2px;padding:0px 5px;border-radius:9999px;background:${meta.color};color:${pillText};border:1.5px solid #0F172A;font-family:var(--font-geist-mono),monospace;font-size:9.5px;font-weight:700;font-variant-numeric:tabular-nums;box-shadow:1px 1px 0px #0f172a;white-space:nowrap;">${station.currentPM25.toFixed(1)}</div>`
      : "";

    return `
      <div title="${label} · ${station.currentPM25.toFixed(1)} µg/m³" style="display:inline-flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%);cursor:pointer;user-select:none;white-space:nowrap;">
        <div style="width:${dotSize}px;height:${dotSize}px;border-radius:9999px;background:${meta.color};border:1.5px solid #0F172A;opacity:${dotOpacity};${dotShadow}"></div>
        ${selectedBadge}
      </div>
    `;
  }

  // Medium zoom (10.5 – 11.9): compact translucent emoji badge, hide district label unless selected
  if (density === "compact") {
    const ringStyle = isSelected
      ? "box-shadow:0 0 0 2.5px #005A50, 1.5px 1.5px 0px #0f172a;"
      : "box-shadow:1.5px 1.5px 0px #0f172a;";
    const windBadge =
      showWindLayer && isSelected
        ? `<span style="position:absolute;top:-7px;right:-14px;background:rgba(255,255,255,0.9);border:1.5px solid #0F172A;border-radius:9999px;padding:0px 4px;font-family:var(--font-geist-mono),monospace;font-size:8.5px;font-weight:700;color:#0284C7;box-shadow:1px 1px 0px #0f172a;white-space:nowrap;">${station.windSpeedMs.toFixed(1)} m/s</span>`
        : "";
    const districtPill = isSelected
      ? `<div style="padding:0px 5px;border-radius:5px;background:rgba(255,255,255,0.9);color:#0F172A;border:1.5px solid #0F172A;font-family:var(--font-geist-sans),sans-serif;font-size:9.5px;font-weight:600;box-shadow:1px 1px 0px #0f172a;white-space:nowrap;">${label}</div>`
      : "";

    return `
      <div title="${label} · ${station.currentPM25.toFixed(1)} µg/m³" style="display:inline-flex;flex-direction:column;align-items:center;gap:1.5px;transform:translate(-50%,-50%);cursor:pointer;user-select:none;white-space:nowrap;">
        <div style="position:relative;width:22px;height:22px;border-radius:9999px;background:rgba(255,255,255,0.65);border:1.5px solid #0F172A;display:flex;align-items:center;justify-content:center;opacity:0.65;${ringStyle}">
          ${buildToonFaceSvg(meta.tier, meta.color, 18)}
          ${windBadge}
        </div>
        <div style="padding:0px 5px;border-radius:9999px;background:${meta.color};color:${pillText};border:1.5px solid #0F172A;font-family:var(--font-geist-mono),monospace;font-size:9.5px;font-weight:700;font-variant-numeric:tabular-nums;box-shadow:1px 1px 0px #0f172a;white-space:nowrap;">
          ${station.currentPM25.toFixed(1)}
        </div>
        ${districtPill}
      </div>
    `;
  }

  // Full zoom (>= 12): sleek compact translucent emoji badge (30px, 65% opacity) + PM2.5 pill + district label
  const ringStyle = isSelected
    ? "box-shadow:0 0 0 3px #005A50, 2px 2px 0px #0f172a;"
    : "box-shadow:2px 2px 0px #0f172a;";
  const windBadge = showWindLayer
    ? `<span style="position:absolute;top:-7px;right:-14px;background:rgba(255,255,255,0.92);border:1.5px solid #0F172A;border-radius:9999px;padding:0px 5px;font-family:var(--font-geist-mono),monospace;font-size:9px;font-weight:700;color:#0284C7;box-shadow:1.5px 1.5px 0px #0f172a;white-space:nowrap;">${station.windSpeedMs.toFixed(1)} m/s</span>`
    : "";

  return `
    <div style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;transform:translate(-50%,-50%);cursor:pointer;user-select:none;white-space:nowrap;">
      <div style="position:relative;width:30px;height:30px;border-radius:9999px;background:rgba(255,255,255,0.65);border:1.5px solid #0F172A;display:flex;align-items:center;justify-content:center;opacity:0.65;${ringStyle}">
        ${buildToonFaceSvg(meta.tier, meta.color, 25)}
        ${windBadge}
      </div>
      <div style="padding:0px 6px;border-radius:9999px;background:${meta.color};color:${pillText};border:1.5px solid #0F172A;font-family:var(--font-geist-mono),monospace;font-size:10px;font-weight:700;font-variant-numeric:tabular-nums;box-shadow:1.5px 1.5px 0px #0f172a;white-space:nowrap;">
        ${station.currentPM25.toFixed(1)}
      </div>
      <div style="padding:0px 5px;border-radius:5px;background:rgba(255,255,255,0.9);color:#0F172A;border:1.5px solid #0F172A;font-family:var(--font-geist-sans),sans-serif;font-size:10px;font-weight:600;box-shadow:1.5px 1.5px 0px #0f172a;white-space:nowrap;">
        ${label}
      </div>
    </div>
  `;
}

export default function LongdoPM25Map({
  stations,
  selectedStationId = null,
  lang = "TH",
  centerLat = BANGKOK_CENTER.lat,
  centerLon = BANGKOK_CENTER.lon,
  zoom = DEFAULT_ZOOM,
  resetSignal = 0,
  showPmLayer = true,
  showWindLayer = false,
  sensorTitle = "Bangkok PM2.5 Monitoring Station",
  sensorReading = 34.2,
  onSelectStation,
  onZoomChange,
  className = "",
}: LongdoPM25MapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<LongdoMapInstance | null>(null);
  const markerStationMapRef = useRef<Map<unknown, DistrictStation>>(new Map());
  const onSelectStationRef = useRef(onSelectStation);
  onSelectStationRef.current = onSelectStation;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveZoom, setLiveZoom] = useState<number>(zoom);
  const densityMode = getMarkerDensityMode(liveZoom);

  // Initialize Longdo Map script and mount the map instance once
  useEffect(() => {
    let isCancelled = false;
    const containerNode = mapContainerRef.current;

    const handleOverlayClick = (overlay: unknown) => {
      const station = markerStationMapRef.current.get(overlay);
      if (station && onSelectStationRef.current) {
        onSelectStationRef.current(station);
      }
    };

    const handleMapZoom = () => {
      const map = mapInstanceRef.current;
      if (!map) return;
      try {
        const nextZoom = map.zoom();
        if (typeof nextZoom === "number" && Number.isFinite(nextZoom)) {
          setLiveZoom(nextZoom);
          onZoomChangeRef.current?.(Math.round(nextZoom));
        }
      } catch {
        // Ignore transient zoom reads
      }
    };

    const initializeMap = () => {
      if (isCancelled || !containerNode) return;
      if (mapInstanceRef.current) return;

      const longdo = window.longdo;
      if (!longdo?.Map || !longdo?.Marker) {
        setStatus("error");
        setErrorMessage("Longdo Map SDK failed to initialize.");
        return;
      }

      try {
        const map = new longdo.Map({
          placeholder: containerNode,
          location: { lon: centerLon, lat: centerLat },
          zoom,
          lastView: false,
        });

        // Hide overlapping built-in Longdo controls when custom dashboard controls are present
        if (stations && stations.length > 0) {
          try {
            map.Ui?.DPad?.visible?.(false);
            map.Ui?.Zoombar?.visible?.(false);
            map.Ui?.Geolocation?.visible?.(false);
            map.Ui?.Toolbar?.visible?.(false);
            map.Ui?.LayerSelector?.visible?.(false);
            map.Ui?.Fullscreen?.visible?.(false);
            map.Ui?.Crosshair?.visible?.(false);
          } catch {
            // Keep default UI controls if individual widget visibility calls are unsupported
          }
        }

        map.Event?.bind("overlayClick", handleOverlayClick);
        map.Event?.bind("zoom", handleMapZoom);
        mapInstanceRef.current = map;
        setLiveZoom(zoom);
        setStatus("ready");
        setErrorMessage(null);
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : "Unable to render Longdo Map.";
        setStatus("error");
        setErrorMessage(detail);
      }
    };

    if (window.longdo?.Map) {
      initializeMap();
    } else {
      let scriptEl = document.querySelector<HTMLScriptElement>(
        'script[data-longdo-map="true"]'
      );

      const handleLoad = () => {
        if (scriptEl) {
          scriptEl.dataset.loaded = "true";
        }
        initializeMap();
      };

      const handleError = () => {
        if (!isCancelled) {
          setStatus("error");
          setErrorMessage("Failed to load Longdo Map script.");
        }
      };

      if (!scriptEl) {
        scriptEl = document.createElement("script");
        scriptEl.src = LONGDO_SCRIPT_URL;
        scriptEl.async = true;
        scriptEl.dataset.longdoMap = "true";
        scriptEl.addEventListener("load", handleLoad);
        scriptEl.addEventListener("error", handleError);
        document.head.appendChild(scriptEl);
      } else if (scriptEl.dataset.loaded === "true") {
        initializeMap();
      } else {
        scriptEl.addEventListener("load", handleLoad);
        scriptEl.addEventListener("error", handleError);
      }

      return () => {
        isCancelled = true;
        if (scriptEl) {
          scriptEl.removeEventListener("load", handleLoad);
          scriptEl.removeEventListener("error", handleError);
        }
        if (mapInstanceRef.current) {
          mapInstanceRef.current.Event?.unbind?.("overlayClick", handleOverlayClick);
          mapInstanceRef.current.Event?.unbind?.("zoom", handleMapZoom);
          try {
            mapInstanceRef.current.Overlays.clear?.();
          } catch {
            // Ignore overlay disposal errors during teardown
          }
        }
        markerStationMapRef.current.clear();
        mapInstanceRef.current = null;
        if (containerNode) {
          containerNode.innerHTML = "";
        }
      };
    }

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.Event?.unbind?.("overlayClick", handleOverlayClick);
        mapInstanceRef.current.Event?.unbind?.("zoom", handleMapZoom);
        try {
          mapInstanceRef.current.Overlays.clear?.();
        } catch {
          // Ignore overlay disposal errors during teardown
        }
      }
      markerStationMapRef.current.clear();
      mapInstanceRef.current = null;
      if (containerNode) {
        containerNode.innerHTML = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render station markers and optional PM2.5 coverage circles whenever overlay data changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const longdo = window.longdo;
    if (status !== "ready" || !map || !longdo?.Marker) return;

    try {
      map.Overlays.clear?.();
    } catch {
      // Proceed cleanly if clear is unavailable
    }
    markerStationMapRef.current.clear();

    if (stations && stations.length > 0) {
      // Render non-selected stations first so the active station marker sits on top
      const orderedStations = [...stations].sort((a, b) => {
        if (a.id === selectedStationId) return 1;
        if (b.id === selectedStationId) return -1;
        return 0;
      });

      orderedStations.forEach((station) => {
        const meta = getThaiAqiMeta(station.currentPM25);
        const isSelected = selectedStationId === station.id;

        if (showPmLayer && longdo.Circle && densityMode !== "mini") {
          const halo = new longdo.Circle(
            { lon: station.lon, lat: station.lat },
            0.016,
            {
              lineWidth: 2,
              lineColor: "rgba(15, 23, 42, 0.35)",
              fillColor: HALO_FILL_BY_TIER[meta.tier],
            }
          );
          map.Overlays.add(halo);
        }

        const marker = new longdo.Marker(
          { lon: station.lon, lat: station.lat },
          {
            title: lang === "TH" ? station.nameTh : station.nameEn,
            detail: `${station.currentPM25.toFixed(1)} µg/m³ · ${
              lang === "TH" ? meta.thaiLabel : meta.englishLabel
            }`,
            icon: {
              html: buildStationMarkerHtml(
                station,
                lang,
                isSelected,
                showWindLayer,
                densityMode
              ),
              offset: { x: 0, y: 0 },
            },
          }
        );

        markerStationMapRef.current.set(marker, station);
        map.Overlays.add(marker);
      });
    } else {
      const sensorMarker = new longdo.Marker(
        { lon: centerLon, lat: centerLat },
        {
          title: sensorTitle,
          detail: `Observed PM2.5: ${sensorReading.toFixed(1)} µg/m³`,
        }
      );
      map.Overlays.add(sensorMarker);
    }
  }, [
    status,
    stations,
    selectedStationId,
    lang,
    showPmLayer,
    showWindLayer,
    densityMode,
    centerLat,
    centerLon,
    sensorTitle,
    sensorReading,
  ]);

  // Synchronize zoom level changes cleanly without recreating the map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (status !== "ready" || !map) return;
    try {
      const current = map.zoom();
      if (typeof current !== "number" || Math.abs(current - zoom) > 0.25) {
        map.zoom(zoom, true);
      }
      setLiveZoom(zoom);
    } catch {
      // Ignore transient zoom call errors
    }
  }, [status, zoom]);

  // Pan smoothly to the newly selected station
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (status !== "ready" || !map || !selectedStationId || !stations?.length) {
      return;
    }
    const target = stations.find((st) => st.id === selectedStationId);
    if (target) {
      try {
        map.location({ lon: target.lon, lat: target.lat }, true);
      } catch {
        // Ignore transient pan call errors
      }
    }
  }, [status, selectedStationId, stations]);

  // Re-center on Bangkok when the map reset control is triggered
  useEffect(() => {
    if (resetSignal === 0) return;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !map) return;
    try {
      map.location({ lon: centerLon, lat: centerLat }, true);
      map.zoom(DEFAULT_ZOOM, true);
      setLiveZoom(DEFAULT_ZOOM);
    } catch {
      // Ignore transient reset call errors
    }
  }, [status, resetSignal, centerLat, centerLon]);

  // Reflow Longdo Map tiles when container resizes across mobile and tablet breakpoints
  useEffect(() => {
    const containerNode = mapContainerRef.current;
    const map = mapInstanceRef.current;
    if (status !== "ready" || !containerNode || !map || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      try {
        map.resize?.();
      } catch {
        // Ignore transient resize errors
      }
    });
    observer.observe(containerNode);
    return () => observer.disconnect();
  }, [status]);

  return (
    <div className={`relative w-full h-full bg-[#F1F5F9] ${className}`}>
      {/* Target container managed directly by the Longdo Map SDK */}
      <div
        ref={mapContainerRef}
        className="w-full h-full"
        aria-label={
          lang === "TH"
            ? "แผนที่ Longdo แสดงจุดตรวจวัดฝุ่น PM2.5 กรุงเทพมหานคร"
            : "Longdo interactive Bangkok PM2.5 monitoring map"
        }
        aria-busy={status === "loading"}
      />

      {/* Loading overlay */}
      {status === "loading" && (
        <div
          role="status"
          className="absolute inset-0 z-10 flex items-center justify-center bg-[#F8FAFC]/90"
        >
          <span className="rounded-xl border-2 border-slate-900 bg-white px-4 py-2 body-4 text-slate-900 shadow-[3px_3px_0px_#0f172a]">
            {lang === "TH"
              ? "กำลังโหลดแผนที่ Longdo กรุงเทพมหานคร..."
              : "Loading Bangkok Longdo Map..."}
          </span>
        </div>
      )}

      {/* Error overlay */}
      {status === "error" && errorMessage && (
        <div
          role="alert"
          className="absolute inset-0 z-10 flex items-center justify-center bg-red-50/95 p-6"
        >
          <div className="max-w-sm rounded-xl border-2 border-slate-900 bg-white p-4 text-center shadow-[4px_4px_0px_#0f172a]">
            <p className="body-4 text-slate-900">
              {lang === "TH" ? "ไม่สามารถโหลดแผนที่ได้" : "Map Initialization Error"}
            </p>
            <p className="caption-4 text-slate-700 mt-1">{errorMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
