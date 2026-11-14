"use client";

import React from "react";
import {
  ArrowClockwise,
  CaretDown,
  Wind,
  WifiSlash,
} from "@phosphor-icons/react";
import type { District, ForecastHorizon } from "@/lib/forecastService";

interface HeaderProps {
  district: District;
  horizon: ForecastHorizon;
  isLoading: boolean;
  isOffline: boolean;
  onDistrictChange: (d: District) => void;
  onHorizonChange: (h: ForecastHorizon) => void;
  onRefresh: () => void;
}

const DISTRICTS: District[] = [
  "Bang Khen",
  "Chatuchak",
  "Pathum Wan",
  "Din Daeng",
];

export default function Header({
  district,
  horizon,
  isLoading,
  isOffline,
  onDistrictChange,
  onHorizonChange,
  onRefresh,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0]">
      {/* Inline status banner when FastAPI backend is offline */}
      {isOffline && (
        <div
          role="status"
          aria-live="polite"
          className="bg-amber-50 border-b border-amber-200 text-amber-900"
        >
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2 flex items-center gap-2 caption-4 text-pretty">
            <WifiSlash size={16} weight="bold" className="shrink-0 text-amber-700" aria-hidden />
            <span>
              FastAPI backend is temporarily offline. Displaying simulated Bangkok forecast data.
            </span>
          </div>
        </div>
      )}

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        {/* App title */}
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#0284C7] text-white shrink-0"
            aria-hidden
          >
            <Wind size={18} weight="bold" />
          </span>
          <div className="flex flex-col">
            <h1 className="heading-6 text-slate-900 tracking-tight text-balance">
              PM2.5 Sentinel
            </h1>
            <span className="caption-5 text-slate-500">
              Bangkok air quality forecast
            </span>
          </div>
        </div>

        {/* Filter bar */}
        <nav
          aria-label="Forecast filters"
          className="flex flex-wrap items-center gap-3"
        >
          {/* District selector */}
          <label className="flex items-center gap-2">
            <span className="caption-4 text-slate-500 sr-only">District</span>
            <div className="relative">
              <select
                value={district}
                onChange={(e) => onDistrictChange(e.target.value as District)}
                className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-[#E2E8F0] bg-white body-5 text-slate-800 cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] focus-visible:ring-offset-2 active:scale-[0.98]"
                aria-label="Select Bangkok district"
              >
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <CaretDown size={14} weight="bold" aria-hidden />
              </span>
            </div>
          </label>

          {/* Forecast horizon toggle */}
          <div
            role="group"
            aria-label="Forecast horizon"
            className="inline-flex rounded-lg border border-[#E2E8F0] bg-white overflow-hidden"
          >
            {(["24h", "48h"] as ForecastHorizon[]).map((h) => {
              const active = horizon === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => onHorizonChange(h)}
                  aria-pressed={active}
                  className={`px-3 py-2 button-sm font-mono tabular-nums transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0284C7] active:scale-[0.98] ${
                    active
                      ? "bg-[#0284C7] text-white"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  {h}
                </button>
              );
            })}
          </div>

          {/* Manual refresh button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh forecast data"
            className="btn-outline button-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowClockwise
              size={16}
              weight="bold"
              aria-hidden
              className={isLoading ? "animate-spin" : ""}
            />
            <span>Refresh</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
