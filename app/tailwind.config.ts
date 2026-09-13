import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#B4513A",
          foreground: "#FFFFFF"
        },
        secondary: {
          DEFAULT: "#C68A3B",
          foreground: "#2A2522"
        },
        success: {
          DEFAULT: "#6B7F3F",
          foreground: "#FFFFFF"
        },
        background: "#F7F1E5",
        foreground: "#2A2522",
        border: "#E4D9C4",
        muted: {
          DEFAULT: "#EFE6D3",
          foreground: "#6B6355"
        },
        card: {
          DEFAULT: "#FFFFFF",
          foreground: "#2A2522"
        },
        destructive: {
          DEFAULT: "#B3261E",
          foreground: "#FFFFFF"
        }
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem"
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
