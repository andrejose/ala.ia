import "@fontsource-variable/fraunces";
import "@fontsource-variable/nunito-sans";
import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import { AppShell } from "./components/AppShell";
import { AccountsPage } from "./features/accounts/AccountsPage";
import { CategoriesPage } from "./features/categories/CategoriesPage";
import { MorePage } from "./features/more/MorePage";
import { TransactionsPage } from "./features/transactions/TransactionsPage";
import { TransactionSheetProvider } from "./features/transactions/TransactionSheet";
import { AuthProvider } from "./features/auth/AuthProvider";
import { RedirectIfAuthenticated, RequireAuth } from "./features/auth/guards";
import { LoginPage } from "./features/auth/LoginPage";
import { DashboardPage } from "./features/dashboard/DashboardPage";
import { HouseholdProvider } from "./features/household/HouseholdProvider";
import { ApiError } from "./lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Não insiste em erros do cliente (404, 403...); tenta de novo só falhas de rede/servidor
      retry: (count, error) => count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});

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

const router = createBrowserRouter([
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
              { path: "mais", element: <MorePage /> },
              { path: "*", element: <Navigate to="/" replace /> },
            ],
          },
        ],
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
