import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// Os testes usam o Supabase LOCAL, configurado no .env.test (veja .env.test.example)
const { parsed: testEnv = {} } = dotenv.config({ path: ".env.test", processEnv: {}, quiet: true });

export default defineConfig({
  test: {
    environment: "node",
    env: testEnv,
    setupFiles: ["./tests/setup.js"],
    testTimeout: 15000,
  },
});
