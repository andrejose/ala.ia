import express from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./docs/openapi.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import { routes } from "./routes/index.js";

// O app é exportado sem "listen" para os testes (supertest) usarem direto.
export const app = express();

app.disable("x-powered-by");
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

app.use(routes);

app.use(notFound);
app.use(errorHandler);
