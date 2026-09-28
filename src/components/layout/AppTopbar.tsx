import { Bell, LogOut, Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DownloadDesktopAppButton } from "@/components/DownloadDesktopAppButton";
import { useAuth } from "@/auth/AuthProvider";

interface AppTopbarProps {
  onAbrirBusca: () => void;
}

// Topbar do redesign visual (item 4) — ~64px, busca global (abre a paleta
// ⌘K de GlobalSearchCommand.tsx) à esquerda, ações de conta à direita.
// Reaproveita ThemeToggle/DownloadDesktopAppButton/signOut que já
// existiam no header antigo — nenhuma lógica de autenticação nova.
export function AppTopbar({ onAbrirBusca }: AppTopbarProps) {
  const { user, signOut } = useAuth();
  const iniciais = (user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background px-4 sm:px-6">
      <SidebarTrigger />

      <button
        type="button"
        onClick={onAbrirBusca}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">Buscar clientes, projetos, notas, atividades...</span>
        <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <DownloadDesktopAppButton />
        {/* Sino de notificações — visual (item 4); ainda não existe um
            sistema de notificações no app, fica como placeholder inerte
            até isso virar uma entrega funcional. */}
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações" title="Notificações">
          <Bell className="h-4 w-4" />
        </Button>
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-accent">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">{iniciais}</AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[160px] truncate text-sm text-foreground md:inline">{user?.email}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
