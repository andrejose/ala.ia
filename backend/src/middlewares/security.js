import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { HttpError } from "../errors/HttpError.js";

// Cabeçalhos de segurança (helmet). A política de conteúdo (CSP) só permite
// arquivos do próprio endereço: o app não carrega nada de fora (as fontes vêm
// do próprio build) e fala só com a própria API. Estilos inline ficam liberados
// porque o React usa style={{...}} (ex.: largura das barras) e o Swagger também.
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"],
      "font-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "object-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      // O HTTPS fica a cargo do proxy (Coolify); sem isto, testar o contêiner em http://localhost quebraria
      "upgrade-insecure-requests": null,
    },
  },
});

// Limite de tentativas por IP nas rotas de entrada (login, cadastro e
// renovação de sessão), contra quem tenta adivinhar senhas. Passou do limite:
// 429 no mesmo formato de erro da API.
export function authRateLimit({ limit, windowMs = 15 * 60 * 1000, skip = () => false }) {
  return rateLimit({
    windowMs,
    limit,
    skip,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new HttpError(429, "TOO_MANY_REQUESTS", "Muitas tentativas. Espere alguns minutos e tente de novo.")),
  });
}
