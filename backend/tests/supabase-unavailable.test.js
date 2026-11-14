import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fromSupabaseError, unavailableError } from "../src/errors/supabaseErrors.js";

// Supabase fora do alcance ou mal configurado: quem usa o app recebe 503
// ("tente de novo"), e o motivo vai para o log. Os formatos dos erros abaixo
// são os que o supabase-js devolve de verdade em cada caso.

describe("Supabase indisponível — formatos de erro", () => {
  it("login sem conseguir conectar (AuthRetryableFetchError) vira 503", () => {
    const error = Object.assign(new Error("fetch failed"), { name: "AuthRetryableFetchError", status: 0 });
    const http = fromSupabaseError(error);

    expect(http).toMatchObject({ status: 503, code: "SERVICE_UNAVAILABLE" });
    expect(http.reason).toMatch(/Não foi possível conectar ao Supabase/);
  });

  it("consulta sem conseguir conectar vira 503, com a causa no motivo", () => {
    const error = {
      code: "",
      message: "TypeError: fetch failed",
      details: "TypeError: fetch failed\n\nCaused by: Error: getaddrinfo ENOTFOUND supabase.invalid",
    };
    const http = fromSupabaseError(error);

    expect(http.status).toBe(503);
    expect(http.reason).toContain("getaddrinfo ENOTFOUND");
  });

  it("chave recusada pelo Supabase vira 503, com o motivo apontando a variável", () => {
    const http = fromSupabaseError({ message: "Invalid API key", hint: "Double check your Supabase `anon` or `service_role` API key." });

    expect(http.status).toBe(503);
    expect(http.reason).toContain("SUPABASE_PUBLISHABLE_KEY");
  });

  it("os outros erros continuam como antes", () => {
    const wrongPassword = Object.assign(new Error("Invalid login credentials"), {
      name: "AuthApiError",
      __isAuthError: true,
      status: 400,
      code: "invalid_credentials",
    });

    expect(unavailableError(wrongPassword)).toBeNull();
    expect(fromSupabaseError({ code: "PGRST116", message: "0 rows" })).toMatchObject({ status: 404 });
    expect(unavailableError(new Error("qualquer outra coisa"))).toBeNull();
  });
});

describe("Supabase indisponível — de ponta a ponta", () => {
  it("com o Supabase fora do ar, o login responde 503 e o log mostra o motivo", () => {
    // Outro processo, com a SUPABASE_URL apontando para uma porta fechada
    const backend = fileURLToPath(new URL("..", import.meta.url));
    const script = `
      const { default: request } = await import("supertest");
      const { app } = await import("./src/app.js");
      const res = await request(app).post("/api/auth/login").send({ email: "x@example.com", password: "senha-qualquer" });
      console.log("RESPOSTA " + JSON.stringify({ status: res.status, body: res.body }));
    `;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: backend,
      env: { ...process.env, SUPABASE_URL: "http://127.0.0.1:59999", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_teste", NODE_ENV: "test" },
      encoding: "utf8",
      timeout: 30_000,
    });

    const answer = JSON.parse(/RESPOSTA (.*)/.exec(run.stdout)[1]);
    expect(answer).toEqual({
      status: 503,
      body: {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Não foi possível falar com o banco de dados agora. Tente de novo em instantes.",
        },
      },
    });
    const log = JSON.parse(run.stderr.split("\n").find((line) => line.includes("SERVICE_UNAVAILABLE")));
    expect(log).toMatchObject({ level: "error", code: "SERVICE_UNAVAILABLE" });
    expect(log.reason).toMatch(/Não foi possível conectar ao Supabase/);
  });
});
