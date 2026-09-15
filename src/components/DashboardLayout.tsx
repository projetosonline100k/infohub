import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LayoutDashboard, Users, Activity, ShieldCheck, LogOut } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { ehAdmin } from "@/lib/admin";
import { Button } from "@/components/ui/button";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const menuItems = [
  { title: "Dash geral", path: "/", icon: LayoutDashboard },
  { title: "Projetos Milionários", path: "/clientes", icon: Users },
  { title: "Atividades", path: "/atividades", icon: Activity },
];

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
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

      {/* Main content area */}
      <main className="overflow-auto">
        <div className={isClienteDetalhe ? "" : "p-6"}>
          {children}
        </div>
      </main>
    </div>
  );
};
