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

    HouseholdMembership: {
      type: "object",
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string", example: "Finanças de Maria Silva" },
        role: { type: "string", enum: ["owner", "member"] },
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
        households: { type: "array", items: { $ref: "#/components/schemas/HouseholdMembership" } },
      },
    },
  },

  responses: {
    ValidationError: errorResponse("Dados inválidos (body, params ou query).", "VALIDATION_ERROR", "Dados inválidos."),
    Unauthorized: errorResponse("Token ausente, inválido ou expirado.", "INVALID_TOKEN", "Token inválido ou expirado."),
    RateLimited: errorResponse("Limite de tentativas do Supabase Auth atingido.", "RATE_LIMITED", "Muitas tentativas. Aguarde e tente novamente."),
  },
};
