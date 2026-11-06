import { components } from "./components.js";
import { authPaths } from "./paths/auth.js";
import { financePaths } from "./paths/finance.js";
import { householdPaths } from "./paths/households.js";
import { mePaths } from "./paths/me.js";

// Especificação OpenAPI servida em /docs (Swagger UI) e /docs.json.
// Cada recurso novo ganha um arquivo em ./paths e entra no objeto "paths" abaixo.
export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Ala.ia API",
    version: "1.0.0",
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
    { name: "Households", description: "Grupos que compartilham as finanças (ex.: um casal)" },
    { name: "Membros", description: "Quem tem acesso a cada household" },
    { name: "Convites", description: "Convidar, aceitar e recusar a entrada em um household" },
    { name: "Contas", description: "Contas do household, com saldo calculado" },
    { name: "Categorias", description: "Categorias de receitas e despesas" },
    { name: "Lançamentos", description: "Receitas, despesas e transferências" },
    { name: "Relatórios", description: "Resumo do mês e gastos por categoria" },
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
    ...householdPaths,
    ...financePaths,
  },
  components,
};
