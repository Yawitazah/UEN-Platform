import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ["@shopify/app-bridge"]
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: "index.html",
        widget: "src/client/widget.ts"
      },
      output: {
        entryFileNames: (chunk) => chunk.name === "widget" ? "widget.js" : "assets/[name]-[hash].js"
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/shopify/api": "http://localhost:3000"
    }
  }
});
