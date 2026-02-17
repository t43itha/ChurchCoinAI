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
        ink: "#000000",
        paper: "#fafaf9",
        charcoal: "#1a1a1a",
        ledger: "#e5e5e5",
        grey: {
          dark: "#44403c",
          mid: "#666666",
          light: "#f5f5f5",
        },
        sage: {
          DEFAULT: "#6b8e6b",
          light: "#e8f0e8",
          dark: "#557555",
        },
        amber: {
          DEFAULT: "#d4a574",
          light: "#faefe6",
          dark: "#b5895b",
        },
        error: {
          DEFAULT: "#c64545",
          light: "#fce8e8",
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
        "hard-sm": "2px 2px 0px 0px rgba(0, 0, 0, 1)",
        "hard-md": "4px 4px 0px 0px rgba(0, 0, 0, 1)",
        "hard-lg": "8px 8px 0px 0px rgba(0, 0, 0, 1)",
        "hard-amber": "4px 4px 0px 0px #d4a574",
      },
    },
  },
  plugins: [],
};
