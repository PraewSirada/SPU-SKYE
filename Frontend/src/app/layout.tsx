import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPU SKYE | PM2.5 Sentinel",
  description:
    "Hourly PM2.5 forecasting dashboard for Bangkok districts powered by Tuned Random Forest and feature attribution.",
  icons: {
    icon: [{ url: "/Logo/Circle_Logo.png", type: "image/png" }],
    shortcut: ["/Logo/Circle_Logo.png"],
    apple: [{ url: "/Logo/Circle_Logo.png", type: "image/png" }],
  },
  openGraph: {
    title: "PM2.5 Sentinel",
    description: "Hourly PM2.5 forecasting for Bangkok districts.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <link rel="icon" href="/Logo/Circle_Logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/Logo/Circle_Logo.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="font-sans antialiased bg-[#F8FAFC] text-slate-900">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#0284C7] focus:text-white focus:rounded-lg focus:body-4"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
