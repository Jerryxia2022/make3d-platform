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
        paper: "#f7f5ef",
        ash: "#ece8de",
      },
    },
  },
  plugins: [],
};

export default config;
