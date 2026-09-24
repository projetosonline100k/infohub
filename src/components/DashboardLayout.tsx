import { useEffect } from "react";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LayoutDashboard, Users, Activity, StickyNote, ShieldCheck, LogOut } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { ehAdmin } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Assistant } from "@/components/assistant/Assistant";
import { DesktopUpdateBanner } from "@/components/DesktopUpdateBanner";
import { DownloadDesktopAppButton } from "@/components/DownloadDesktopAppButton";
import { isDesktop } from "@/lib/platform";
import { onMainNavigate } from "@/lib/desktop/events";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const menuItems = [
  { title: "Dash geral", path: "/", icon: LayoutDashboard },
  { title: "Projetos Milionários", path: "/clientes", icon: Users },
  { title: "Atividades", path: "/atividades", icon: Activity },
  { title: "Notas", path: "/notas", icon: StickyNote },
];

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  // Item 1 (rodada 3): a janela main já foi mostrada/maximizada/focada por
  // openMainWindow() (chamado de dentro do Jarvis) — aqui só navegamos pra
  // rota que ele pediu (Ver todas, Notas, Expandir, etc). No-op na web
  // (onMainNavigate não faz nada fora do desktop).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onMainNavigate((route) => navigate(route)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [navigate]);
  const isClienteDetalhe = /^\/clientes\/[^/]+/.test(location.pathname);
  const itens = ehAdmin(user?.email)
    ? [...menuItems, { title: "Administração", path: "/admin", icon: ShieldCheck }]
    : menuItems;

  return (
    <div className="min-h-screen w-full bg-background">
      {/* Header horizontal */}
      {!isClienteDetalhe && (
      <header className="bg-sidebar border-b border-sidebar-border">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-sidebar-foreground">
              Painel do Infoprodutor
            </h1>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">{user?.email}</span>
              <DownloadDesktopAppButton />
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair" title="Sair">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <nav className="flex items-center gap-2">
            {itens.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200"
                  activeClassName="bg-sidebar-accent font-semibold"
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.title}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>
      )}

      <DesktopUpdateBanner />

      {/* Main content area */}
      <main className="overflow-auto">
        <div className={isClienteDetalhe ? "" : "p-6"}>
          {children}
        </div>
      </main>

      {/* Assistente virtual flutuante — única instância, visível em toda
          página autenticada (este layout envolve todas as rotas protegidas).
          No desktop esconde aqui: a janela nativa `jarvis` (ver
          src/pages/JarvisWindow.tsx) já cobre esse papel, sem duplicar. */}
      {!isDesktop() && <Assistant />}
    </div>
  );
};
