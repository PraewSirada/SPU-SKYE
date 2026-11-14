"use client";

import React from "react";
import { CaretDown } from "@phosphor-icons/react";
import {
  getAqiStatus,
  type AqiStatus,
  type ForecastResponse,
} from "@/lib/forecastService";

interface SeverityMeta {
  status: AqiStatus;
  thaiLabel: string;
  iconLabel: string;
  color: string;
  surfaceBg: string;
  badgeBg: string;
  badgeText: string;
  headline: string;
  advice: string;
  rangeLabel: string;
}

const SEVERITY_CONFIG: Record<AqiStatus, SeverityMeta> = {
  Good: {
    status: "Good",
    thaiLabel: "อากาศดีมาก",
    iconLabel: "Happy smiling face badge representing clean air",
    color: "#10B981",
    surfaceBg: "#ECFDF5",
    badgeBg: "#D1FAE5",
    badgeText: "#065F46",
    headline: "อากาศดีมาก สูดหายใจได้เต็มปอด",
    advice: "คุณภาพอากาศปลอดภัย เหมาะกับทุกกิจกรรมกลางแจ้ง",
    rangeLabel: "0 to 25",
  },
  Moderate: {
    status: "Moderate",
    thaiLabel: "ปานกลาง",
    iconLabel: "Calm face badge representing moderate air quality",
    color: "#F59E0B",
    surfaceBg: "#FFFBEB",
    badgeBg: "#FEF3C7",
    badgeText: "#92400E",
    headline: "คุณภาพอากาศปานกลาง เริ่มมีฝุ่นละออง",
    advice: "คนทั่วไปใช้ชีวิตได้ปกติ กลุ่มเสี่ยงควรสังเกตอาการ",
    rangeLabel: "25.1 to 37.5",
  },
  "Unhealthy for Sensitive": {
    status: "Unhealthy for Sensitive",
    thaiLabel: "เริ่มมีผลกระทบ",
    iconLabel: "Masked face badge representing elevated fine dust",
    color: "#F97316",
    surfaceBg: "#FFF7ED",
    badgeBg: "#FFEDD5",
    badgeText: "#9A3412",
    headline: "ฝุ่นเริ่มเยอะ ควรสวมหน้ากากป้องกัน",
    advice: "ลดระยะเวลาทำกิจกรรมกลางแจ้งที่ใช้แรงมาก",
    rangeLabel: "37.6 to 75",
  },
  Unhealthy: {
    status: "Unhealthy",
    thaiLabel: "มีผลกระทบต่อสุขภาพ",
    iconLabel: "Dizzy face badge representing hazardous dust concentration",
    color: "#EF4444",
    surfaceBg: "#FEF2F2",
    badgeBg: "#FEE2E2",
    badgeText: "#991B1B",
    headline: "ฝุ่นหนาแน่นสูง อันตรายต่อสุขภาพ",
    advice: "งดกิจกรรมกลางแจ้ง ปิดประตูหน้าต่างและเปิดเครื่องฟอกอากาศ",
    rangeLabel: "Above 75",
  },
};

const SCALE_SEGMENTS: {
  status: AqiStatus;
  label: string;
  threshold: string;
  color: string;
}[] = [
  { status: "Good", label: "Good", threshold: "≤ 25", color: "#10B981" },
  {
    status: "Moderate",
    label: "Moderate",
    threshold: "≤ 37.5",
    color: "#F59E0B",
  },
  {
    status: "Unhealthy for Sensitive",
    label: "Sensitive",
    threshold: "≤ 75",
    color: "#F97316",
  },
  {
    status: "Unhealthy",
    label: "Unhealthy",
    threshold: "> 75",
    color: "#EF4444",
  },
];

function computeScalePosition(pm25: number): number {
  let pct: number;
  if (pm25 <= 25) {
    pct = (Math.max(0, pm25) / 25) * 25;
  } else if (pm25 <= 37.5) {
    pct = 25 + ((pm25 - 25) / 12.5) * 25;
  } else if (pm25 <= 75) {
    pct = 50 + ((pm25 - 37.5) / 37.5) * 25;
  } else {
    pct = 75 + Math.min(1, (pm25 - 75) / 75) * 25;
  }
  return Math.max(4, Math.min(96, pct));
}

/**
 * AirBKK / IQAir style flat circular AQI facial expression icon.
 * Uses flat solid colors only (no gradients).
 */
