import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Activity, StickyNote, ShieldCheck, User } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { ehAdmin } from "@/lib/admin";

interface ProjetoBusca {
  id: string;
  nome_especialista: string;
}

interface GlobalSearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Paleta de busca global (item 4, ⌘K) — escopo proposital: navegação pras
// seções principais + busca por nome entre os projetos/clientes já
// cadastrados (mesma tabela que /clientes já lista), abrindo direto em
// /clientes/:id. Busca por conteúdo de notas/atividades é uma
// funcionalidade nova (full-text), fora do escopo deste redesign visual.
// Estado controlado por quem chama (DashboardLayout) pra tanto o atalho
// ⌘K quanto o clique no campo de busca da topbar abrirem a mesma paleta.
export function GlobalSearchCommand({ open, onOpenChange }: GlobalSearchCommandProps) {
  const [projetos, setProjetos] = useState<ProjetoBusca[]>([]);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || projetos.length > 0) return;
    supabase
      .from("clientes")
      .select("id, nome_especialista")
      .eq("arquivado", false)
      .order("nome_especialista")
      .then(({ data }) => setProjetos(data || []));
  }, [open, projetos.length]);

  const ir = (rota: string) => {
    onOpenChange(false);
    navigate(rota);
  };

  const paginas = [
    { titulo: "Dash geral", rota: "/", icon: LayoutDashboard },
    { titulo: "Projetos Milionários", rota: "/clientes", icon: Users },
    { titulo: "Atividades", rota: "/atividades", icon: Activity },
    { titulo: "Notas", rota: "/notas", icon: StickyNote },
    ...(ehAdmin(user?.email) ? [{ titulo: "Administração", rota: "/admin", icon: ShieldCheck }] : []),
  ];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar clientes, projetos, notas, atividades..." />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>
        <CommandGroup heading="Navegação">
          {paginas.map((p) => (
            <CommandItem key={p.rota} onSelect={() => ir(p.rota)}>
              <p.icon className="mr-2 h-4 w-4" />
              {p.titulo}
            </CommandItem>
          ))}
        </CommandGroup>
        {projetos.length > 0 && (
          <CommandGroup heading="Projetos">
            {projetos.map((p) => (
              <CommandItem key={p.id} onSelect={() => ir(`/clientes/${p.id}`)}>
                <User className="mr-2 h-4 w-4" />
                {p.nome_especialista}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
