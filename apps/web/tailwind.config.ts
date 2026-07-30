import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        clinic: {
          50: "#eefaf9",
          100: "#d8f3f0",
          500: "#149b9b",
          600: "#0f7f80",
          700: "#0e6669"
        }
      },
      fontFamily: {
        sans: [
          "var(--font-arabic)",
          "Tahoma",
          "Arial",
          "sans-serif"
        ]
      }
    }
  },
  plugins: []
};

export default config;
