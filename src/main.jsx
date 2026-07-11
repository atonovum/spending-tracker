import React from "react";
import ReactDOM from "react-dom/client";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { registerSW } from "virtual:pwa-register";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./index.css";
import App from "./App.jsx";

registerSW({ immediate: true });

// Design tokens (mirrors the CSS variables declared in index.css).
const theme = createTheme({
  colors: {
    // brand blue scale around --st-primary (#3182F6)
    brand: [
      "#E8F3FF",
      "#D3E7FD",
      "#A9CEFB",
      "#7EB4F9",
      "#589EF8",
      "#3182F6",
      "#2B74E0",
      "#1B64DA",
      "#1857BE",
      "#154AA3",
    ],
  },
  primaryColor: "brand",
  primaryShade: 5,
  defaultRadius: "md",
  cursorType: "pointer",
  fontFamily:
    "'Pretendard Variable', Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  headings: {
    fontFamily:
      "'Pretendard Variable', Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontWeight: "700",
  },
  radius: {
    md: "0.625rem",
    lg: "0.875rem",
    xl: "1.25rem",
    card: "1.25rem",
    chip: "999px",
  },
  shadows: {
    soft: "var(--st-shadow-soft)",
    card: "var(--st-shadow-card)",
    float: "var(--st-shadow-float)",
  },
  components: {
    Card: {
      defaultProps: { radius: "card", padding: "lg" },
      styles: {
        root: {
          borderColor: "var(--st-line)",
          backgroundColor: "var(--st-surface)",
        },
      },
    },
    Paper: {
      styles: {
        root: { borderColor: "var(--st-line)" },
      },
    },
    Button: {
      styles: {
        root: { fontWeight: 600 },
      },
    },
    Modal: {
      defaultProps: { radius: "card", overlayProps: { backgroundOpacity: 0.45, blur: 4 } },
      styles: {
        title: { fontWeight: 700, letterSpacing: "-0.02em" },
        content: { boxShadow: "var(--st-shadow-card)" },
      },
    },
    Menu: {
      defaultProps: { radius: "lg", shadow: "card" },
      styles: {
        dropdown: { borderColor: "var(--st-line)" },
      },
    },
    Input: {
      styles: {
        input: { borderColor: "var(--st-line)" },
      },
    },
    Divider: {
      defaultProps: { color: "var(--st-grid)" },
    },
    Badge: {
      styles: {
        root: { textTransform: "none", fontWeight: 600 },
      },
    },
    Table: {
      styles: {
        th: { color: "var(--st-muted)", fontWeight: 600 },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" />
      <App />
    </MantineProvider>
  </React.StrictMode>
);
