import { Router } from "express";
import * as invitations from "../controllers/invitations.controller.js";
import { requireAuth } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import { invitationIdParams } from "../schemas/common.schemas.js";

// Convites recebidos pelo usuário logado
export const invitationsRoutes = Router();
invitationsRoutes.use(requireAuth);

invitationsRoutes.get("/", invitations.listMine);
invitationsRoutes.post("/:invitationId/accept", validate({ params: invitationIdParams }), invitations.accept);
invitationsRoutes.post("/:invitationId/decline", validate({ params: invitationIdParams }), invitations.decline);
