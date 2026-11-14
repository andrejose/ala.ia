import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { frontendRoutes } from "../src/frontend.js";
import { errorHandler, notFound } from "../src/middlewares/errorHandler.js";
import { requestLog } from "../src/middlewares/requestLog.js";
import { authRateLimit } from "../src/middlewares/security.js";

// Peças de produção: cabeçalhos de segurança, API em /api, limite de
// tentativas, log das requisições e o frontend entregue pelo backend.

describe("Produção — app", () => {
  it("manda os cabeçalhos de segurança", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("a API responde em /api, como o frontend chama, e também na raiz", async () => {
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok" });

    const me = await request(app).get("/api/me");
    expect(me.status).toBe(401);

    const missing = await request(app).get("/api/nao-existe");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("ROUTE_NOT_FOUND");
  });
});

describe("Produção — limite de tentativas", () => {
  it("passou do limite, responde 429 no formato de erro da API", async () => {
    const mini = express();
    mini.post("/login", authRateLimit({ limit: 2 }), (req, res) => res.status(200).json({ ok: true }));
    mini.use(errorHandler);

    expect((await request(mini).post("/login")).status).toBe(200);
    expect((await request(mini).post("/login")).status).toBe(200);
    const blocked = await request(mini).post("/login");

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(blocked.headers.ratelimit).toBeDefined();
  });
});

describe("Produção — log das requisições", () => {
  it("uma linha JSON por requisição, sem a query string", async () => {
    const lines = [];
    const mini = express();
    mini.use(requestLog((line) => lines.push(JSON.parse(line))));
    mini.get("/households/:id/accounts", (req, res) => res.status(200).json([]));
    mini.use(notFound);
    mini.use(errorHandler);

    await request(mini).get("/households/h1/accounts?email=maria@exemplo.com");
    await request(mini).get("/nao-existe");

    expect(lines).toEqual([
      expect.objectContaining({ level: "info", method: "GET", path: "/households/h1/accounts", status: 200, ms: expect.any(Number) }),
      expect.objectContaining({ level: "warn", path: "/nao-existe", status: 404 }),
    ]);
    expect(JSON.stringify(lines)).not.toContain("maria@exemplo.com");
  });
});

describe("Produção — frontend entregue pelo backend", () => {
  const dist = mkdtempSync(join(tmpdir(), "ala-dist-"));
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>Ala.ia</title>");
  writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log('app')");
  writeFileSync(join(dist, "favicon.svg"), "<svg/>");

  const mini = express();
  mini.get("/api/health", (req, res) => res.json({ status: "ok" }));
  mini.use(frontendRoutes(dist));
  mini.use(notFound);
  mini.use(errorHandler);

  it("qualquer tela recarregada no navegador recebe o index.html, sem cache", async () => {
    const res = await request(mini).get("/lancamentos").set("Accept", "text/html");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>Ala.ia</title>");
    expect(res.headers["cache-control"]).toBe("no-cache");
  });

  it("arquivos com hash ficam em cache por um ano; arquivo que não existe é 404", async () => {
    const asset = await request(mini).get("/assets/index-abc123.js");
    expect(asset.status).toBe(200);
    expect(asset.headers["cache-control"]).toContain("immutable");

    const missing = await request(mini).get("/assets/sumiu.js");
    expect(missing.status).toBe(404);

    const icon = await request(mini).get("/favicon.svg");
    expect(icon.status).toBe(200);
  });

  it("chamada da API que não existe continua sendo 404 em JSON, não o index.html", async () => {
    const api = await request(mini).get("/api/nao-existe").set("Accept", "text/html");
    expect(api.status).toBe(404);
    expect(api.body.error.code).toBe("ROUTE_NOT_FOUND");

    const json = await request(mini).get("/qualquer").set("Accept", "application/json");
    expect(json.status).toBe(404);
  });

  it("recusa uma pasta sem index.html", () => {
    expect(() => frontendRoutes(tmpdir())).toThrow(/index.html/);
  });
});
