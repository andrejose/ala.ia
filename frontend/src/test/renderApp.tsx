import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { createQueryClient, routes } from "../app/routes";

// Monta o app inteiro (rotas, provedores e cache) começando em `path`.
// Com `loggedIn`, deixa um refresh_token salvo: o app retoma a sessão sozinho
// ao abrir, como acontece num recarregamento de página.
export function renderApp(path = "/", { loggedIn = false } = {}) {
  if (loggedIn) localStorage.setItem("ala.refresh_token", "refresh-token");

  const queryClient = createQueryClient();
  // Nos testes, erro aparece na hora (sem as novas tentativas do app)
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });

  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { ...result, user, router };
}
