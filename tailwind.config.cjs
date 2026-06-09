/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        ink: "#1c1917",
        paper: "#faf9f7",
        charcoal: "#2a2522",
        ledger: "#e7e5e1",
        grey: {
          dark: "#44403c",
          mid: "#78716c",
          light: "#f7f6f4",
        },
        sage: {
          DEFAULT: "#557555",
          light: "#eef3ee",
          dark: "#557555",
        },
        amber: {
          DEFAULT: "#a9743f",
          light: "#faf2e9",
          dark: "#8c5d31",
        },
        error: {
          DEFAULT: "#b53d3d",
          light: "#fbeded",
        },
        slate: {
          50: "#fafaf9",
          100: "#f5f5f4",
          200: "#e5e5e5",
          300: "#d4d4d4",
          400: "#a3a3a3",
          500: "#666666",
          600: "#525252",
          700: "#44403c",
          800: "#1a1a1a",
          900: "#000000",
        },
      },
      boxShadow: {
        "soft-sm": "0 1px 2px rgba(28, 25, 23, 0.04)",
        "soft-md": "0 1px 2px rgba(28, 25, 23, 0.04), 0 14px 32px -18px rgba(28, 25, 23, 0.22)",
        "soft-lg": "0 16px 40px -16px rgba(28, 25, 23, 0.28)",
        "hard-sm": "2px 2px 0px 0px rgba(28, 25, 23, 1)",
        "hard-md": "4px 4px 0px 0px rgba(28, 25, 23, 1)",
        "hard-lg": "8px 8px 0px 0px rgba(28, 25, 23, 1)",
        "hard-amber": "4px 4px 0px 0px #a9743f",
      },
    },
  },
  plugins: [],
};
