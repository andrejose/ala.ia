import { HttpError } from "../errors/HttpError.js";

// Valida params, query e body com schemas Zod.
// Os dados já validados (e convertidos) ficam em req.validated.{params,query,body}.
//
// Uso: router.post("/", validate({ body: createAccountSchema }), controller.create)
export function validate(schemas) {
  return (req, res, next) => {
    const validated = {};
    const details = [];

    for (const part of ["params", "query", "body"]) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          details.push({ in: part, path: issue.path.join("."), message: issue.message });
        }
      }
    }

    if (details.length > 0) {
      throw new HttpError(400, "VALIDATION_ERROR", "Dados inválidos.", details);
    }

    // Acumula com validações anteriores (ex.: o :householdId validado no router pai)
    const previous = req.validated ?? {};
    req.validated = {
      params: { ...previous.params, ...validated.params },
      query: validated.query ?? previous.query,
      body: validated.body ?? previous.body,
    };
    next();
  };
}
