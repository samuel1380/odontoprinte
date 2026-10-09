import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0f8fb",
          100: "#e0f1f7",
          200: "#b9e2ef",
          300: "#7dc8e2",
          400: "#3aaad0",
          500: "#087AA4", // Cor principal oficial da marca
          600: "#076487",
          700: "#07516e",
          800: "#0a435b",
          900: "#0c394c",
          950: "#062432",
        },
        canvas: "#0B0F19",
        canvasSubtle: "#0F172A",
        warmBorder: "#1E293B",
        sand: {
          50: "#0F172A",
          100: "#1E293B",
          200: "#334155",
          300: "#475569",
          400: "#64748B",
          500: "#94A3B8",
          800: "#E2E8F0",
          900: "#F8FAFC",
        },
        terracotta: {
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
        },
        darkPill: "#FFFFFF",
        cardLight: "#0F172A",
        cardLightBorder: "#1E293B",
        approvedGreen: {
          50: "#052e16",
          100: "#14532d",
          200: "#166534",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
        },
        reprintRed: {
          50: "#450a0a",
          100: "#7f1d1d",
          200: "#991b1b",
          500: "#ef4444",
          600: "#dc2626",
          700: "#b91c1c",
        },
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      boxShadow: {
        subtle: "0 1px 3px 0 rgba(0, 0, 0, 0.3), 0 1px 2px 0 rgba(0, 0, 0, 0.2)",
        card: "0 2px 8px -2px rgba(0, 0, 0, 0.4), 0 1px 3px -1px rgba(0, 0, 0, 0.3)",
        elevated: "0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 4px 10px -2px rgba(0, 0, 0, 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
