import { z } from "../lib/zod.js";
import { nonEmpty } from "./common.schemas.js";

const name = z.string().trim().min(1).max(100).meta({ example: "Casa" });
const role = z.enum(["owner", "member"]);

export const createHouseholdSchema = z.object({ name });
export const updateHouseholdSchema = z.object({ name });

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()).meta({ format: "email", example: "joao@example.com" }),
  role: role.default("member"),
});

export const updateMemberSchema = nonEmpty(z.object({ role }));
