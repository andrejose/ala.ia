import { app } from "./app.js";
import { env } from "./config/env.js";

const server = app.listen(env.PORT, () => {
  console.log(`Servidor rodando na porta ${env.PORT} (${env.NODE_ENV})`);
  console.log(`Documentação da API em /docs${env.STATIC_DIR ? "; telas em /" : ""}`);
});

// O Coolify para o contêiner com SIGTERM a cada deploy: termina as requisições
// em andamento antes de sair
process.on("SIGTERM", () => server.close(() => process.exit(0)));
