import { z } from "../lib/zod.js";
import { booleanQuery, nonEmpty } from "./common.schemas.js";

export const categoryType = z.enum(["income", "expense"]);

const fields = {
  name: z.string().trim().min(1).max(50).meta({ example: "Mercado" }),
  type: categoryType,
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Use uma cor hexadecimal, ex.: #FF8800")
    .nullable()
    .meta({ example: "#FF8800" }),
  icon: z.string().trim().min(1).max(50).nullable().meta({ example: "shopping-cart" }),
  is_active: z.boolean(),
};

export const createCategorySchema = z.object({
  name: fields.name,
  type: fields.type,
  color: fields.color.optional(),
  icon: fields.icon.optional(),
});

export const updateCategorySchema = nonEmpty(z.object(fields).partial());

export const listCategoriesQuery = z.object({
  type: categoryType.optional(),
  is_active: booleanQuery.optional(),
});
