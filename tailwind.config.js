/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101418",
        paper: "#f8fafc",
        line: "#e2e8f0",
        muted: "#64748b",
        income: "#1565c0",
        expense: "#c62828",
        balance: "#2e7d32",
      },
      boxShadow: {
        soft: "0 10px 30px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};
