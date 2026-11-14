"use client";

import React, { useEffect } from "react";
import {
  X,
  ArrowClockwise,
  ArrowRight,
  ArrowLeft,
  WarningDiamond,
  ChartBar,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import {
  ComposedChart,
  Bar,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { AirQualityMascot } from "@/components/CivicIllustrationAssets";
import {
  getThaiAqiMeta,
  type DistrictStation,
  type ForecastHorizon,
  type ForecastResponse,
  type FetchStatus,
  type ShapFeature,
  type ThaiAqiTier,
} from "@/lib/forecastService";

export type DrawerSection = "all" | "hourly" | "shap";

interface DistrictAnalyticsDrawerProps {
  isOpen: boolean;
  station: DistrictStation | null;
  lang: "TH" | "EN";
  horizon: ForecastHorizon;
  focusSection: DrawerSection;
  status: FetchStatus;
  data: ForecastResponse | null;
  error: string | null;
  onClose: () => void;
  onHorizonChange: (h: ForecastHorizon) => void;
  onRefresh: () => void;
  onLoadFallback: () => void;
}

const SHADOW_SHADE_BY_TIER: Record<ThaiAqiTier, string> = {
  "Very Good": "#0284C7",
  Good: "#16A34A",
  Moderate: "#CA8A04",
  "Unhealthy for Sensitive": "#C2410C",
  Unhealthy: "#B91C1C",
};

interface CelBarShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: { predicted?: number };
}

/**
 * Custom Recharts shape rendering flat cartoon columns with
 * bold #0F172A outlines and a distinct right-side cel-shaded shadow band.
 */
function CelShadedBar(props: CelBarShapeProps) {
  const { x = 0, y = 0, width = 0, height = 0, payload } = props;
  if (width <= 0 || height <= 0) return null;

  const val = payload?.predicted ?? 20;
  const meta = getThaiAqiMeta(val);
  const shadowFill = SHADOW_SHADE_BY_TIER[meta.tier];
  const shadowWidth = Math.max(3, Math.floor(width * 0.28));

  return (
    <g>
      {/* Flat base cartoon column */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        fill={meta.color}
      />
      {/* Hard-edged right-side cel shadow band */}
      <rect
        x={x + width - shadowWidth}
        y={y}
        width={shadowWidth}
        height={height}
        rx={2}
        fill={shadowFill}
      />
      {/* Bold comic outline */}
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        fill="none"
        stroke="#0F172A"
        strokeWidth={2}
      />
    </g>
  );
}

interface BarTooltipPayloadItem {
  name?: string;
  value?: number | null;
}

function HourlyBarTooltip({
  active,
  payload,
  label,
  lang,
}: {
  active?: boolean;
  payload?: BarTooltipPayloadItem[];
  label?: string;
  lang: "TH" | "EN";
}) {
  if (!active || !payload?.length) return null;

  const predicted = payload.find((p) => p.name === "Model predicted")?.value;
  const actual = payload.find((p) => p.name === "Actual baseline")?.value;
  const meta = predicted != null ? getThaiAqiMeta(predicted) : null;

  return (
    <div
      className="bg-white border-2 border-slate-900 rounded-xl shadow-[3px_3px_0px_#0f172a] px-4 py-3 min-w-[192px]"
      role="tooltip"
    >
      <p className="font-mono caption-3 text-slate-500 tabular-nums mb-2">
        {label}
      </p>
      {predicted != null && (
        <div className="flex items-baseline justify-between gap-4 mb-1">
          <span className="caption-4 text-slate-700">
            {lang === "TH" ? "ค่าพยากรณ์" : "Predicted"}
          </span>
          <span className="font-mono body-4 text-slate-900 tabular-nums">
            {predicted.toFixed(1)} µg/m³
          </span>
        </div>
      )}
      {actual != null && (
        <div className="flex items-baseline justify-between gap-4 mb-1">
          <span className="caption-4 text-slate-700">
            {lang === "TH" ? "ค่าตรวจวัดจริง" : "Actual"}
          </span>
          <span className="font-mono body-4 text-slate-900 tabular-nums">
            {actual.toFixed(1)} µg/m³
          </span>
        </div>
      )}
      {meta && (
        <div
          className="mt-2 px-2 py-0.5 rounded-md border border-slate-900 caption-3 text-center"
          style={{ backgroundColor: meta.bgTint, color: "#0F172A" }}
        >
          {lang === "TH" ? meta.thaiLabel : meta.englishLabel}
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
  const y = (viewBox.y ?? 0) - 6;
  return (
    <text
      x={x}
      y={y}
      textAnchor="end"
      fill="#C2410C"
      fontSize={12}
      fontFamily="var(--font-geist-sans)"
      fontWeight={700}
    >
      Standard 37.5 µg/m³
    </text>
  );
}

function ShapDivergingBar({
  feature,
  maxAbs,
  lang,
}: {
  feature: ShapFeature;
  maxAbs: number;
  lang: "TH" | "EN";
}) {
  const isPositive = feature.value >= 0;
  const pct = maxAbs > 0 ? Math.min(1, Math.abs(feature.value) / maxAbs) : 0;
  const barColor = isPositive ? "#F97316" : "#0EA5E9";
  const celShadowColor = isPositive ? "#C2410C" : "#0369A1";
  const label = lang === "TH" ? feature.featureTh : feature.feature;

  return (
    <div
      tabIndex={0}
      className="flex flex-col gap-1 py-2 px-2 rounded-xl transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0284C7]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="caption-3 text-slate-900 truncate flex-1" title={label}>
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {isPositive ? (
            <ArrowRight size={12} weight="bold" color={barColor} aria-hidden />
          ) : (
            <ArrowLeft size={12} weight="bold" color={barColor} aria-hidden />
          )}
          <span
            className="font-mono caption-3 tabular-nums"
            style={{ color: celShadowColor }}
          >
            {isPositive ? "+" : ""}
            {feature.value.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Comic-outlined diverging horizontal bar track */}
      <div
        className="relative grid grid-cols-2 h-6 rounded-lg border-2 border-slate-900 bg-slate-50 overflow-hidden shadow-[2px_2px_0px_#0f172a]"
        role="meter"
        aria-valuenow={feature.value}
        aria-valuemin={-maxAbs}
        aria-valuemax={maxAbs}
        aria-label={`${label} SHAP value ${feature.value.toFixed(2)}`}
      >
        <div className="relative h-full flex justify-end border-r-2 border-slate-900">
          {!isPositive && (
            <div
              className="relative h-full border-l-2 border-slate-900 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: `${pct * 100}%`, backgroundColor: "#0EA5E9" }}
            >
              {/* Hard cel-shaded bottom band */}
              <div
                className="absolute inset-x-0 bottom-0 h-2"
                style={{ backgroundColor: "#0369A1" }}
              />
            </div>
          )}
        </div>
        <div className="relative h-full flex justify-start">
          {isPositive && (
            <div
              className="relative h-full border-r-2 border-slate-900 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ width: `${pct * 100}%`, backgroundColor: "#F97316" }}
            >
              {/* Hard cel-shaded bottom band */}
              <div
                className="absolute inset-x-0 bottom-0 h-2"
                style={{ backgroundColor: "#C2410C" }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DrawerSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading district analytics">
      <div className="grid grid-cols-3 gap-3">
        <div className="skeleton h-20 rounded-xl" />
        <div className="skeleton h-20 rounded-xl" />
        <div className="skeleton h-20 rounded-xl" />
      </div>
      <div className="dash-card flex flex-col gap-3">
        <div className="skeleton h-5 w-48" />
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
      <div className="dash-card flex flex-col gap-3">
        <div className="skeleton h-5 w-44" />
        <div className="skeleton h-6 w-full" />
        <div className="skeleton h-6 w-full" />
        <div className="skeleton h-6 w-full" />
      </div>
    </div>
  );
}

export default function DistrictAnalyticsDrawer({
  isOpen,
  station,
  lang,
  horizon,
  focusSection,
  status,
  data,
  error,
  onClose,
  onHorizonChange,
  onRefresh,
  onLoadFallback,
}: DistrictAnalyticsDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !station) return null;

  const isLoading = status === "idle" || status === "loading";
  const aqiMeta = getThaiAqiMeta(data?.currentPM25 ?? station.currentPM25);
  const tickEvery = horizon === "24h" ? 3 : 6;
  const ticks =
    data?.hourly.filter((_, i) => i % tickEvery === 0).map((d) => d.hour) ?? [];

  const maxAbsShap = data?.shap.length
    ? Math.max(0.1, ...data.shap.map((f) => Math.abs(f.value)))
    : 1;
  const sortedShap = data
    ? [...data.shap].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50"
      role="dialog"
      aria-modal="true"
      aria-label={
        lang === "TH"
          ? `รายละเอียดการพยากรณ์ ${station.nameTh}`
          : `${station.nameEn} Forecast Analytics`
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="w-full max-w-2xl bg-[#F8FAFC] mt-6 rounded-t-2xl sm:mt-0 sm:m-4 sm:rounded-2xl border-2 border-slate-900 shadow-[6px_6px_0px_#0f172a] flex flex-col overflow-hidden max-h-[calc(100vh-1.5rem)] sm:max-h-none">
        {/* Drawer Header */}
        <div className="bg-white border-b-2 border-slate-900 p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <AirQualityMascot pm25={data?.currentPM25 ?? station.currentPM25} size={48} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="heading-6 text-slate-900 truncate">
                  {lang === "TH" ? station.nameTh : station.nameEn}
                </h2>
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-md border-2 border-slate-900 caption-3 shadow-[2px_2px_0px_#0f172a]"
                  style={{
                    backgroundColor: aqiMeta.color,
                    color: aqiMeta.tier === "Moderate" ? "#0F172A" : "#FFFFFF",
                  }}
                >
                  {lang === "TH" ? aqiMeta.thaiLabel : aqiMeta.englishLabel}
                </span>
              </div>
              <p className="caption-4 text-slate-600 truncate mt-1">
                {lang === "TH" ? station.stationTh : station.stationEn}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            <div
              role="group"
              aria-label="Forecast horizon"
              className="inline-flex rounded-xl border-2 border-slate-900 bg-white overflow-hidden shadow-[2px_2px_0px_#0f172a]"
            >
              {(["24h", "48h"] as ForecastHorizon[]).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => onHorizonChange(h)}
                  aria-pressed={horizon === h}
                  className={`px-3 py-2 button-sm font-mono tabular-nums transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#005A50] active:scale-[0.98] ${
                    horizon === h
                      ? "bg-[#005A50] text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label="Refresh district forecast"
              className="btn-outline button-sm disabled:opacity-50"
            >
              <ArrowClockwise
                size={16}
                weight="bold"
                className={isLoading ? "animate-spin" : ""}
                aria-hidden
              />
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close analytics drawer"
              className="btn-outline button-sm"
            >
              <X size={16} weight="bold" aria-hidden />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6">
          {status === "error" && error && (
            <div
              role="alert"
              className="flex flex-wrap items-start justify-between gap-3 p-4 rounded-xl bg-red-50 border-2 border-slate-900 shadow-[3px_3px_0px_#0f172a] text-red-900"
            >
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <WarningDiamond size={18} weight="bold" className="shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="body-4">{error}</p>
                  <p className="caption-5 text-red-700 mt-1">
                    {lang === "TH"
                      ? "ตรวจสอบเซิร์ฟเวอร์ FastAPI หรือโหลดข้อมูลจำลองของกรุงเทพฯ"
                      : "Check FastAPI service or load simulated Bangkok data."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={onLoadFallback} className="btn-outline button-sm">
                  {lang === "TH" ? "ใช้ข้อมูลจำลอง" : "Load sample"}
                </button>
                <button type="button" onClick={onRefresh} className="btn-primary button-sm">
                  {lang === "TH" ? "ลองใหม่" : "Retry"}
                </button>
              </div>
            </div>
          )}

          {isLoading ? (
            <DrawerSkeleton />
          ) : data ? (
            <>
              {/* Quick KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-white border-2 border-slate-900 rounded-xl p-3 sm:p-4 shadow-[3px_3px_0px_#0f172a] flex flex-col gap-1">
                  <span className="caption-4 text-slate-600">
                    {lang === "TH" ? "ค่าฝุ่นปัจจุบัน" : "Current PM2.5"}
                  </span>
                  <span className="font-mono heading-5 text-slate-900 tabular-nums">
                    {data.currentPM25.toFixed(1)}{" "}
                    <span className="caption-4 text-slate-500">µg/m³</span>
                  </span>
                </div>
                <div className="bg-white border-2 border-slate-900 rounded-xl p-3 sm:p-4 shadow-[3px_3px_0px_#0f172a] flex flex-col gap-1">
                  <span className="caption-4 text-slate-600">
                    {lang === "TH" ? "คาดการณ์สูงสุด" : "Predicted peak"}
                  </span>
                  <span className="font-mono heading-5 text-slate-900 tabular-nums">
                    {data.predictedPeak.toFixed(1)}{" "}
                    <span className="caption-4 text-slate-500">
                      at {data.predictedPeakHour}
                    </span>
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1 bg-white border-2 border-slate-900 rounded-xl p-3 sm:p-4 shadow-[3px_3px_0px_#0f172a] flex flex-col gap-1">
                  <span className="caption-4 text-slate-600">
                    {lang === "TH" ? "ความคลาดเคลื่อน (RMSE)" : "Model RMSE"}
                  </span>
                  <span className="font-mono heading-5 text-slate-900 tabular-nums">
                    {data.modelRMSE.toFixed(2)}{" "}
                    <span className="caption-4 text-slate-500">µg/m³</span>
                  </span>
                </div>
              </div>

              {/* 24h / 48h Cel-Shaded Random Forest Hourly Forecast Bar Chart */}
              {(focusSection === "all" || focusSection === "hourly") && (
                <section className="dash-card flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="title-2 text-slate-900">
                        {lang === "TH"
                          ? `กราฟพยากรณ์ PM2.5 รายชั่วโมง (${horizon})`
                          : `Hourly ML forecast (${horizon})`}
                      </h3>
                      <p className="caption-4 text-slate-600 mt-0.5">
                        {lang === "TH"
                          ? "แท่งพยากรณ์เทียบค่าตรวจวัดจริงพร้อมเส้นเกณฑ์มาตรฐาน 37.5 µg/m³"
                          : "Cartoon shaded hourly columns compared against observed baseline and 37.5 µg/m³ threshold"}
                      </p>
                    </div>
                    <ChartBar size={22} weight="duotone" className="text-slate-900 shrink-0" aria-hidden />
                  </div>

                  {data.hourly.length === 0 ? (
                    <div className="py-8 text-center caption-4 text-slate-500">
                      {lang === "TH"
                        ? "ไม่มีข้อมูลพยากรณ์รายชั่วโมง"
                        : "No hourly forecast points available"}
                    </div>
                  ) : (
                    <div className="w-full h-56 sm:h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={data.hourly}
                          margin={{ top: 16, right: 8, left: -4, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#CBD5E1"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="hour"
                            ticks={ticks}
                            tick={{
                              fontSize: 12,
                              fill: "#0F172A",
                              fontFamily: "var(--font-geist-mono)",
                            }}
                            tickLine={false}
                            axisLine={{ stroke: "#0F172A", strokeWidth: 2 }}
                          />
                          <YAxis
                            tick={{
                              fontSize: 12,
                              fill: "#0F172A",
                              fontFamily: "var(--font-geist-mono)",
                            }}
                            tickLine={false}
                            axisLine={{ stroke: "#0F172A", strokeWidth: 2 }}
                            domain={[0, (max: number) => Math.max(48, Math.ceil(max + 10))]}
                            width={36}
                          />
                          <Tooltip content={<HourlyBarTooltip lang={lang} />} />
                          <Legend
                            wrapperStyle={{
                              paddingTop: "8px",
                              fontSize: "12px",
                              fontFamily: "var(--font-geist-sans)",
                            }}
                          />
                          <ReferenceLine
                            y={37.5}
                            stroke="#F97316"
                            strokeWidth={2}
                            strokeDasharray="6 3"
                            label={<ThresholdLabel />}
                          />
                          <Bar
                            dataKey="predicted"
                            name="Model predicted"
                            shape={<CelShadedBar />}
                            maxBarSize={20}
                          />
                          <Line
                            type="monotone"
                            dataKey="actual"
                            name="Actual baseline"
                            stroke="#0F172A"
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: "#FFFFFF", stroke: "#0F172A", strokeWidth: 2 }}
                            connectNulls={false}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </section>
              )}

              {/* SHAP Feature Impact Panel */}
              {(focusSection === "all" || focusSection === "shap") && (
                <section className="dash-card flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="title-2 text-slate-900">
                        {lang === "TH"
                          ? "การวิเคราะห์ปัจจัยที่มีผลต่อค่าฝุ่น (SHAP)"
                          : "SHAP feature interpretability"}
                      </h3>
                      <p className="caption-4 text-slate-600 mt-0.5">
                        {lang === "TH"
                          ? "ปัจจัยที่ดันฝุ่นสูงขึ้นเทียบกับปัจจัยที่ช่วยพัดพาและลดฝุ่น"
                          : "Positive dust drivers compared against negative clearing factors"}
                      </p>
                    </div>
                    <SlidersHorizontal size={22} weight="duotone" className="text-slate-900 shrink-0" aria-hidden />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 bg-slate-50 rounded-xl border-2 border-slate-900">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-sm border-2 border-slate-900 shrink-0"
                        style={{ backgroundColor: "#0EA5E9" }}
                        aria-hidden
                      />
                      <span className="caption-3 text-slate-900">
                        {lang === "TH" ? "ปัจจัยช่วยลดฝุ่น" : "Clearing factor"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-sm border-2 border-slate-900 shrink-0"
                        style={{ backgroundColor: "#F97316" }}
                        aria-hidden
                      />
                      <span className="caption-3 text-slate-900">
                        {lang === "TH" ? "ปัจจัยเพิ่มค่าฝุ่น" : "Dust driver"}
                      </span>
                    </div>
                  </div>

                  {sortedShap.length === 0 ? (
                    <div className="py-8 text-center caption-4 text-slate-500">
                      {lang === "TH"
                        ? "ไม่มีข้อมูล SHAP สำหรับสถานีนี้"
                        : "No SHAP attributions available"}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between px-2 font-mono caption-5 text-slate-600 tabular-nums">
                        <span>{`-${maxAbsShap.toFixed(1)}`}</span>
                        <span>0.0</span>
                        <span>{`+${maxAbsShap.toFixed(1)}`}</span>
                      </div>
                      {sortedShap.map((feature) => (
                        <ShapDivergingBar
                          key={feature.feature}
                          feature={feature}
                          maxAbs={maxAbsShap}
                          lang={lang}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
