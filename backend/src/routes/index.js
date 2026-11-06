import { Router } from "express";
import { authRoutes } from "./auth.routes.js";
import { householdsRoutes } from "./households.routes.js";
import { invitationsRoutes } from "./invitations.routes.js";
import { meRoutes } from "./me.routes.js";

export const routes = Router();

routes.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

routes.use("/auth", authRoutes);
routes.use("/me", meRoutes);
routes.use("/households", householdsRoutes);
routes.use("/invitations", invitationsRoutes);
