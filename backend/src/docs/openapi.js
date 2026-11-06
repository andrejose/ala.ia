import { components } from "./components.js";
import { authPaths } from "./paths/auth.js";
import { mePaths } from "./paths/me.js";

// Especificação OpenAPI servida em /docs (Swagger UI) e /docs.json.
// Cada recurso novo ganha um arquivo em ./paths e entra no objeto "paths" abaixo.
export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Ala.ia API",
    version: "0.1.0",
    description:
      "API REST de controle financeiro pessoal.\n\n" +
      "**Como testar:** faça `POST /auth/signup` ou `POST /auth/login`, copie o `session.access_token` " +
      "e clique em **Authorize** para enviar o token nas demais rotas.",
  },
  servers: [{ url: "/", description: "Este servidor" }],
  tags: [
    { name: "Sistema" },
    { name: "Autenticação", description: "Cadastro, login e sessão (Supabase Auth)" },
    { name: "Perfil", description: "Dados do usuário logado" },
  ],
  // Por padrão toda rota exige o token; rotas públicas declaram "security: []"
  security: [{ bearerAuth: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["Sistema"],
        summary: "Verifica se a API está no ar",
        security: [],
        responses: {
          200: {
            description: "API no ar.",
            content: { "application/json": { example: { status: "ok" } } },
          },
        },
      },
    },
    ...authPaths,
    ...mePaths,
  },
  components,
};
