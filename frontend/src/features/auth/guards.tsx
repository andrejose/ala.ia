import { Navigate, Outlet, useLocation } from "react-router";
import { LogoMark } from "../../components/Logo";
import { useAuth } from "./AuthProvider";

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Carregando">
      <LogoMark className="size-12 animate-pulse" />
    </div>
  );
}

// Só deixa passar quem está logado; os outros vão para /entrar
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <Splash />;
  if (status === "anonymous") return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

// Quem já está logado não precisa ver a tela de entrada
export function RedirectIfAuthenticated() {
  const { status } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  if (status === "loading") return <Splash />;
  if (status === "authenticated") return <Navigate to={from} replace />;
  return <Outlet />;
}
