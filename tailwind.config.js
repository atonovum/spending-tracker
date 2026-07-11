/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--st-ink)",
        "ink-2": "var(--st-ink-2)",
        paper: "var(--st-bg)",
        surface: "var(--st-surface)",
        "surface-soft": "var(--st-surface-soft)",
        line: "var(--st-line)",
        grid: "var(--st-grid)",
        muted: "var(--st-muted)",
        income: "var(--st-income)",
        expense: "var(--st-expense)",
        balance: "var(--st-primary)",
        accent: "var(--st-primary)",
        primary: "var(--st-primary)",
        "primary-soft": "var(--st-primary-soft)",
      },
      boxShadow: {
        soft: "var(--st-shadow-soft)",
        card: "var(--st-shadow-card)",
        float: "var(--st-shadow-float)",
      },
      borderRadius: {
        card: "var(--st-radius-card)",
        control: "var(--st-radius-control)",
        chip: "999px",
      },
    },
  },
  plugins: [],
};
