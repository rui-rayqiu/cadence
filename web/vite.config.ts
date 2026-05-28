import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4779,
    proxy: {
      "/api": "http://localhost:4778",
    },
  },
  build: {
    outDir: "../dist/web",
  },
});
