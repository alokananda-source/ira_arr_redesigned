/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        positive: "#3f6b3f",
        negative: "#a8402f",
        warning: "#b5751f",
        paper: "#f2ecda",
        "paper-surface": "#faf7ec",
        ink: "#1c1a14",
      },
      fontFamily: {
        sans: ["var(--font-jakarta)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
