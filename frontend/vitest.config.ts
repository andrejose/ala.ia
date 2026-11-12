import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Testes do frontend: componentes renderizados no jsdom, com a API simulada
// pelo MSW (src/test/server.ts). Nada aqui precisa do backend rodando.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
