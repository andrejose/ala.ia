import {
  createHouseholdSchema,
  inviteMemberSchema,
  updateHouseholdSchema,
  updateMemberSchema,
} from "../../schemas/households.schemas.js";
import {
  badRequest,
  error,
  forbiddenOwner,
  householdIdParam,
  json,
  jsonBody,
  noContent,
  notFound,
  ref,
  unauthorized,
  userIdParam,
} from "../helpers.js";

const tags = ["Households"];
const memberTags = ["Membros"];
const lastOwner = error(
  "O household ficaria sem dono.",
  "LAST_OWNER",
  "O household precisa de pelo menos um dono. Promova outro membro a dono antes ou exclua o household."
);

export const householdPaths = {
  "/households": {
    get: {
      tags,
      summary: "Lista os households do usuário",
      responses: {
        200: json("Households com o papel do usuário em cada um.", { type: "array", items: ref("Household") }),
        401: unauthorized,
      },
    },
    post: {
      tags,
      summary: "Cria um household",
      description: "O usuário logado vira dono (owner) do novo household.",
      requestBody: jsonBody(createHouseholdSchema),
      responses: {
        201: json("Household criado.", ref("Household")),
        400: badRequest,
        401: unauthorized,
      },
    },
  },

  "/households/{householdId}": {
    parameters: [householdIdParam],
    get: {
      tags,
      summary: "Detalha um household",
      responses: { 200: json("Household.", ref("Household")), 401: unauthorized, 404: notFound },
    },
    patch: {
      tags,
      summary: "Renomeia um household (dono)",
      requestBody: jsonBody(updateHouseholdSchema),
      responses: {
        200: json("Household atualizado.", ref("Household")),
        400: badRequest,
        401: unauthorized,
        403: forbiddenOwner,
        404: notFound,
      },
    },
    delete: {
      tags,
      summary: "Exclui um household (dono)",
      description: "Apaga também membros, contas, categorias e lançamentos do household.",
      responses: { 204: noContent("Household excluído."), 401: unauthorized, 403: forbiddenOwner, 404: notFound },
    },
  },

  "/households/{householdId}/members": {
    parameters: [householdIdParam],
    get: {
      tags: memberTags,
      summary: "Lista os membros",
      responses: {
        200: json("Membros do household.", { type: "array", items: ref("Member") }),
        401: unauthorized,
        404: notFound,
      },
    },
    post: {
      tags: memberTags,
      summary: "Adiciona um membro pelo e-mail (dono)",
      description: "O usuário convidado precisa já ter cadastro.",
      requestBody: jsonBody(inviteMemberSchema),
      responses: {
        201: json("Membro adicionado.", ref("Member")),
        400: badRequest,
        401: unauthorized,
        403: forbiddenOwner,
        404: error("Household não encontrado ou nenhum usuário com esse e-mail.", "NOT_FOUND", "Nenhum usuário cadastrado com o email informado."),
        409: error("O usuário já é membro.", "CONFLICT", "Este usuário já é membro do household."),
      },
    },
  },

  "/households/{householdId}/members/{userId}": {
    parameters: [householdIdParam, userIdParam],
    patch: {
      tags: memberTags,
      summary: "Altera o papel de um membro (dono)",
      requestBody: jsonBody(updateMemberSchema),
      responses: {
        200: json("Membro atualizado.", ref("Member")),
        400: badRequest,
        401: unauthorized,
        403: forbiddenOwner,
        404: notFound,
        409: lastOwner,
      },
    },
    delete: {
      tags: memberTags,
      summary: "Remove um membro ou sai do household",
      description: "O dono remove qualquer membro. Um membro só pode remover a si mesmo (sair).",
      responses: {
        204: noContent("Membro removido."),
        401: unauthorized,
        403: error("Membro tentando remover outra pessoa.", "FORBIDDEN", "Apenas o dono pode remover outros membros."),
        404: notFound,
        409: lastOwner,
      },
    },
  },
};
