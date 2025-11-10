import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        background: "#020617",
        foreground: "#e2e8f0",
        surface: "rgba(15, 23, 42, 0.65)",
        "surface-strong": "rgba(8, 14, 26, 0.85)",
        accent: "#38bdf8",
        "accent-strong": "#0ea5e9",
        muted: "#111827",
        "muted-foreground": "#94a3b8",
        border: "rgba(148, 163, 184, 0.18)",
        input: "rgba(148, 163, 184, 0.24)",
      },
      fontFamily: {
        sans: ["'Space Grotesk'", "system-ui", "sans-serif"],
        display: ["'Unbounded'", "cursive"],
      },
      boxShadow: {
        neon: "0 0 0 1px rgba(56,189,248,0.35), 0 20px 60px -30px rgba(56,189,248,0.55)",
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at 20% 20%, rgba(56,189,248,0.15), transparent 45%), radial-gradient(circle at 80% 0%, rgba(14,165,233,0.18), transparent 45%), radial-gradient(circle at 50% 100%, rgba(244,114,182,0.12), transparent 40%)",
      },
    },
  },
  plugins: [],
};

export default config;
