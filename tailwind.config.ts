import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#f8fafc",
        mist: "#070b14",
        line: "rgba(255,255,255,0.08)",
        lagoon: "#22d3ee",
        mint: "#34d399",
        ember: "#8b5cf6",
        plum: "#8b5cf6",
      },
      boxShadow: {
        panel: "0 24px 80px rgba(0, 0, 0, 0.34)",
      },
    },
  },
  plugins: [],
} satisfies Config;
