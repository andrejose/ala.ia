import { toOpenApiSchema } from "../../lib/zod.js";
import { loginSchema, refreshSchema, signupSchema } from "../../schemas/auth.schemas.js";

const jsonBody = (schema) => ({
  required: true,
  content: { "application/json": { schema: toOpenApiSchema(schema) } },
});

const authResponse = (description) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/AuthResponse" } } },
});

const error = (description, code, message) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
      example: { error: { code, message } },
    },
  },
});

export const authPaths = {
  "/auth/signup": {
    post: {
      tags: ["Autenticação"],
      summary: "Cadastra um usuário",
      description:
        "Cria o usuário no Supabase Auth. O banco cria automaticamente o perfil e um household pessoal, do qual o usuário é dono.",
      security: [],
      requestBody: jsonBody(signupSchema),
      responses: {
        201: authResponse("Usuário criado. Com a confirmação de e-mail desligada, já vem com a sessão."),
        400: { $ref: "#/components/responses/ValidationError" },
        409: error("E-mail já cadastrado.", "EMAIL_ALREADY_REGISTERED", "Este e-mail já está cadastrado."),
        429: { $ref: "#/components/responses/RateLimited" },
      },
    },
  },

  "/auth/login": {
    post: {
      tags: ["Autenticação"],
      summary: "Faz login com e-mail e senha",
      security: [],
      requestBody: jsonBody(loginSchema),
      responses: {
        200: authResponse("Login realizado."),
        400: { $ref: "#/components/responses/ValidationError" },
        401: error("E-mail ou senha incorretos.", "INVALID_CREDENTIALS", "E-mail ou senha incorretos."),
        429: { $ref: "#/components/responses/RateLimited" },
      },
    },
  },

  "/auth/refresh": {
    post: {
      tags: ["Autenticação"],
      summary: "Renova a sessão",
      description: "Troca o `refresh_token` por um novo par de tokens. O refresh_token antigo deixa de valer.",
      security: [],
      requestBody: jsonBody(refreshSchema),
      responses: {
        200: authResponse("Sessão renovada."),
        400: { $ref: "#/components/responses/ValidationError" },
        401: error("Refresh token inválido, já usado ou sessão encerrada.", "INVALID_REFRESH_TOKEN", "Sessão inválida ou encerrada. Faça login novamente."),
      },
    },
  },

  "/auth/logout": {
    post: {
      tags: ["Autenticação"],
      summary: "Encerra a sessão atual",
      description:
        "Revoga a sessão do token enviado: o refresh_token deixa de funcionar. O access_token continua válido até expirar, então o cliente deve descartá-lo.",
      responses: {
        204: { description: "Sessão encerrada." },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
  },
};
