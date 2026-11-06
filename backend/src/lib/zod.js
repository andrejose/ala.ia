import { z } from "zod";

// Mensagens de validação em português
z.config(z.locales.pt());

// Converte um schema Zod em JSON Schema para a documentação OpenAPI 3.1.
// io: "input" descreve o que o cliente envia (antes de transforms como trim).
export function toOpenApiSchema(schema) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema, { io: "input" });
  return jsonSchema;
}

export { z };
