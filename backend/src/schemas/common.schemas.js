import { z } from "../lib/zod.js";

export const uuid = z.uuid();

// Data no formato YYYY-MM-DD (colunas "date" do banco)
export const isoDate = z.iso.date().meta({ example: "2026-11-06" });

// Mês no formato YYYY-MM, convertido para o 1º dia do mês (YYYY-MM-01)
export const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use o formato YYYY-MM")
  .transform((value) => `${value}-01`)
  .meta({ example: "2026-11" });

// numeric(12, 2): até 9.999.999.999,99 e no máximo 2 casas decimais
export const money = z
  .number()
  .max(9_999_999_999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "Use no máximo 2 casas decimais")
  .meta({ example: 150.5 });

export const householdParams = z.object({ householdId: uuid });
export const idParams = z.object({ id: uuid });
export const userIdParams = z.object({ userId: uuid });

// Query string chega como texto: "true"/"false" -> boolean
export const booleanQuery = z.enum(["true", "false"]).transform((value) => value === "true");

export const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
};

// PATCH precisa de pelo menos um campo
export function nonEmpty(schema) {
  return schema.refine((data) => Object.keys(data).length > 0, "Informe ao menos um campo para atualizar");
}
