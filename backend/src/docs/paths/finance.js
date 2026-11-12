import { createAccountSchema, listAccountsQuery, updateAccountSchema } from "../../schemas/accounts.schemas.js";
import { createCategorySchema, listCategoriesQuery, updateCategorySchema } from "../../schemas/categories.schemas.js";
import { commitImportSchema, MAX_IMPORT_FILE, MAX_IMPORT_ROWS, previewQuery } from "../../schemas/imports.schemas.js";
import { byCategoryQuery, MAX_SERIES_MONTHS, monthlyQueryFields, summaryQuery } from "../../schemas/reports.schemas.js";
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
      listDescription: "Inclui as categorias arquivadas (`is_active: false`); filtre com `?is_active=true`.",
      updateDescription: 'Para arquivar uma categoria (ela sai das listas, mas o histórico continua), envie `{ "is_active": false }`.',
      createErrors: {
        409: error("Já existe categoria com esse nome e tipo.", "CONFLICT", "Já existe uma categoria com esse nome e tipo neste household."),
      },
      updateErrors: {
        409: error("Nome duplicado, ou mudança de tipo de categoria com lançamentos.", "RESOURCE_IN_USE", 'A categoria tem lançamentos: não pode ser excluída nem mudar de tipo. Para tirá-la das listas, arquive-a com PATCH { "is_active": false }.'),
      },
      deleteErrors: {
        409: error("A categoria tem lançamentos.", "RESOURCE_IN_USE", 'A categoria tem lançamentos: não pode ser excluída nem mudar de tipo. Para tirá-la das listas, arquive-a com PATCH { "is_active": false }.'),
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

  "/households/{householdId}/reports/monthly": {
    parameters: [householdIdParam],
    get: {
      tags: ["Relatórios"],
      summary: "Resumo mês a mês",
      description:
        "O resumo de cada mês do intervalo, do mais antigo para o mais recente, inclusive os meses sem " +
        `lançamentos (zerados). Padrão: os últimos 6 meses. No máximo ${MAX_SERIES_MONTHS} meses.`,
      parameters: queryParams(monthlyQueryFields),
      responses: { 200: json("Meses do intervalo.", ref("ReportMonthly")), 400: badRequest, 401: unauthorized, 404: notFound },
    },
  },

  "/households/{householdId}/imports/preview": {
    parameters: [householdIdParam],
    post: {
      tags: ["Importação"],
      summary: "Lê um extrato e mostra a prévia",
      description:
        "Envie o arquivo do extrato **cru no corpo** (ex.: `Content-Type: text/csv`), como veio do banco, " +
        `até ${MAX_IMPORT_FILE}. Aceita o CSV do extrato do Banco do Brasil e do Santander e o CSV da fatura do ` +
        "cartão Nubank; o banco é reconhecido pelo conteúdo. Nada é gravado: a resposta traz cada linha com o " +
        "tipo, a categoria sugerida (pelas categorias já usadas em descrições parecidas) e o status: " +
        "`new`, `imported` (já importada nesta conta) ou `similar` (mesma data e valor de um lançamento que já " +
        "está na conta). O arquivo é lido em memória e descartado.",
      parameters: queryParams(previewQuery),
      requestBody: {
        required: true,
        content: { "text/csv": { schema: { type: "string", format: "binary" } } },
      },
      responses: {
        200: json("Prévia da importação.", ref("ImportPreview")),
        400: error(
          "Arquivo vazio, formato não reconhecido ou linha em formato inesperado.",
          "UNSUPPORTED_FORMAT",
          "Não reconheci este arquivo. Por enquanto, a importação aceita: ..."
        ),
        401: unauthorized,
        404: notFound,
        413: error("Arquivo grande demais.", "PAYLOAD_TOO_LARGE", "O arquivo ou os dados enviados são grandes demais."),
      },
    },
  },

  "/households/{householdId}/imports": {
    parameters: [householdIdParam],
    post: {
      tags: ["Importação"],
      summary: "Grava as linhas escolhidas da prévia",
      description:
        `Até ${MAX_IMPORT_ROWS} linhas por vez, gravadas como lançamentos pagos na data do extrato, num único ` +
        "insert: ou entram todas, ou nenhuma. Linha já importada na conta (mesmo `import_hash`) é ignorada e " +
        "contada em `skipped`, então reenviar a mesma importação não duplica nada.",
      requestBody: jsonBody(commitImportSchema),
      responses: {
        201: json("Resultado da importação.", ref("ImportResult")),
        400: badRequest,
        401: unauthorized,
        404: notFound,
      },
    },
  },
};
