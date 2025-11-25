import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, Users, Activity } from "lucide-react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const menuItems = [
  { title: "Dash geral", path: "/", icon: LayoutDashboard },
  { title: "Clientes", path: "/clientes", icon: Users },
  { title: "Atividades", path: "/atividades", icon: Activity },
];

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-sidebar-border flex-shrink-0">
        <div className="p-6">
          <h1 className="text-xl font-bold text-sidebar-foreground mb-8">
            Painel do Infoprodutor
          </h1>
          
          <nav className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200"
                  activeClassName="bg-sidebar-accent font-semibold text-sidebar-primary border-l-4 border-sidebar-primary"
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.title}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
