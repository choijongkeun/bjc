import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { traeBadgePlugin } from "vite-plugin-trae-solo-badge";

const apiBaseUrl = process.env.BJC_API_BASE_URL ?? "http://127.0.0.1:3001";

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5174,
    proxy: {
      "/api": {
        target: apiBaseUrl,
        changeOrigin: true,
      },
      "/health": {
        target: apiBaseUrl,
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: "hidden",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
  plugins: [
    react({
      babel: {
        plugins: ["react-dev-locator"],
      },
    }),
    traeBadgePlugin({
      variant: "dark",
      position: "bottom-right",
      prodOnly: true,
      clickable: true,
      clickUrl: "https://www.trae.ai/solo?showJoin=1",
      autoTheme: true,
      autoThemeTarget: "#root",
    }),
    tsconfigPaths(),
  ],
});
