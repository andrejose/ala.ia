// Componentes reutilizados pela especificação OpenAPI (schemas de resposta e erros).

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", example: "VALIDATION_ERROR" },
        message: { type: "string", example: "Dados inválidos." },
        details: {
          description: "Detalhes opcionais. Em VALIDATION_ERROR, lista os campos inválidos.",
          oneOf: [
            {
              type: "array",
              items: {
                type: "object",
                properties: {
                  in: { type: "string", enum: ["params", "query", "body"] },
                  path: { type: "string", example: "email" },
                  message: { type: "string", example: "E-mail inválido" },
                },
              },
            },
            { type: "object" },
          ],
        },
      },
    },
  },
};

function errorResponse(description, code, message) {
  return {
    description,
    content: {
      "application/json": {
        schema: { $ref: "#/components/schemas/Error" },
        example: { error: { code, message } },
      },
    },
  };
}

export const components = {
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "Use o `access_token` devolvido por `/auth/login` ou `/auth/signup`.",
    },
  },

  schemas: {
    Error: errorSchema,

    User: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        email: { type: "string", format: "email", example: "maria@example.com" },
        name: { type: ["string", "null"], example: "Maria Silva" },
        created_at: { type: "string", format: "date-time" },
      },
    },

    Session: {
      type: "object",
      properties: {
        access_token: { type: "string", description: "JWT a enviar no header Authorization." },
        refresh_token: { type: "string", description: "Usado em /auth/refresh para obter um novo access_token." },
        token_type: { type: "string", example: "bearer" },
        expires_in: { type: "integer", description: "Validade do access_token em segundos.", example: 3600 },
        expires_at: { type: "integer", description: "Expiração em Unix timestamp (segundos)." },
      },
    },

    AuthResponse: {
      type: "object",
      properties: {
        user: { $ref: "#/components/schemas/User" },
        session: {
          oneOf: [{ $ref: "#/components/schemas/Session" }, { type: "null" }],
          description: "null quando o projeto exige confirmação de e-mail.",
        },
      },
    },

    Household: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string", example: "Pessoal" },
        role: { type: "string", enum: ["owner", "member"], description: "Papel do usuário logado neste household." },
        created_at: { type: "string", format: "date-time" },
        updated_at: { type: "string", format: "date-time" },
      },
    },

    Member: {
      type: "object",
      properties: {
        user_id: { type: "string", format: "uuid" },
        name: { type: ["string", "null"], example: "João Souza" },
        role: { type: "string", enum: ["owner", "member"] },
        joined_at: { type: "string", format: "date-time" },
      },
    },

    Invitation: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        household_id: { type: "string", format: "uuid" },
        email: { type: "string", format: "email", example: "joao@example.com" },
        role: { type: "string", enum: ["owner", "member"] },
        status: { type: "string", enum: ["pending", "accepted", "declined", "canceled"] },
        created_at: { type: "string", format: "date-time" },
        expires_at: { type: "string", format: "date-time", description: "7 dias depois do convite." },
        invited_by: {
          type: ["object", "null"],
          properties: { user_id: { type: "string", format: "uuid" }, name: { type: ["string", "null"] } },
        },
      },
    },

    MyInvitation: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        household_id: { type: "string", format: "uuid" },
        household_name: { type: "string", example: "Casa (Maria e João)" },
        role: { type: "string", enum: ["owner", "member"] },
        invited_by_name: { type: ["string", "null"], example: "Maria Silva" },
        created_at: { type: "string", format: "date-time" },
        expires_at: { type: "string", format: "date-time" },
      },
    },

    Account: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        household_id: { type: "string", format: "uuid" },
        name: { type: "string", example: "Nubank" },
        type: { type: "string", enum: ["checking", "savings", "investment", "cash", "credit_card"] },
        is_active: { type: "boolean", description: "false = conta arquivada." },
        initial_balance: { type: "number", example: 1000 },
        current_balance: {
          type: "number",
          example: 1250.4,
          description: "Saldo inicial + lançamentos pagos (pendentes não contam).",
        },
      },
    },

    Category: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        household_id: { type: "string", format: "uuid" },
        name: { type: "string", example: "Mercado" },
        type: { type: "string", enum: ["income", "expense"] },
        color: { type: ["string", "null"], example: "#FF8800" },
        icon: { type: ["string", "null"], example: "shopping-cart" },
        is_active: { type: "boolean", description: "false = categoria arquivada (fora das listas, histórico mantido)." },
        created_at: { type: "string", format: "date-time" },
        updated_at: { type: "string", format: "date-time" },
      },
    },

    Transaction: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        household_id: { type: "string", format: "uuid" },
        type: { type: "string", enum: ["income", "expense", "transfer"] },
        description: { type: "string", example: "Supermercado" },
        amount: { type: "number", example: 150.5, description: "Sempre positivo; o tipo define se entra ou sai." },
        account_id: { type: "string", format: "uuid", description: "Conta de origem (ou a conta da receita/despesa)." },
        destination_account_id: { type: ["string", "null"], format: "uuid", description: "Só em transferências." },
        category_id: { type: ["string", "null"], format: "uuid", description: "Obrigatória em receitas e despesas." },
        due_date: { type: "string", format: "date", example: "2026-11-06" },
        payment_date: { type: ["string", "null"], format: "date", description: "null = pendente." },
        recurrence_id: {
          type: ["string", "null"],
          format: "uuid",
          description: "Recorrência que gerou o lançamento (null = lançado à mão).",
        },
        user_id: { type: ["string", "null"], format: "uuid", description: "Quem lançou." },
        created_at: { type: "string", format: "date-time" },
        updated_at: { type: "string", format: "date-time" },
      },
    },

    TransactionList: {
      type: "object",
      properties: {
        data: { type: "array", items: { $ref: "#/components/schemas/Transaction" } },
        pagination: {
          type: "object",
          properties: {
            total: { type: "integer", example: 42 },
            limit: { type: "integer", example: 50 },
            offset: { type: "integer", example: 0 },
          },
        },
      },
    },

    ReportSummary: {
      type: "object",
      properties: {
        month: { type: "string", example: "2026-10" },
        income: { $ref: "#/components/schemas/PaidPendingTotal" },
        expense: { $ref: "#/components/schemas/PaidPendingTotal" },
        balance: {
          type: "object",
          description: "Receitas menos despesas.",
          properties: {
            paid: { type: "number", example: 2949.5, description: "Só o que já foi pago/recebido." },
            total: { type: "number", example: 3149.5, description: "Incluindo pendentes." },
          },
        },
      },
    },

    Recurrence: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        household_id: { type: "string", format: "uuid" },
        type: { type: "string", enum: ["income", "expense", "transfer"] },
        description: { type: "string", example: "Aluguel" },
        amount: { type: "number", example: 1800 },
        account_id: { type: "string", format: "uuid" },
        destination_account_id: { type: ["string", "null"], format: "uuid" },
        category_id: { type: ["string", "null"], format: "uuid" },
        day_of_month: { type: "integer", example: 10, description: "31 cai no último dia em meses mais curtos." },
        start_month: { type: "string", example: "2026-11", description: "Primeiro mês (YYYY-MM)." },
        occurrences: { type: ["integer", "null"], example: 12, description: "Quantas vezes; null = sem fim." },
        auto_paid: { type: "boolean", description: "Débito automático: entra pago no dia. false = entra pendente." },
        is_active: { type: "boolean", description: "false = pausada." },
        generated_until: { type: ["string", "null"], example: "2026-12", description: "Último mês já gerado." },
        user_id: { type: ["string", "null"], format: "uuid", description: "Quem criou." },
        created_at: { type: "string", format: "date-time" },
        updated_at: { type: "string", format: "date-time" },
      },
    },

    RecurrenceWithGenerated: {
      allOf: [
        { $ref: "#/components/schemas/Recurrence" },
        {
          type: "object",
          properties: { generated: { type: "integer", example: 2, description: "Lançamentos criados agora." } },
        },
      ],
    },

    ImportPreview: {
      type: "object",
      properties: {
        source: {
          type: "object",
          properties: {
            id: { type: "string", example: "bb-csv" },
            label: { type: "string", example: "Banco do Brasil (CSV)" },
            kind: { type: "string", enum: ["checking", "credit_card"], description: "Extrato de conta ou fatura de cartão" },
          },
        },
        account: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" }, name: { type: "string" }, type: { type: "string" }, is_active: { type: "boolean" } },
        },
        kind_mismatch: { type: "boolean", description: "true = fatura de cartão numa conta que não é cartão (ou o contrário)" },
        summary: {
          type: "object",
          properties: { total: { type: "integer" }, new: { type: "integer" }, imported: { type: "integer" }, similar: { type: "integer" } },
        },
        rows: {
          type: "array",
          items: {
            type: "object",
            properties: {
              line: { type: "integer", description: "Linha no arquivo" },
              import_hash: { type: "string", description: "Identificador da linha, para enviar na gravação" },
              date: { type: "string", format: "date" },
              description: { type: "string", example: "Pix - Enviado · PIZZARIA NAPOLITANA" },
              amount: { type: "number", example: 66 },
              type: { type: "string", enum: ["income", "expense"] },
              category_id: { type: "string", format: "uuid", nullable: true, description: "Categoria sugerida" },
              status: { type: "string", enum: ["new", "imported", "similar"] },
              selected: { type: "boolean", description: "Se a linha vem marcada para importar" },
              note: { type: "string", nullable: true, description: "Por que a linha veio desmarcada" },
              follows: {
                type: "string",
                nullable: true,
                description: "Só no IOF: o import_hash da compra a que ele se refere, para seguir a categoria dela",
              },
            },
          },
        },
      },
    },

    ImportResult: {
      type: "object",
      properties: {
        imported: { type: "integer", example: 30 },
        skipped: { type: "integer", example: 0, description: "Linhas que já estavam importadas" },
      },
    },

    ReportMonthly: {
      type: "object",
      properties: {
        from: { type: "string", example: "2026-06" },
        to: { type: "string", example: "2026-11" },
        months: {
          type: "array",
          items: { $ref: "#/components/schemas/ReportSummary" },
        },
      },
    },

    PaidPendingTotal: {
      type: "object",
      properties: {
        paid: { type: "number", example: 5000 },
        pending: { type: "number", example: 300 },
        total: { type: "number", example: 5300 },
      },
    },

    ReportByCategory: {
      type: "object",
      properties: {
        month: { type: "string", example: "2026-10" },
        type: { type: "string", enum: ["income", "expense"] },
        total: { type: "number", example: 2150.5 },
        categories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category_id: { type: "string", format: "uuid" },
              name: { type: "string", example: "Aluguel" },
              color: { type: ["string", "null"] },
              icon: { type: ["string", "null"] },
              total: { type: "number", example: 1800 },
              paid: { type: "number", example: 1800 },
              pending: { type: "number", example: 0 },
              transaction_count: { type: "integer", example: 1 },
            },
          },
        },
      },
    },

    Me: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string", example: "Maria Silva" },
        email: { type: "string", format: "email", example: "maria@example.com" },
        created_at: { type: "string", format: "date-time" },
        updated_at: { type: "string", format: "date-time" },
        households: { type: "array", items: { $ref: "#/components/schemas/Household" } },
      },
    },
  },

  responses: {
    ValidationError: errorResponse("Dados inválidos (body, params ou query).", "VALIDATION_ERROR", "Dados inválidos."),
    Unauthorized: errorResponse("Token ausente, inválido ou expirado.", "INVALID_TOKEN", "Token inválido ou expirado."),
    RateLimited: errorResponse("Limite de tentativas do Supabase Auth atingido.", "RATE_LIMITED", "Muitas tentativas. Aguarde e tente novamente."),
    NotFound: errorResponse("Recurso não encontrado, ou household do qual o usuário não é membro.", "NOT_FOUND", "Recurso não encontrado."),
    OwnerOnly: errorResponse("Operação restrita ao dono (owner) do household.", "FORBIDDEN", "Apenas o dono do household pode fazer esta operação."),
  },
};
