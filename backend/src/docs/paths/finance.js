import { createAccountSchema, listAccountsQuery, updateAccountSchema } from "../../schemas/accounts.schemas.js";
import { createCategorySchema, listCategoriesQuery, updateCategorySchema } from "../../schemas/categories.schemas.js";
import { byCategoryQuery, summaryQuery } from "../../schemas/reports.schemas.js";
import {
  createTransactionSchema,
  listTransactionsQuery,
  updateTransactionSchema,
} from "../../schemas/transactions.schemas.js";
import {
  badRequest,
  error,
  householdIdParam,
  idParam,
  json,
  jsonBody,
  noContent,
  notFound,
  queryParams,
  ref,
  unauthorized,
} from "../helpers.js";

const invalidReference = error(
  "Conta ou categoria inexistente, de outro household ou de tipo incompatível.",
  "INVALID_REFERENCE",
  "Referência inválida: verifique se os ids informados existem, pertencem ao mesmo household e são do tipo correto."
);

// CRUD padrão de um recurso do household: lista, cria, detalha, edita e exclui
function crud({ path, tag, schema, singular, create, update, listQuery, listResponse, extra = {} }) {
  const collection = `/households/{householdId}/${path}`;
  const item = `${collection}/{id}`;

  return {
    [collection]: {
      parameters: [householdIdParam],
      get: {
        tags: [tag],
        summary: `Lista ${extra.plural ?? path}`,
        ...(extra.listDescription && { description: extra.listDescription }),
        parameters: listQuery ? queryParams(listQuery) : [],
        responses: {
          200: listResponse ?? json("Lista.", { type: "array", items: ref(schema) }),
          400: badRequest,
          401: unauthorized,
          404: notFound,
        },
      },
      post: {
        tags: [tag],
        summary: `Cria ${singular}`,
        ...(extra.createDescription && { description: extra.createDescription }),
        requestBody: jsonBody(create),
        responses: {
          201: json("Criado.", ref(schema)),
          400: badRequest,
          401: unauthorized,
          404: notFound,
          ...extra.createErrors,
        },
      },
    },
    [item]: {
      parameters: [householdIdParam, idParam(singular)],
      get: {
        tags: [tag],
        summary: `Detalha ${singular}`,
        responses: { 200: json("Encontrado.", ref(schema)), 400: badRequest, 401: unauthorized, 404: notFound },
      },
      patch: {
        tags: [tag],
        summary: `Edita ${singular}`,
        ...(extra.updateDescription && { description: extra.updateDescription }),
        requestBody: jsonBody(update),
        responses: {
          200: json("Atualizado.", ref(schema)),
          400: badRequest,
          401: unauthorized,
          404: notFound,
          ...extra.updateErrors,
        },
      },
      delete: {
        tags: [tag],
        summary: `Exclui ${singular}`,
        responses: {
          204: noContent("Excluído."),
          400: badRequest,
          401: unauthorized,
          404: notFound,
          ...extra.deleteErrors,
        },
      },
    },
  };
}

export const financePaths = {
  ...crud({
    path: "accounts",
    tag: "Contas",
    schema: "Account",
    singular: "uma conta",
    create: createAccountSchema,
    update: updateAccountSchema,
    listQuery: listAccountsQuery,
    extra: {
      plural: "as contas com o saldo atual",
      listDescription: "O saldo atual considera apenas lançamentos pagos (com payment_date).",
      updateDescription: 'Para arquivar uma conta, envie `{ "is_active": false }`.',
      deleteErrors: {
        409: error(
          "A conta tem lançamentos.",
          "RESOURCE_IN_USE",
          'A conta tem lançamentos e não pode ser excluída. Arquive-a com PATCH { "is_active": false }.'
        ),
      },
    },
  }),

  ...crud({
    path: "categories",
    tag: "Categorias",
    schema: "Category",
    singular: "uma categoria",
    create: createCategorySchema,
    update: updateCategorySchema,
    listQuery: listCategoriesQuery,
    extra: {
      plural: "as categorias",
      createErrors: {
        409: error("Já existe categoria com esse nome e tipo.", "CONFLICT", "Já existe uma categoria com esse nome e tipo neste household."),
      },
      updateErrors: {
        409: error("Nome duplicado, ou mudança de tipo de categoria com lançamentos.", "RESOURCE_IN_USE", "A categoria tem lançamentos: não pode ser excluída nem mudar de tipo."),
      },
      deleteErrors: {
        409: error("A categoria tem lançamentos.", "RESOURCE_IN_USE", "A categoria tem lançamentos: não pode ser excluída nem mudar de tipo."),
      },
    },
  }),

  ...crud({
    path: "transactions",
    tag: "Lançamentos",
    schema: "Transaction",
    singular: "um lançamento",
    create: createTransactionSchema,
    update: updateTransactionSchema,
    listQuery: listTransactionsQuery,
    listResponse: json("Lançamentos paginados, do vencimento mais recente para o mais antigo.", ref("TransactionList")),
    extra: {
      plural: "os lançamentos",
      createDescription:
        "- **income / expense:** exigem `category_id` do mesmo tipo; sem `destination_account_id`.\n" +
        "- **transfer:** exige `destination_account_id` diferente de `account_id`; sem categoria.\n" +
        "- Sem `payment_date` o lançamento fica **pendente** e não entra no saldo.\n" +
        "- O autor (`user_id`) é sempre o usuário logado.",
      createErrors: { 400: { ...invalidReference, description: "Dados inválidos ou referência inválida (INVALID_REFERENCE)." } },
      updateDescription:
        "As regras de tipo valem sobre o lançamento resultante. Ex.: para virar transferência, envie " +
        '`{ "type": "transfer", "destination_account_id": "...", "category_id": null }`. ' +
        "Para marcar como pago, envie `payment_date`.",
    },
  }),

  "/households/{householdId}/reports/summary": {
    parameters: [householdIdParam],
    get: {
      tags: ["Relatórios"],
      summary: "Resumo do mês",
      description:
        "Receitas, despesas e resultado do mês, separando pagos e pendentes. " +
        "O mês considerado é o do vencimento (`due_date`). Transferências não entram.",
      parameters: queryParams(summaryQuery),
      responses: { 200: json("Resumo.", ref("ReportSummary")), 400: badRequest, 401: unauthorized, 404: notFound },
    },
  },

  "/households/{householdId}/reports/by-category": {
    parameters: [householdIdParam],
    get: {
      tags: ["Relatórios"],
      summary: "Total por categoria no mês",
      description: "Ordenado do maior para o menor total. O mês considerado é o do vencimento (`due_date`).",
      parameters: queryParams(byCategoryQuery),
      responses: { 200: json("Totais por categoria.", ref("ReportByCategory")), 400: badRequest, 401: unauthorized, 404: notFound },
    },
  },
};
