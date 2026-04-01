import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
      },
      "/ws": {
        target: "ws://localhost:8080", // Your Go backend
        ws: true, // Enable WebSocket proxying
      },
    },
  },
});
