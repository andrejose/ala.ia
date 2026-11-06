import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createAccount, createTestUser, uniqueEmail } from "./helpers/users.js";

let owner;
let member;
let outsider;

beforeAll(async () => {
  owner = await createTestUser({ name: "Dona da Casa" });
  member = await createTestUser({ name: "Membro da Casa" });
  outsider = await createTestUser({ name: "De Fora" });
});

// Cria um household novo do owner, já com o member convidado
async function sharedHousehold(name = "Casa") {
  const created = await request(app).post("/households").set(owner.authHeader).send({ name });
  const base = `/households/${created.body.id}`;
  await request(app).post(`${base}/members`).set(owner.authHeader).send({ email: member.email });
  return { id: created.body.id, base };
}

describe("Households", () => {
  it("lista os households do usuário com o papel", async () => {
    const res = await request(app).get("/households").set(owner.authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toContainEqual(expect.objectContaining({ id: owner.householdId, role: "owner" }));
  });

  it("cria um household com o usuário como dono", async () => {
    const res = await request(app).post("/households").set(owner.authHeader).send({ name: "  Casa de Praia  " });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: expect.any(String), name: "Casa de Praia", role: "owner" });

    const get = await request(app).get(`/households/${res.body.id}`).set(owner.authHeader);
    expect(get.status).toBe(200);
    expect(get.body.name).toBe("Casa de Praia");
  });

  it("dono renomeia; membro não pode (403)", async () => {
    const { base } = await sharedHousehold();

    const byOwner = await request(app).patch(base).set(owner.authHeader).send({ name: "Lar" });
    expect(byOwner.status).toBe(200);
    expect(byOwner.body.name).toBe("Lar");

    const byMember = await request(app).patch(base).set(member.authHeader).send({ name: "Meu" });
    expect(byMember.status).toBe(403);
  });

  it("quem não é membro recebe 404", async () => {
    const res = await request(app).get(`/households/${owner.householdId}`).set(outsider.authHeader);

    expect(res.status).toBe(404);
  });

  it("dono exclui o household com membros e dados (cascata); membro não pode", async () => {
    const { base } = await sharedHousehold("Para excluir");
    await createAccount(owner, { name: "Conta da casa" }, base);

    const byMember = await request(app).delete(base).set(member.authHeader);
    expect(byMember.status).toBe(403);

    const byOwner = await request(app).delete(base).set(owner.authHeader);
    expect(byOwner.status).toBe(204);

    const after = await request(app).get(base).set(member.authHeader);
    expect(after.status).toBe(404);
  });
});

describe("Membros", () => {
  it("dono convida por e-mail; o membro passa a ver os dados do household", async () => {
    const created = await request(app).post("/households").set(owner.authHeader).send({ name: "Compartilhada" });
    const base = `/households/${created.body.id}`;
    const account = await createAccount(owner, { name: "Conjunta" }, base);

    const invite = await request(app)
      .post(`${base}/members`)
      .set(owner.authHeader)
      .send({ email: member.email.toUpperCase() });
    expect(invite.status).toBe(201);
    expect(invite.body).toMatchObject({ user_id: member.id, name: "Membro da Casa", role: "member" });

    const members = await request(app).get(`${base}/members`).set(member.authHeader);
    expect(members.status).toBe(200);
    expect(members.body.map((m) => m.role).sort()).toEqual(["member", "owner"]);

    const accounts = await request(app).get(`${base}/accounts`).set(member.authHeader);
    expect(accounts.body.map((a) => a.id)).toContain(account.id);

    const me = await request(app).get("/me").set(member.authHeader);
    expect(me.body.households).toContainEqual(expect.objectContaining({ id: created.body.id, role: "member" }));
  });

  it("recusa convite duplicado (409), e-mail inexistente (404) e convite feito por membro (403)", async () => {
    const { base } = await sharedHousehold();

    const duplicate = await request(app).post(`${base}/members`).set(owner.authHeader).send({ email: member.email });
    expect(duplicate.status).toBe(409);

    const unknown = await request(app).post(`${base}/members`).set(owner.authHeader).send({ email: uniqueEmail("ninguem") });
    expect(unknown.status).toBe(404);

    const byMember = await request(app).post(`${base}/members`).set(member.authHeader).send({ email: outsider.email });
    expect(byMember.status).toBe(403);
  });

  it("membro sai do household; não pode remover outros (403)", async () => {
    const { base } = await sharedHousehold();

    const removeOwner = await request(app).delete(`${base}/members/${owner.id}`).set(member.authHeader);
    expect(removeOwner.status).toBe(403);

    const leave = await request(app).delete(`${base}/members/${member.id}`).set(member.authHeader);
    expect(leave.status).toBe(204);

    const after = await request(app).get(base).set(member.authHeader);
    expect(after.status).toBe(404);
  });

  it("dono remove um membro", async () => {
    const { base } = await sharedHousehold();

    const res = await request(app).delete(`${base}/members/${member.id}`).set(owner.authHeader);
    expect(res.status).toBe(204);
  });

  it("o único dono não pode sair nem se rebaixar (409 LAST_OWNER)", async () => {
    const { base } = await sharedHousehold();

    const leave = await request(app).delete(`${base}/members/${owner.id}`).set(owner.authHeader);
    expect(leave.status).toBe(409);
    expect(leave.body.error.code).toBe("LAST_OWNER");

    const demote = await request(app)
      .patch(`${base}/members/${owner.id}`)
      .set(owner.authHeader)
      .send({ role: "member" });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe("LAST_OWNER");
  });

  it("depois de promover outro membro, o dono pode se rebaixar e sair", async () => {
    const { base } = await sharedHousehold();

    const promote = await request(app)
      .patch(`${base}/members/${member.id}`)
      .set(owner.authHeader)
      .send({ role: "owner" });
    expect(promote.status).toBe(200);
    expect(promote.body.role).toBe("owner");

    const leave = await request(app).delete(`${base}/members/${owner.id}`).set(owner.authHeader);
    expect(leave.status).toBe(204);

    const members = await request(app).get(`${base}/members`).set(member.authHeader);
    expect(members.body).toEqual([expect.objectContaining({ user_id: member.id, role: "owner" })]);
  });

  it("membro não altera papéis (403) e PATCH de quem não é membro dá 404", async () => {
    const { base } = await sharedHousehold();

    const byMember = await request(app)
      .patch(`${base}/members/${member.id}`)
      .set(member.authHeader)
      .send({ role: "owner" });
    expect(byMember.status).toBe(403);

    const notMember = await request(app)
      .patch(`${base}/members/${outsider.id}`)
      .set(owner.authHeader)
      .send({ role: "owner" });
    expect(notMember.status).toBe(404);
  });
});
