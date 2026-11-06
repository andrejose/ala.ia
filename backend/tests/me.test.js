import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createTestUser } from "./helpers/users.js";

describe("GET /me", () => {
  let user;
  beforeAll(async () => {
    user = await createTestUser({ name: "Carla Souza" });
  });

  it("devolve o perfil e o household pessoal criado no cadastro", async () => {
    const res = await request(app).get("/me").set(user.authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: user.id, name: "Carla Souza", email: user.email });
    expect(res.body.households).toHaveLength(1);
    expect(res.body.households[0]).toMatchObject({ name: "Finanças de Carla Souza", role: "owner" });
  });

  it("sem token devolve 401", async () => {
    const res = await request(app).get("/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("com token inválido devolve 401", async () => {
    const res = await request(app).get("/me").set("Authorization", "Bearer token-invalido");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("não mostra households de outro usuário (RLS)", async () => {
    const other = await createTestUser({ name: "Outra Pessoa" });
    const res = await request(app).get("/me").set(other.authHeader);

    expect(res.body.households).toHaveLength(1);
    expect(res.body.households[0].name).toBe("Finanças de Outra Pessoa");
  });
});

describe("PATCH /me", () => {
  it("atualiza o nome", async () => {
    const user = await createTestUser({ name: "Nome Antigo" });
    const res = await request(app).patch("/me").set(user.authHeader).send({ name: "  Nome Novo  " });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Nome Novo");

    const again = await request(app).get("/me").set(user.authHeader);
    expect(again.body.name).toBe("Nome Novo");
  });

  it("valida o body com 400", async () => {
    const user = await createTestUser();
    const res = await request(app).patch("/me").set(user.authHeader).send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
