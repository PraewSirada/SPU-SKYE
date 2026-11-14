"use client";

import React, { useState } from "react";
import {
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartLine } from "@phosphor-icons/react";
import type { ForecastResponse } from "@/lib/forecastService";
import { getAqiStatus, getAqiColor } from "@/lib/forecastService";

export function ForecastChartSkeleton() {
  return (
    <div
      className="dash-card flex flex-col gap-4"
      aria-busy="true"
      aria-label="Loading hourly forecast chart"
    >
      <div className="flex flex-col gap-2">
        <div className="skeleton h-6 w-56" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="skeleton h-[320px] w-full rounded-xl" />
      <div className="flex gap-4">
        <div className="skeleton h-4 w-28" />
        <div className="skeleton h-4 w-32" />
      </div>
    </div>
  );
}

interface TooltipPayloadItem {
  color?: string;
  name?: string;
  value?: number | null;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const predicted = payload.find((p) => p.name === "XGBoost predicted")?.value;
  const actual = payload.find((p) => p.name === "Actual baseline")?.value;
  const aqiStatus = predicted != null ? getAqiStatus(predicted) : null;
  const aqiColor = aqiStatus ? getAqiColor(aqiStatus) : null;

  return (
    <div
      className="bg-white border border-[#E2E8F0] rounded-xl shadow-lg px-4 py-3 min-w-[192px]"
      role="tooltip"
    >
      <p className="font-mono caption-3 text-slate-500 tabular-nums mb-2">
        {label}
      </p>
      {predicted != null && (
        <div className="flex items-baseline justify-between gap-4 mb-1">
          <span className="caption-4 text-slate-700">XGBoost predicted</span>
          <span className="font-mono body-4 text-slate-900 tabular-nums">
            {predicted.toFixed(1)} µg/m³
          </span>
        </div>
      )}
      {actual != null && (
        <div className="flex items-baseline justify-between gap-4 mb-1">
          <span className="caption-4 text-slate-700">Actual baseline</span>
          <span className="font-mono body-4 text-slate-900 tabular-nums">
            {actual.toFixed(1)} µg/m³
          </span>
        </div>
      )}
      {aqiStatus && aqiColor && (
        <div
          className="mt-2 px-2 py-0.5 rounded-md caption-3 text-center"
          style={{ backgroundColor: `${aqiColor}1A`, color: aqiColor }}
        >
          {aqiStatus}
        </div>
      )}
    </div>
  );
}

function ThresholdLabel(props: {
  viewBox?: { x?: number; y?: number; width?: number };
}) {
  const { viewBox } = props;
  if (!viewBox) return null;
  const x = (viewBox.x ?? 0) + (viewBox.width ?? 0) - 4;
  const y = (viewBox.y ?? 0) - 8;
  return (
    <text
      x={x}
      y={y}
      textAnchor="end"
      fill="#F97316"
      fontSize={12}
      fontFamily="var(--font-geist-sans)"
      fontWeight={600}
    >
      Threshold 37.5 µg/m³
    </text>
  );
}

function ForecastChartEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-[320px] text-center gap-3 py-8">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
        <ChartLine size={24} weight="duotone" aria-hidden />
      </div>
      <div className="max-w-xs">
        <p className="body-5 text-slate-700 text-balance">
          No hourly forecast points available
        </p>
        <p className="caption-5 text-slate-500 mt-1 text-pretty">
          Select another Bangkok district or refresh to fetch the latest model run.
        </p>
      </div>
    </div>
  );
}

interface ForecastChartProps {
  data: ForecastResponse;
}

export default function ForecastChart({ data }: ForecastChartProps) {
  const [hovered, setHovered] = useState(false);

  const tickEvery = data.horizon === "24h" ? 3 : 6;
  const ticks = data.hourly
    .filter((_, i) => i % tickEvery === 0)
    .map((d) => d.hour);

  return (
    <section
      className="dash-card flex flex-col gap-4"
      aria-label="Hourly PM2.5 forecast chart"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="title-2 text-slate-900 text-balance">
            Hourly PM2.5 forecast for {data.district}
          </h2>
          <p className="caption-4 text-slate-500 mt-0.5 text-pretty">
            <span className="font-mono tabular-nums">{data.horizon}</span>{" "}
            horizon compared against baseline observations and{" "}
            <span className="font-mono tabular-nums">37.5</span> µg/m³ threshold
          </p>
        </div>
      </div>

      {data.hourly.length === 0 ? (
        <ForecastChartEmpty />
      ) : (
        <>
          <div className="w-full h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data.hourly}
                margin={{ top: 24, right: 8, left: 0, bottom: 0 }}
                onMouseMove={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#E2E8F0"
                  vertical={false}
                />
                <XAxis
                  dataKey="hour"
                  ticks={ticks}
                  tick={{
                    fontSize: 12,
                    fill: "#64748B",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                  tickLine={false}
                  axisLine={{ stroke: "#E2E8F0" }}
                />
                <YAxis
                  tick={{
                    fontSize: 12,
                    fill: "#64748B",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}`}
                  domain={[0, (dataMax: number) => Math.max(45, Math.ceil(dataMax + 10))]}
                  width={40}
                />
                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{
                    stroke: "#0284C7",
                    strokeWidth: 1,
                    strokeDasharray: "4 4",
                  }}
                />
                <Legend
                  wrapperStyle={{
                    paddingTop: "12px",
                    fontSize: "12px",
                    fontFamily: "var(--font-geist-sans)",
                    color: "#475569",
                  }}
                  iconSize={12}
                />
                <ReferenceLine
                  y={37.5}
                  stroke="#F97316"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  label={<ThresholdLabel />}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Actual baseline"
                  stroke="#94A3B8"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#94A3B8", strokeWidth: 0 }}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="predicted"
                  name="XGBoost predicted"
                  stroke="#0284C7"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{
                    r: 5,
                    fill: "#0284C7",
                    strokeWidth: 2,
                    stroke: "#FFFFFF",
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <p className="caption-5 text-slate-400 text-center min-h-4">
            {hovered
              ? "Inspecting hourly model prediction and baseline readings"
              : "Hover over the chart to inspect hourly values"}
          </p>
        </>
      )}
    </section>
  );
}
