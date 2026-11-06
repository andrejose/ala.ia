import { Router } from "express";
import * as me from "../controllers/me.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { updateMeSchema } from "../schemas/me.schemas.js";

export const meRoutes = Router();

meRoutes.use(requireAuth);

meRoutes.get("/", me.getMe);
meRoutes.patch("/", validate({ body: updateMeSchema }), me.updateMe);
