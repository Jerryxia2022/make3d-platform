import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/frontend/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#17202a",
        graphite: "#2f343b",
        mint: "#2bbf9c",
        coral: "#ef735c",
        paper: "#f6f7f9",
        ash: "#e7eaee",
        steel: "#6b7280",
        line: "#d9dee5",
      },
    },
  },
  plugins: [],
};

export default config;
