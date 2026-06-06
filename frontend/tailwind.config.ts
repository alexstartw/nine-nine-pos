import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sand: "#C5BAAF",
        clay: "#8A5A44",
        moss: "#6B705C",
        dusk: "#463F3A",
        linen: "#F6F0E4",
      },
    },
  },
  plugins: [],
};

export default config;
