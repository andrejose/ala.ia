import express from "express";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { openApiSpec } from "./docs/openapi.js";
import { frontendRoutes } from "./frontend.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import { requestLog } from "./middlewares/requestLog.js";
import { securityHeaders } from "./middlewares/security.js";
import { routes } from "./routes/index.js";

// O app é exportado sem "listen" para os testes (supertest) usarem direto.
export const app = express();

app.disable("x-powered-by");
// Em produção o app fica atrás do proxy do Coolify (Traefik): o IP de quem
// chama vem no X-Forwarded-For, e é ele que o limite de tentativas usa.
if (env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
  app.use(requestLog());
}
app.use(securityHeaders);
// 1 MB cabe uma importação de extrato inteira (até 1.000 linhas)
app.use(express.json({ limit: "1mb" }));

// Documentação
app.get("/docs.json", (req, res) => res.json(openApiSpec));
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customSiteTitle: "Ala.ia API",
    swaggerOptions: { persistAuthorization: true },
  })
);

// A API responde em /api/... (como o frontend chama) e também na raiz, como
// na v1.0 (Swagger, testes e quem já usa a API direto).
app.use("/api", routes);
app.use(routes);

// Com o frontend compilado, o mesmo servidor entrega as telas
if (env.STATIC_DIR) app.use(frontendRoutes(env.STATIC_DIR));

app.use(notFound);
app.use(errorHandler);
