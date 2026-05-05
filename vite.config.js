import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "Spending Tracker",
        short_name: "Spending",
        start_url: "/",
        display: "standalone",
        background_color: "#f8fafc",
        theme_color: "#ffffff",
        lang: "ko-KR",
      },
    }),
  ],
});
