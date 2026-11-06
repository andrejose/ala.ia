import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Em desenvolvimento, /api/* vai para o backend (sem precisar de CORS)
    proxy: {
      "/api": {
        // API_TARGET permite apontar para outra porta (ex.: API_TARGET=http://localhost:3101 npm run dev)
        target: process.env.API_TARGET ?? "http://localhost:3001",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
