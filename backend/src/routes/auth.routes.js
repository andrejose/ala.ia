import { Router } from "express";
import * as auth from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { loginSchema, refreshSchema, signupSchema } from "../schemas/auth.schemas.js";

export const authRoutes = Router();

authRoutes.post("/signup", validate({ body: signupSchema }), auth.signup);
authRoutes.post("/login", validate({ body: loginSchema }), auth.login);
authRoutes.post("/refresh", validate({ body: refreshSchema }), auth.refresh);
authRoutes.post("/logout", requireAuth, auth.logout);
