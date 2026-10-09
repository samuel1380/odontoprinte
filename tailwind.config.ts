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
          500: "#087AA4", // Cor principal solicitada
          600: "#076487",
          700: "#07516e",
          800: "#0a435b",
          900: "#0c394c",
          950: "#062432",
        },
        canvas: "#FBF9F5",
        canvasSubtle: "#F7F4EE",
        warmBorder: "#EFECE6",
        sand: {
          50: "#FAF8F5",
          100: "#F5F2EB",
          200: "#EFEAE2",
          300: "#E2DDD5",
          400: "#C7C0B5",
          500: "#9E988F",
          800: "#3D3A36",
          900: "#1E1C1A",
        },
        terracotta: {
          400: "#E86B47",
          500: "#DE5A35",
          600: "#C94E2B",
          700: "#A63E21",
        },
        darkPill: "#18181B",
        cardLight: "#FFFFFF",
        cardLightBorder: "#EFECE6",
        approvedGreen: {
          50: "#f7fee7",
          100: "#ecfccb",
          200: "#d9f99d",
          500: "#84cc16",
          600: "#65a30d",
          700: "#4d7c0f",
        },
        reprintRed: {
          50: "#fef2f2",
          100: "#fee2e2",
          200: "#fecaca",
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
        subtle: "0 1px 3px 0 rgba(0, 0, 0, 0.02), 0 1px 2px 0 rgba(0, 0, 0, 0.01)",
        card: "0 2px 8px -2px rgba(30, 28, 26, 0.03), 0 1px 3px -1px rgba(30, 28, 26, 0.02)",
        elevated: "0 10px 25px -5px rgba(30, 28, 26, 0.05), 0 4px 10px -2px rgba(30, 28, 26, 0.02)",
      },
    },
  },
  plugins: [],
};

export default config;
