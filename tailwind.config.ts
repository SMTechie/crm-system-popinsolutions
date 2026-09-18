import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        soft: "rgb(var(--color-soft) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        brand: {
          50: "#eef3ff",
          100: "#dbe6ff",
          500: "#2e5ae8",
          600: "#2448bf",
        },
      },
      boxShadow: {
        panel: "0 18px 55px rgba(51, 87, 162, 0.10)",
      },
      borderRadius: {
        panel: "28px",
      },
    },
  },
  plugins: [],
};

export default config;