function AirBkkFaceIcon({ status }: { status: AqiStatus }) {
  switch (status) {
    case "Good":
      return (
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden
        >
          {/* Solid green face */}
          <circle cx="24" cy="24" r="22" fill="#10B981" />
          {/* Rosy cheeks */}
          <circle cx="13" cy="26" r="3" fill="#059669" />
          <circle cx="35" cy="26" r="3" fill="#059669" />
          {/* Happy curved eyes */}
          <path
            d="M14 20.5C15 17.5 18.5 17.5 19.5 20.5"
            stroke="#064E3B"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M28.5 20.5C29.5 17.5 33 17.5 34 20.5"
            stroke="#064E3B"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          {/* Big bright smile */}
          <path
            d="M15.5 27.5C17.2 32.5 30.8 32.5 32.5 27.5H15.5Z"
            fill="#FFFFFF"
            stroke="#064E3B"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "Moderate":
      return (
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden
        >
          {/* Solid amber face */}
          <circle cx="24" cy="24" r="22" fill="#F59E0B" />
          {/* Calm round eyes */}
          <circle cx="17" cy="20" r="2.6" fill="#78350F" />
          <circle cx="31" cy="20" r="2.6" fill="#78350F" />
          {/* Subtle brow */}
          <path
            d="M14 15.5H20"
            stroke="#78350F"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M28 15.5H34"
            stroke="#78350F"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Slight gentle smile */}
          <path
            d="M17.5 29.5C20 31.5 28 31.5 30.5 29.5"
            stroke="#78350F"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
      );

    case "Unhealthy for Sensitive":
      return (
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden
        >
          {/* Solid orange face */}
          <circle cx="24" cy="24" r="22" fill="#F97316" />
          {/* Concerned eyebrows */}
          <path
            d="M13.5 16.5L19.5 14.5"
            stroke="#7C2D12"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M34.5 16.5L28.5 14.5"
            stroke="#7C2D12"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {/* Eyes */}
          <circle cx="17" cy="20.5" r="2.5" fill="#7C2D12" />
          <circle cx="31" cy="20.5" r="2.5" fill="#7C2D12" />
          {/* Mask straps */}
          <path
            d="M4.5 26L12 27.5"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M43.5 26L36 27.5"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M8.5 37.5L13 34"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M39.5 37.5L35 34"
            stroke="#FFFFFF"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {/* White protective mask */}
          <rect
            x="12"
            y="25"
            width="24"
            height="13.5"
            rx="5"
            fill="#FFFFFF"
            stroke="#7C2D12"
            strokeWidth="2"
          />
          {/* Mask pleats */}
          <path
            d="M17 29.8H31"
            stroke="#CBD5E1"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M17 33.8H31"
            stroke="#CBD5E1"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );

    case "Unhealthy":
      return (
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          aria-hidden
        >
          {/* Solid red face */}
          <circle cx="24" cy="24" r="22" fill="#EF4444" />
          {/* Furrowed distressed brows */}
          <path
            d="M13 14.5L19.5 17"
            stroke="#7F1D1D"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path
            d="M35 14.5L28.5 17"
            stroke="#7F1D1D"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {/* Left X eye */}
          <path
            d="M14.5 19L19.5 24M19.5 19L14.5 24"
            stroke="#7F1D1D"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Right X eye */}
          <path
            d="M28.5 19L33.5 24M33.5 19L28.5 24"
            stroke="#7F1D1D"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Distressed wavy frown */}
          <path
            d="M15.5 33.5C17.5 30 20.5 30 24 32C27.5 34 30.5 30 32.5 33.5"
            stroke="#7F1D1D"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

export function AirQualityHeroSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-label="Loading current air quality status"
      className="bg-white border border-[#E2E8F0] rounded-2xl p-6"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-7 flex flex-col sm:flex-row items-start gap-4">
          <div className="skeleton w-16 h-16 rounded-full shrink-0" />
          <div className="flex-1 flex flex-col gap-2 min-w-0 w-full">
            <div className="skeleton h-4 w-44" />
            <div className="skeleton h-8 w-full max-w-md" />
            <div className="skeleton h-4 w-full max-w-lg" />
          </div>
        </div>
        <div className="lg:col-span-5 flex flex-col gap-4 bg-slate-50 rounded-xl p-4 border border-[#E2E8F0]">
          <div className="flex items-baseline justify-between gap-4">
            <div className="skeleton h-10 w-36" />
            <div className="skeleton h-4 w-24" />
          </div>
          <div className="skeleton h-3 w-full rounded" />
          <div className="grid grid-cols-4 gap-2">
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

interface AirQualityHeroCardProps {
  data: ForecastResponse;
}

export default function AirQualityHeroCard({ data }: AirQualityHeroCardProps) {
  const status = getAqiStatus(data.currentPM25);
  const meta = SEVERITY_CONFIG[status];
  const markerPct = computeScalePosition(data.currentPM25);
  const stateKey = `${data.district}-${status}-${data.currentPM25.toFixed(1)}`;

  return (
    <section
      aria-label={`Current air quality status for ${data.district}: ${status}`}
      className="rounded-2xl p-6 transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        backgroundColor: meta.surfaceBg,
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: meta.color,
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left Section: AirBKK style circular face icon badge & at a glance status */}
        <div className="lg:col-span-7 flex flex-col sm:flex-row items-start sm:items-center gap-4 min-w-0">
          <div
            key={stateKey}
            className="emoji-entrance w-16 h-16 rounded-full flex items-center justify-center shrink-0 select-none"
            style={{
              backgroundColor: meta.badgeBg,
              borderWidth: "1px",
              borderStyle: "solid",
              borderColor: meta.color,
            }}
            role="img"
            aria-label={meta.iconLabel}
          >
            <AirBkkFaceIcon status={status} />
          </div>

          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-md caption-3"
                style={{
                  backgroundColor: meta.badgeBg,
                  color: meta.badgeText,
                  borderWidth: "1px",
                  borderStyle: "solid",
                  borderColor: meta.color,
                }}
              >
                {status} · {meta.thaiLabel}
              </span>
              <span className="caption-4 text-slate-700">
                {data.district} monitoring station
              </span>
            </div>

            <h2 className="heading-5 text-slate-900 text-balance">
              {meta.headline}
            </h2>

            <p className="body-6 text-slate-700 text-pretty">{meta.advice}</p>
          </div>
        </div>

        {/* Right Section: Live PM2.5 reading & 4 segment AQI scale bar */}
        <div className="lg:col-span-5 flex flex-col gap-4 bg-white rounded-xl p-4 border border-[#E2E8F0] min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2">
              <span className="font-mono heading-3 text-slate-900 tabular-nums">
                {data.currentPM25.toFixed(1)}
              </span>
              <span className="font-mono body-5 text-slate-500">µg/m³</span>
            </div>
            <span className="caption-4 text-slate-600">
              Band:{" "}
              <span
                className="font-mono caption-3 tabular-nums"
                style={{ color: meta.badgeText }}
              >
                {meta.rangeLabel}
              </span>
            </span>
          </div>

          {/* 4 segment color coded scale bar with active marker */}
          <div className="flex flex-col gap-1">
            {/* Active marker track (B7: animate transform only) */}
            <div className="relative h-4 w-full" aria-hidden>
              <div
                className="absolute inset-y-0 left-0 w-full transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ transform: `translateX(${markerPct}%)` }}
              >
                <div className="absolute top-0 left-0 -translate-x-1/2 flex items-center justify-center">
                  <CaretDown
                    size={16}
                    weight="fill"
                    color={meta.color}
                    aria-hidden
                  />
                </div>
              </div>
            </div>

            {/* 4 equal color segments */}
            <div
              className="grid grid-cols-4 gap-1 w-full"
              role="img"
              aria-label={`PM2.5 scale indicator at ${data.currentPM25.toFixed(1)} micrograms per cubic meter (${status})`}
            >
              {SCALE_SEGMENTS.map((seg) => {
                const isActive = seg.status === status;
                return (
                  <div
                    key={seg.status}
                    className="h-3 rounded-sm transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={{
                      backgroundColor: seg.color,
                      opacity: isActive ? 1 : 0.3,
                    }}
                  />
                );
              })}
            </div>

            {/* Scale labels underneath */}
            <div className="grid grid-cols-4 gap-1 w-full pt-1">
              {SCALE_SEGMENTS.map((seg) => {
                const isActive = seg.status === status;
                return (
                  <div
                    key={seg.status}
                    className="flex flex-col items-start min-w-0"
                  >
                    <span
                      className={`caption-3 truncate max-w-full ${
                        isActive ? "text-slate-900" : "text-slate-500"
                      }`}
                    >
                      {seg.label}
                    </span>
                    <span className="font-mono caption-5 text-slate-500 tabular-nums">
                      {seg.threshold}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
