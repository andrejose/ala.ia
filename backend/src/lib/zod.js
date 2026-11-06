import { z } from "zod";

// Mensagens de validação em português
z.config(z.locales.pt());

// Converte um schema Zod em JSON Schema para a documentação OpenAPI 3.1.
// io: "input" descreve o que o cliente envia (antes de transforms como trim).
export function toOpenApiSchema(schema) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema, { io: "input" });
  return simplify(jsonSchema);
}

// Deixa a documentação legível: quando já há "format" (uuid, date, email), o
// regex gerado pelo Zod é redundante; e o limite de inteiro seguro do JS não informa nada.
function simplify(node) {
  if (Array.isArray(node)) return node.map(simplify);
  if (!node || typeof node !== "object") return node;

  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "pattern" && node.format) continue;
    if (key === "maximum" && value === Number.MAX_SAFE_INTEGER) continue;
    result[key] = simplify(value);
  }
  return result;
}

export { z };
