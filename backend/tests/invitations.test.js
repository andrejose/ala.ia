import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { createTestUser, inviteAndAccept, TEST_PASSWORD, uniqueEmail } from "./helpers/users.js";

let owner;
let guest;
let outsider;

beforeAll(async () => {
  owner = await createTestUser({ name: "Dona dos Convites" });
  guest = await createTestUser({ name: "Convidado" });
  outsider = await createTestUser({ name: "De Fora" });
});

async function newHousehold(name = "Casa") {
  const res = await request(app).post("/households").set(owner.authHeader).send({ name });
  return { id: res.body.id, base: `/households/${res.body.id}` };
}

const invite = (base, email, by = owner, role) =>
  request(app).post(`${base}/invitations`).set(by.authHeader).send({ email, ...(role && { role }) });

describe("Convite e aceite", () => {
  it("o convidado só vira membro depois de aceitar", async () => {
    const { id, base } = await newHousehold("Casa da Praia");

    const created = await invite(base, guest.email.toUpperCase());
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      household_id: id,
      email: guest.email,
      role: "member",
      status: "pending",
      invited_by: { user_id: owner.id, name: "Dona dos Convites" },
    });

    // Ainda não é membro
    const before = await request(app).get(base).set(guest.authHeader);
    expect(before.status).toBe(404);

    // Vê o convite, com o nome do household e de quem convidou
    const mine = await request(app).get("/invitations").set(guest.authHeader);
    expect(mine.status).toBe(200);
    expect(mine.body).toContainEqual(
      expect.objectContaining({ id: created.body.id, household_name: "Casa da Praia", invited_by_name: "Dona dos Convites", role: "member" })
    );

    const accepted = await request(app).post(`/invitations/${created.body.id}/accept`).set(guest.authHeader);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ id, name: "Casa da Praia", role: "member" });

    const after = await request(app).get(base).set(guest.authHeader);
    expect(after.status).toBe(200);

    // O convite sai da lista e não pode ser usado de novo
    const mineAfter = await request(app).get("/invitations").set(guest.authHeader);
    expect(mineAfter.body.map((i) => i.id)).not.toContain(created.body.id);

    const again = await request(app).post(`/invitations/${created.body.id}/accept`).set(guest.authHeader);
    expect(again.status).toBe(410);
    expect(again.body.error.code).toBe("INVITATION_UNAVAILABLE");
  });

  it("convite como dono dá o papel de dono ao aceitar", async () => {
    const { base } = await newHousehold();
    await inviteAndAccept(owner, guest, base, "owner");

    const members = await request(app).get(`${base}/members`).set(guest.authHeader);
    expect(members.body).toContainEqual(expect.objectContaining({ user_id: guest.id, role: "owner" }));
  });

  it("o convidado pode recusar", async () => {
    const { base } = await newHousehold();
    const created = await invite(base, guest.email);

    const declined = await request(app).post(`/invitations/${created.body.id}/decline`).set(guest.authHeader);
    expect(declined.status).toBe(204);

    const household = await request(app).get(base).set(guest.authHeader);
    expect(household.status).toBe(404);

    const accept = await request(app).post(`/invitations/${created.body.id}/accept`).set(guest.authHeader);
    expect(accept.status).toBe(410);
  });

  it("ninguém aceita um convite que não é para si (404)", async () => {
    const { base } = await newHousehold();
    const created = await invite(base, guest.email);

    const res = await request(app).post(`/invitations/${created.body.id}/accept`).set(outsider.authHeader);
    expect(res.status).toBe(404);

    const mine = await request(app).get("/invitations").set(outsider.authHeader);
    expect(mine.body.map((i) => i.id)).not.toContain(created.body.id);
  });
});

describe("Convite para quem ainda não tem conta", () => {
  it("é aceito pela resposta normal e fica esperando o cadastro com aquele e-mail", async () => {
    const { id, base } = await newHousehold("Casa Nova");
    const email = uniqueEmail("futuro");

    // Mesma resposta de um e-mail cadastrado: o convite não revela se o e-mail existe
    const created = await invite(base, email);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("pending");

    const signup = await request(app).post("/auth/signup").send({ name: "Pessoa Nova", email, password: TEST_PASSWORD });
    const headers = { Authorization: `Bearer ${signup.body.session.access_token}` };

    const mine = await request(app).get("/invitations").set(headers);
    expect(mine.body).toContainEqual(expect.objectContaining({ id: created.body.id, household_name: "Casa Nova" }));

    const accepted = await request(app).post(`/invitations/${created.body.id}/accept`).set(headers);
    expect(accepted.status).toBe(200);
    expect(accepted.body.id).toBe(id);
  });
});

describe("Gestão dos convites pelo household", () => {
  it("dono lista e cancela convites pendentes", async () => {
    const { base } = await newHousehold();
    const created = await invite(base, guest.email);

    const list = await request(app).get(`${base}/invitations`).set(owner.authHeader);
    expect(list.status).toBe(200);
    expect(list.body.map((i) => i.id)).toEqual([created.body.id]);

    const canceled = await request(app).delete(`${base}/invitations/${created.body.id}`).set(owner.authHeader);
    expect(canceled.status).toBe(204);

    const listAfter = await request(app).get(`${base}/invitations`).set(owner.authHeader);
    expect(listAfter.body).toEqual([]);

    const accept = await request(app).post(`/invitations/${created.body.id}/accept`).set(guest.authHeader);
    expect(accept.status).toBe(410);
  });

  it("recusa convite repetido, para quem já é membro e para o próprio e-mail", async () => {
    const { base } = await newHousehold();
    await invite(base, guest.email);

    const duplicate = await invite(base, guest.email);
    expect(duplicate.status).toBe(409);

    const self = await invite(base, owner.email);
    expect(self.status).toBe(400);

    const other = await newHousehold();
    await inviteAndAccept(owner, guest, other.base);
    const member = await invite(other.base, guest.email);
    expect(member.status).toBe(409);
  });

  it("membro não convida nem cancela (403); quem é de fora não vê os convites (404)", async () => {
    const { base } = await newHousehold();
    await inviteAndAccept(owner, guest, base);
    const pending = await invite(base, outsider.email);

    const byMember = await invite(base, uniqueEmail(), guest);
    expect(byMember.status).toBe(403);

    const cancelByMember = await request(app).delete(`${base}/invitations/${pending.body.id}`).set(guest.authHeader);
    expect(cancelByMember.status).toBe(403);

    const listByOutsider = await request(app).get(`${base}/invitations`).set(outsider.authHeader);
    expect(listByOutsider.status).toBe(404);
  });

  it("valida o e-mail (400)", async () => {
    const { base } = await newHousehold();
    const res = await invite(base, "nao-e-email");

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe("email");
  });
});
