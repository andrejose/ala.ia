import { toOpenApiSchema } from "../../lib/zod.js";
import { updateMeSchema } from "../../schemas/me.schemas.js";

const meResponse = (description) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Me" } } },
});

export const mePaths = {
  "/me": {
    get: {
      tags: ["Perfil"],
      summary: "Dados do usuário logado",
      description: "Perfil do usuário e os households a que ele tem acesso, com o papel em cada um.",
      responses: {
        200: meResponse("Perfil do usuário."),
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
    patch: {
      tags: ["Perfil"],
      summary: "Atualiza o perfil do usuário logado",
      requestBody: {
        required: true,
        content: { "application/json": { schema: toOpenApiSchema(updateMeSchema) } },
      },
      responses: {
        200: meResponse("Perfil atualizado."),
        400: { $ref: "#/components/responses/ValidationError" },
        401: { $ref: "#/components/responses/Unauthorized" },
      },
    },
  },
};
