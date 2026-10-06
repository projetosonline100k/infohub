import { NavLink as RouterNavLink, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Activity, StickyNote, ShieldCheck, Sparkles, Gauge, CalendarDays } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/auth/AuthProvider";
import { ehAdmin } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { useWorkspaceTabs } from "@/components/workspace/WorkspaceTabs";

const menuItems = [
  { title: "Dash geral", path: "/", icon: LayoutDashboard },
  { title: "Projetos Milionários", path: "/clientes", icon: Users },
  { title: "Atividades", path: "/atividades", icon: Activity },
  { title: "Notas", path: "/notas", icon: StickyNote },
  { title: "Produtividade", path: "/produtividade", icon: Gauge },
  { title: "Agenda", path: "/agenda", icon: CalendarDays },
];

// Sidebar fixa do redesign visual (item 3) — reaproveita o sistema de
// sidebar do shadcn já instalado em src/components/ui/sidebar.tsx (nunca
// usado até aqui) em vez de construir do zero. Mesmas rotas/itens que já
// existiam em DashboardLayout.tsx, nenhuma navegação nova.
export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { openTab } = useWorkspaceTabs();
  const { user } = useAuth();
  const itens = ehAdmin(user?.email) ? [...menuItems, { title: "Administração", path: "/admin", icon: ShieldCheck }] : menuItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-2 overflow-hidden">
          <Sparkles className="h-5 w-5 shrink-0 text-primary" />
          <span className="truncate text-base font-bold text-sidebar-foreground group-data-[collapsible=icon]:hidden">Infopro Hub</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {itens.map((item) => {
                const Icon = item.icon;
                const ativo = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={ativo}
                      // Item 3: item ativo ganha fundo ciano sutil (já vem
                      // do token --sidebar-accent via data-[active=true] do
                      // próprio componente) + a linha lateral ciano pedida
                      // ("▌ Projetos Milionários").
                      className={cn(
                        "border-l-2 border-transparent pl-[calc(0.5rem-2px)]",
                        ativo && "border-primary text-sidebar-foreground",
                      )}
                    >
                      <RouterNavLink to={item.path} end={item.path === "/"} onClick={(event) => {
                        event.preventDefault();
                        if (event.metaKey) openTab(item.path, item.title);
                        navigate(item.path);
                      }}>
                        <Icon className={cn("h-4 w-4", ativo && "text-primary")} />
                        <span>{item.title}</span>
                      </RouterNavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
