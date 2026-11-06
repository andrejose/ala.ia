import { toOpenApiSchema } from "../lib/zod.js";

// Helpers para montar a especificação OpenAPI sem repetição.

export const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

export function jsonBody(zodSchema) {
  return { required: true, content: { "application/json": { schema: toOpenApiSchema(zodSchema) } } };
}

export function json(description, schema) {
  return { description, content: { "application/json": { schema } } };
}

export function error(description, code, message) {
  return {
    description,
    content: {
      "application/json": {
        schema: ref("Error"),
        example: { error: { code, message } },
      },
    },
  };
}

export const noContent = (description) => ({ description });

// Respostas de erro comuns
export const badRequest = { $ref: "#/components/responses/ValidationError" };
export const unauthorized = { $ref: "#/components/responses/Unauthorized" };
export const forbiddenOwner = { $ref: "#/components/responses/OwnerOnly" };
export const notFound = { $ref: "#/components/responses/NotFound" };

// Parâmetros de caminho
const pathParam = (name, description) => ({
  name,
  in: "path",
  required: true,
  description,
  schema: { type: "string", format: "uuid" },
});

export const householdIdParam = pathParam("householdId", "Id do household (veja GET /me ou GET /households)");
export const idParam = (resource) => pathParam("id", `Id ${resource}`);
export const userIdParam = pathParam("userId", "Id do usuário membro");

// Converte um schema Zod de query string em parâmetros OpenAPI
export function queryParams(zodSchema) {
  const { properties = {}, required = [] } = toOpenApiSchema(zodSchema);
  return Object.entries(properties).map(([name, { description, ...schema }]) => ({
    name,
    in: "query",
    required: required.includes(name) && schema.default === undefined,
    ...(description && { description }),
    schema,
  }));
}
