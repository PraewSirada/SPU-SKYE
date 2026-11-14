import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
        logo: ['"Montserrat"', "var(--font-geist-sans)", "sans-serif"],
      },
      colors: {
        canvas: "#F8FAFC",
        card: "#FFFFFF",
        border: "#E2E8F0",
        accent: "#0284C7",
        "aqi-good": "#10B981",
        "aqi-moderate": "#F59E0B",
        "aqi-sensitive": "#F97316",
        "aqi-unhealthy": "#EF4444",
        "shap-push": "#F97316",
        "shap-reduce": "#0EA5E9",
      },
      transitionTimingFunction: {
        "decel": "cubic-bezier(0.22,1,0.36,1)",
      },
    },
  },
  plugins: [],
};

export default config;

