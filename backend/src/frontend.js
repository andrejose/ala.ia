import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import express, { Router } from "express";
import { HttpError } from "./errors/HttpError.js";

// Entrega o frontend já compilado (frontend/dist) pelo mesmo servidor da API.
// Assim o app inteiro fica num endereço só (ex.: https://ala.andrejose.com.br):
// as telas chamam /api/... no próprio endereço, sem CORS.
//
// Os arquivos de /assets têm o hash no nome, então podem ficar em cache por
// um ano. O index.html não fica em cache, para cada deploy chegar na hora.
// Qualquer outro GET que aceite HTML (ex.: /lancamentos recarregado no
// navegador) recebe o index.html, e o React Router mostra a tela certa.
export function frontendRoutes(staticDir) {
  const dir = resolve(staticDir);
  const index = join(dir, "index.html");
  if (!existsSync(index)) throw new Error(`STATIC_DIR sem index.html: ${dir}`);

  const router = Router();
  router.use("/assets", express.static(join(dir, "assets"), { immutable: true, maxAge: "1y" }));
  // Arquivo de build que não existe (ex.: de um deploy antigo) é 404, não a tela
  router.use("/assets", (req, res, next) => next(new HttpError(404, "NOT_FOUND", "Arquivo não encontrado.")));
  router.use(express.static(dir, { index: false, maxAge: 0 }));
  router.get(/.*/, (req, res, next) => {
    if (!req.accepts("html") || req.path.startsWith("/api/")) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(index);
  });
  return router;
}
