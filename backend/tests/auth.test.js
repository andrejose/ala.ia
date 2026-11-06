import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createTestUser, TEST_PASSWORD, uniqueEmail } from "./helpers/users.js";

describe("POST /auth/signup", () => {
  it("cadastra o usuário e devolve a sessão", async () => {
    const email = uniqueEmail("signup");
    const res = await request(app)
      .post("/auth/signup")
      .send({ name: "Maria Silva", email, password: TEST_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email, name: "Maria Silva" });
    expect(res.body.session.access_token).toEqual(expect.any(String));
    expect(res.body.session.refresh_token).toEqual(expect.any(String));
  });

  it("normaliza o e-mail (trim e minúsculas)", async () => {
    const email = uniqueEmail("case");
    const res = await request(app)
      .post("/auth/signup")
      .send({ name: "Ana", email: `  ${email.toUpperCase()}  `, password: TEST_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
  });

  it("recusa e-mail já cadastrado com 409", async () => {
    const user = await createTestUser();
    const res = await request(app)
      .post("/auth/signup")
      .send({ name: "Outro", email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_ALREADY_REGISTERED");
  });

  it("valida o body com 400 e lista os campos inválidos", async () => {
    const res = await request(app)
      .post("/auth/signup")
      .send({ name: "", email: "nao-e-email", password: "123" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const fields = res.body.error.details.map((d) => d.path);
    expect(fields).toEqual(expect.arrayContaining(["name", "email", "password"]));
  });
});

describe("POST /auth/login", () => {
  let user;
  beforeAll(async () => {
    user = await createTestUser({ name: "Login" });
  });

  it("devolve a sessão com credenciais corretas", async () => {
    const res = await request(app).post("/auth/login").send({ email: user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.session.access_token).toEqual(expect.any(String));
  });

  it("recusa senha errada com 401", async () => {
    const res = await request(app).post("/auth/login").send({ email: user.email, password: "senha-errada" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("valida o body com 400", async () => {
    const res = await request(app).post("/auth/login").send({ email: user.email });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /auth/refresh e /auth/logout", () => {
  it("renova a sessão e, após o logout, o refresh_token deixa de valer", async () => {
    const user = await createTestUser({ name: "Sessão" });

    const refreshed = await request(app)
      .post("/auth/refresh")
      .send({ refresh_token: user.session.refresh_token });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user.id).toBe(user.id);

    const { access_token, refresh_token } = refreshed.body.session;

    const logout = await request(app).post("/auth/logout").set("Authorization", `Bearer ${access_token}`);
    expect(logout.status).toBe(204);

    const afterLogout = await request(app).post("/auth/refresh").send({ refresh_token });
    expect(afterLogout.status).toBe(401);
  });

  it("recusa refresh_token inválido com 401", async () => {
    const res = await request(app).post("/auth/refresh").send({ refresh_token: "token-invalido" });

    expect(res.status).toBe(401);
  });

  it("logout sem token devolve 401", async () => {
    const res = await request(app).post("/auth/logout");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});
