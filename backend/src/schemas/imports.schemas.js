import { z } from "../lib/zod.js";
import { isoDate, money, uuid } from "./common.schemas.js";

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_FILE = "2mb";

export const previewQuery = z.object({
  account_id: uuid.meta({ description: "Conta onde os lançamentos vão entrar" }),
});

const importRow = z.object({
  import_hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "Identificador de linha inválido")
    .meta({ description: "O import_hash que veio na prévia" }),
  date: isoDate,
  description: z.string().trim().min(1).max(200),
  amount: money.positive(),
  type: z.enum(["income", "expense"]),
  category_id: uuid,
});

export const commitImportSchema = z.object({
  account_id: uuid,
  rows: z.array(importRow).min(1, "Escolha ao menos uma linha").max(MAX_IMPORT_ROWS),
});
