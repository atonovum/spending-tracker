/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1F2024",
        paper: "#FFFBF5",
        line: "#F0EDE7",
        muted: "#8A8F9A",
        income: "#5BB97A",
        expense: "#F08A8A",
        balance: "#5C8DEF",
        accent: "#FFB454",
      },
      boxShadow: {
        soft: "0 8px 24px rgba(31, 32, 36, 0.06)",
      },
      borderRadius: {
        card: "20px",
        chip: "999px",
      },
    },
  },
  plugins: [],
};
