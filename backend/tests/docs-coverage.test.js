import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { openApiSpec } from "../src/docs/openapi.js";

// Garante que toda rota da API está no Swagger, e que o Swagger não documenta
// rota que não existe. Lê as rotas direto dos arquivos de rotas.

// Prefixo em que cada router é montado (ver src/routes/index.js e households.routes.js)
const mounts = {
  "src/routes/index.js": { routes: "" },
  "src/routes/auth.routes.js": { authRoutes: "/auth" },
  "src/routes/me.routes.js": { meRoutes: "/me" },
  "src/routes/households.routes.js": { householdsRoutes: "/households", household: "/households/:householdId" },
  "src/routes/invitations.routes.js": { invitationsRoutes: "/invitations" },
};

function routesInCode() {
  const routes = [];
  for (const [file, routers] of Object.entries(mounts)) {
    const source = fs.readFileSync(file, "utf8");
    for (const [, router, method, path] of source.matchAll(/(\w+)\.(get|post|put|patch|delete)\(\s*"([^"]*)"/g)) {
      if (!(router in routers)) continue;
      const full = routers[router] + (path === "/" ? "" : path) || "/";
      routes.push(`${method.toUpperCase()} ${full.replace(/:(\w+)/g, "{$1}")}`);
    }
  }
  return routes.sort();
}

function routesInDocs() {
  return Object.entries(openApiSpec.paths)
    .flatMap(([path, operations]) =>
      Object.keys(operations)
        .filter((key) => key !== "parameters")
        .map((method) => `${method.toUpperCase()} ${path}`)
    )
    .sort();
}

describe("Documentação da API", () => {
  it("toda rota da API está documentada no Swagger, e só as que existem", () => {
    const code = routesInCode();

    expect(code.length).toBeGreaterThan(30); // o leitor de rotas achou as rotas
    expect(routesInDocs()).toEqual(code);
  });

  it("toda referência ($ref) aponta para um componente que existe", () => {
    const refs = new Set();
    JSON.stringify(openApiSpec, (key, value) => {
      if (key === "$ref") refs.add(value);
      return value;
    });

    const missing = [...refs].filter((ref) => {
      const [, , kind, name] = ref.split("/");
      return !openApiSpec.components[kind]?.[name];
    });
    expect(missing).toEqual([]);
  });
});
