"use client";

import React from "react";
import {
  Wind,
  ChartLineUp,
  Atom,
  Target,
} from "@phosphor-icons/react";
import type { ForecastResponse } from "@/lib/forecastService";
import { getAqiStatus, getAqiColor } from "@/lib/forecastService";

export function KpiRowSkeleton() {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      aria-busy="true"
      aria-label="Loading KPI summary cards"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="dash-card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="skeleton h-4 w-28" />
            <div className="skeleton h-4 w-4 rounded" />
          </div>
          <div className="skeleton h-9 w-32" />
          <div className="skeleton h-4 w-36" />
        </div>
      ))}
    </div>
  );
}

interface KpiCardProps {
  label: string;
  icon: React.ReactNode;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  badge?: React.ReactNode;
}

function KpiCard({ label, icon, primary, secondary, badge }: KpiCardProps) {
  return (
    <article className="dash-card flex flex-col gap-3 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-slate-300">
      <div className="flex items-center justify-between gap-2">
        <span className="title-5 text-slate-500 uppercase tracking-wide">
          {label}
        </span>
        <span className="text-slate-400 shrink-0" aria-hidden>
          {icon}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-3">
        <div className="font-mono heading-4 text-slate-900 tabular-nums">
          {primary}
        </div>
        {badge}
      </div>
      {secondary && (
        <div className="caption-4 text-slate-500 text-pretty">{secondary}</div>
      )}
    </article>
  );
}

function AqiBadge({ value }: { value: number }) {
  const status = getAqiStatus(value);
  const color = getAqiColor(status);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md caption-3"
      style={{ backgroundColor: `${color}1A`, color }}
      aria-label={`AQI status: ${status}`}
    >
      {status}
    </span>
  );
}

interface KpiRowProps {
  data: ForecastResponse;
}

export default function KpiRow({ data }: KpiRowProps) {
  const updatedTime = new Date(data.fetchedAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section
      aria-label="Key air quality metrics"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {/* Card 1: Current PM2.5 with semantic AQI status badge */}
      <KpiCard
        label="Current PM2.5"
        icon={<Wind size={18} weight="duotone" />}
        primary={
          <>
            {data.currentPM25.toFixed(1)}
            <span className="font-mono caption-2 text-slate-400 ml-1">
              µg/m³
            </span>
          </>
        }
        badge={<AqiBadge value={data.currentPM25} />}
        secondary={
          <>
            Updated at{" "}
            <span className="font-mono tabular-nums">{updatedTime}</span>
          </>
        }
      />

      {/* Card 2: Predicted Peak PM2.5 with peak hour */}
      <KpiCard
        label="Predicted peak PM2.5"
        icon={<ChartLineUp size={18} weight="duotone" />}
        primary={
          <>
            {data.predictedPeak.toFixed(1)}
            <span className="font-mono caption-2 text-slate-400 ml-1">
              µg/m³
            </span>
          </>
        }
        secondary={
          <>
            Peak expected at{" "}
            <span className="font-mono tabular-nums">
              {data.predictedPeakHour}
            </span>{" "}
            local time
          </>
        }
      />

      {/* Card 3: Top SHAP Risk Factor */}
      <KpiCard
        label="Top SHAP risk factor"
        icon={<Atom size={18} weight="duotone" />}
        primary={
          <span className="font-sans heading-6 text-slate-900 text-balance">
            {data.topShapFactor}
          </span>
        }
        secondary="Highest absolute SHAP impact today"
      />

      {/* Card 4: XGBoost Model Accuracy (RMSE) */}
      <KpiCard
        label="XGBoost model accuracy (RMSE)"
        icon={<Target size={18} weight="duotone" />}
        primary={
          <>
            {data.modelRMSE.toFixed(2)}
            <span className="font-mono caption-2 text-slate-400 ml-1">
              µg/m³
            </span>
          </>
        }
        secondary="Validated on 30 day holdout set"
      />
    </section>
  );
}
