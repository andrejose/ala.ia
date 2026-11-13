import { Router } from "express";
import * as auth from "../controllers/auth.controller.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middlewares/auth.js";
import { authRateLimit } from "../middlewares/security.js";
import { validate } from "../middlewares/validate.js";
import { loginSchema, refreshSchema, signupSchema } from "../schemas/auth.schemas.js";

export const authRoutes = Router();

// Limite de tentativas por IP (os testes de integração fazem muitos logins e ficam de fora)
const limited = authRateLimit({ limit: env.AUTH_RATE_LIMIT, skip: () => env.NODE_ENV === "test" });

authRoutes.post("/signup", limited, validate({ body: signupSchema }), auth.signup);
authRoutes.post("/login", limited, validate({ body: loginSchema }), auth.login);
authRoutes.post("/refresh", limited, validate({ body: refreshSchema }), auth.refresh);
authRoutes.post("/logout", requireAuth, auth.logout);
