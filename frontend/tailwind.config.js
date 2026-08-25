/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Outfit"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        canvas: "#050505",   // Pure black background requested
        surface: "#111111",  // Card background
        ink: "#FAFAFA",      // Bright white text
        muted: "#A1A1AA",    // Zinc-400
        faint: "#52525B",    // Zinc-600
        hair: "#27272A",     // Zinc-800 borders
        rail: "#000000",     // Pure black sidebar
        brand: {
          DEFAULT: "#A89BF2",  // User requested purple
          deep: "#8a7be0",
          soft: "rgba(168, 155, 242, 0.1)",
        },
        alert: { DEFAULT: "#EF4444", soft: "rgba(239, 68, 68, 0.1)" },
        chat: {
          bg: "#09090B",       
          out: "#1E1E24",
          in: "#27272A",
          header: "#18181B",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(26,23,20,0.03), 0 1px 3px rgba(26,23,20,0.05)",
        lift: "0 8px 30px rgba(26,23,20,0.10)",
      },
      keyframes: {
        pulsedot: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.7)" },
        },
      },
      animation: { pulsedot: "pulsedot 1.4s ease-in-out infinite" },
    },
  },
  plugins: [],
}
