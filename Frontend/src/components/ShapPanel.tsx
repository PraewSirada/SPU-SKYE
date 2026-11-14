"use client";

import React from "react";
import {
  ArrowRight,
  ArrowLeft,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import type { ForecastResponse, ShapFeature } from "@/lib/forecastService";

export function ShapPanelSkeleton() {
  return (
    <div
      className="dash-card flex flex-col gap-4"
      aria-busy="true"
      aria-label="Loading SHAP interpretability panel"
    >
      <div className="flex flex-col gap-2">
        <div className="skeleton h-6 w-44" />
        <div className="skeleton h-4 w-56" />
      </div>
      <div className="skeleton h-8 w-full rounded-lg" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex justify-between">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-4 w-12" />
            </div>
            <div className="skeleton h-5 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface DivergingBarProps {
  feature: ShapFeature;
  maxAbs: number;
}

function DivergingBar({ feature, maxAbs }: DivergingBarProps) {
  const isPositive = feature.value >= 0;
  const pct = maxAbs > 0 ? Math.min(1, Math.abs(feature.value) / maxAbs) : 0;
  const barColor = isPositive ? "#F97316" : "#0EA5E9";

  return (
    <div
      tabIndex={0}
      className="group flex flex-col gap-1 py-2 px-2 rounded-lg transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7] cursor-default"
      title={`${feature.feature}: ${isPositive ? "+" : ""}${feature.value.toFixed(2)} µg/m³`}
    >
      {/* Feature label and signed SHAP metric */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="caption-4 text-slate-700 truncate flex-1"
          title={feature.feature}
        >
          {feature.feature}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {isPositive ? (
            <ArrowRight size={12} weight="bold" color={barColor} aria-hidden />
          ) : (
            <ArrowLeft size={12} weight="bold" color={barColor} aria-hidden />
          )}
          <span
            className="font-mono caption-3 tabular-nums"
            style={{ color: barColor }}
          >
            {isPositive ? "+" : ""}
            {feature.value.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Diverging bar track centered at 0 */}
      <div
        className="relative grid grid-cols-2 h-4 rounded-md bg-slate-100 overflow-hidden"
        role="meter"
        aria-valuenow={feature.value}
        aria-valuemin={-maxAbs}
        aria-valuemax={maxAbs}
        aria-label={`${feature.feature} SHAP contribution ${feature.value.toFixed(2)}`}
      >
        {/* Left half: negative clearing factors (#0EA5E9) extending left from center */}
        <div className="relative h-full flex justify-end border-r border-slate-300">
          {!isPositive && (
            <div
              className="h-full rounded-l-sm transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                width: `${pct * 100}%`,
                backgroundColor: "#0EA5E9",
              }}
            />
          )}
        </div>

        {/* Right half: positive dust drivers (#F97316) extending right from center */}
        <div className="relative h-full flex justify-start">
          {isPositive && (
            <div
              className="h-full rounded-r-sm transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{
                width: `${pct * 100}%`,
                backgroundColor: "#F97316",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ShapEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center gap-3 py-8">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
        <SlidersHorizontal size={24} weight="duotone" aria-hidden />
      </div>
      <div className="max-w-xs">
        <p className="body-5 text-slate-700 text-balance">
          No SHAP feature attributions available
        </p>
        <p className="caption-5 text-slate-500 mt-1 text-pretty">
          Refresh the forecast or switch districts to inspect model drivers.
        </p>
      </div>
    </div>
  );
}

interface ShapPanelProps {
  data: ForecastResponse;
}

export default function ShapPanel({ data }: ShapPanelProps) {
  const { shap } = data;
  const maxAbs = shap.length
    ? Math.max(0.1, ...shap.map((f) => Math.abs(f.value)))
    : 1;

  const sorted = [...shap].sort(
    (a, b) => Math.abs(b.value) - Math.abs(a.value)
  );

  return (
    <section
      className="dash-card flex flex-col gap-4 h-full"
      aria-label="SHAP feature interpretability"
    >
      <div>
        <h2 className="title-2 text-slate-900 text-balance">
          SHAP feature interpretability
        </h2>
        <p className="caption-4 text-slate-500 mt-0.5 text-pretty">
          Feature contributions to predicted PM2.5 in µg/m³
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 bg-slate-50 rounded-lg border border-[#E2E8F0]">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm shrink-0"
            style={{ backgroundColor: "#0EA5E9" }}
            aria-hidden
          />
          <span className="caption-4 text-slate-700">Clearing factor</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-sm shrink-0"
            style={{ backgroundColor: "#F97316" }}
            aria-hidden
          />
          <span className="caption-4 text-slate-700">Dust driver</span>
        </div>
      </div>

      {/* Diverging bars */}
      {sorted.length === 0 ? (
        <ShapEmpty />
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-2 caption-5 font-mono text-slate-400 tabular-nums">
            <span>{`-${maxAbs.toFixed(1)}`}</span>
            <span>0.0</span>
            <span>{`+${maxAbs.toFixed(1)}`}</span>
          </div>
          <div
            className="flex flex-col gap-1"
            role="list"
            aria-label="SHAP feature values"
          >
            {sorted.map((feature) => (
              <div key={feature.feature} role="listitem">
                <DivergingBar feature={feature} maxAbs={maxAbs} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer note */}
      <p className="caption-5 text-slate-500 mt-auto pt-3 border-t border-[#E2E8F0] text-pretty">
        Computed with TreeExplainer on the XGBoost ensemble. Positive values push PM2.5 higher; negative values indicate dispersion or clearing.
      </p>
    </section>
  );
}
