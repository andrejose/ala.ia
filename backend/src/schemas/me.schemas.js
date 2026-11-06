import { z } from "../lib/zod.js";

export const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).meta({ example: "Maria S." }),
});
