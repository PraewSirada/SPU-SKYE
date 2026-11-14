"use client";

import Link from "next/link";
import { HouseSimple, WarningDiamond } from "@phosphor-icons/react";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="w-16 h-16 rounded-2xl bg-[#0284C7] flex items-center justify-center">
        <WarningDiamond size={32} weight="bold" color="white" aria-hidden />
      </div>
      <div className="max-w-sm">
        <h1 className="heading-5 text-slate-900 mb-2">Page not found</h1>
        <p className="body-6 text-slate-500">
          This page does not exist or was moved. Return to the dashboard to view
          the latest PM2.5 forecasts for Bangkok.
        </p>
      </div>
      <Link
        href="/"
        className="btn-primary button-sm flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#0284C7] focus:ring-offset-2"
      >
        <HouseSimple size={16} weight="bold" aria-hidden />
        Back to dashboard
      </Link>
    </main>
  );
}

