import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("App", () => {
  it("GET /health responde ok", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("rota inexistente devolve 404 no formato padrão", async () => {
    const res = await request(app).get("/nao-existe");

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("ROUTE_NOT_FOUND");
  });

  it("JSON malformado devolve 400", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });
});

describe("Documentação", () => {
  it("GET /docs.json devolve a especificação OpenAPI", async () => {
    const res = await request(app).get("/docs.json");

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe("3.1.0");
    expect(res.body.paths).toHaveProperty("/auth/login");
    expect(res.body.components.securitySchemes).toHaveProperty("bearerAuth");
  });

  it("GET /docs/ serve o Swagger UI", async () => {
    const res = await request(app).get("/docs/");

    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });
});
