import { QueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, type RouteObject } from "react-router";
import { AppShell } from "../components/AppShell";
import { AccountsPage } from "../features/accounts/AccountsPage";
import { AuthProvider } from "../features/auth/AuthProvider";
import { RedirectIfAuthenticated, RequireAuth } from "../features/auth/guards";
import { LoginPage } from "../features/auth/LoginPage";
import { CategoriesPage } from "../features/categories/CategoriesPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { HouseholdPage } from "../features/household/HouseholdPage";
import { HouseholdProvider } from "../features/household/HouseholdProvider";
import { MorePage } from "../features/more/MorePage";
import { TransactionsPage } from "../features/transactions/TransactionsPage";
import { TransactionSheetProvider } from "../features/transactions/TransactionSheet";
import { ApiError } from "../lib/api";

// Rotas e cache do app. Ficam aqui (e não no main.tsx) para os testes
// montarem o app inteiro com um roteador em memória.

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Não insiste em erros do cliente (404, 403...); tenta de novo só falhas de rede/servidor
        retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}

function Root() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

function LoggedIn() {
  return (
    <HouseholdProvider>
      <TransactionSheetProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </TransactionSheetProvider>
    </HouseholdProvider>
  );
}

export const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      { element: <RedirectIfAuthenticated />, children: [{ path: "/entrar", element: <LoginPage /> }] },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <LoggedIn />,
            children: [
              { index: true, element: <DashboardPage /> },
              { path: "lancamentos", element: <TransactionsPage /> },
              { path: "contas", element: <AccountsPage /> },
              { path: "categorias", element: <CategoriesPage /> },
              { path: "espaco", element: <HouseholdPage /> },
              // Endereço antigo da tela, antes do nome "Espaço"
              { path: "household", element: <Navigate to="/espaco" replace /> },
              { path: "mais", element: <MorePage /> },
              { path: "*", element: <Navigate to="/" replace /> },
            ],
          },
        ],
      },
    ],
  },
];
