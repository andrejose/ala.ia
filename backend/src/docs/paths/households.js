import {
  createHouseholdSchema,
  inviteMemberSchema,
  updateHouseholdSchema,
  updateMemberSchema,
} from "../../schemas/households.schemas.js";
import {
  badRequest,
  invitationIdParam,
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
const invitationTags = ["Convites"];
const memberTags = ["Membros"];
const invitationGone = error("Convite expirado, já respondido ou cancelado.", "INVITATION_UNAVAILABLE", "Este convite expirou. Peça um novo para quem convidou.");

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

  "/households/{householdId}/invitations": {
    parameters: [householdIdParam],
    get: {
      tags: invitationTags,
      summary: "Lista os convites pendentes do household",
      responses: {
        200: json("Convites pendentes e ainda válidos.", { type: "array", items: ref("Invitation") }),
        401: unauthorized,
        404: notFound,
      },
    },
    post: {
      tags: invitationTags,
      summary: "Convida alguém por e-mail (dono)",
      description:
        "Cria um convite pendente, que vale por 7 dias. A pessoa só vira membro quando aceitar em " +
        "`POST /invitations/{invitationId}/accept`. O e-mail não precisa ter cadastro: o convite espera a " +
        "pessoa se cadastrar com ele, e a resposta é a mesma nos dois casos.",
      requestBody: jsonBody(inviteMemberSchema),
      responses: {
        201: json("Convite criado.", ref("Invitation")),
        400: error("E-mail inválido ou o próprio e-mail.", "BUSINESS_RULE", "Você já faz parte deste household."),
        401: unauthorized,
        403: forbiddenOwner,
        404: notFound,
        409: error("A pessoa já é membro ou já tem convite pendente.", "CONFLICT", "Já existe um convite pendente para este e-mail."),
      },
    },
  },

  "/households/{householdId}/invitations/{invitationId}": {
    parameters: [householdIdParam, invitationIdParam],
    delete: {
      tags: invitationTags,
      summary: "Cancela um convite pendente (dono)",
      responses: { 204: noContent("Convite cancelado."), 401: unauthorized, 403: forbiddenOwner, 404: notFound },
    },
  },

  "/invitations": {
    get: {
      tags: invitationTags,
      summary: "Convites recebidos",
      description: "Convites pendentes para o e-mail do usuário logado.",
      responses: {
        200: json("Convites pendentes.", { type: "array", items: ref("MyInvitation") }),
        401: unauthorized,
      },
    },
  },

  "/invitations/{invitationId}/accept": {
    parameters: [invitationIdParam],
    post: {
      tags: invitationTags,
      summary: "Aceita um convite",
      responses: {
        200: json("Entrou no household.", ref("Household")),
        401: unauthorized,
        404: error("Convite inexistente ou que não é para você.", "NOT_FOUND", "Convite não encontrado."),
        410: invitationGone,
      },
    },
  },

  "/invitations/{invitationId}/decline": {
    parameters: [invitationIdParam],
    post: {
      tags: invitationTags,
      summary: "Recusa um convite",
      responses: {
        204: noContent("Convite recusado."),
        401: unauthorized,
        404: error("Convite inexistente ou que não é para você.", "NOT_FOUND", "Convite não encontrado."),
        410: invitationGone,
      },
    },
  },
};
