import { ArrowRight, MoreHorizontal, Edit, Archive, ArchiveRestore, StickyNote, ListChecks } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ProjetoRowProps {
  nome: string;
  nicho: string;
  notas: number;
  atividades: number;
  arquivado: boolean;
  ultimaAtividade: string | null;
  podeGerenciar: boolean;
  visualizacao: "lista" | "grid";
  onAbrir: (event?: React.MouseEvent) => void;
  onEditar: () => void;
  onArquivar: () => void;
}

const getIniciais = (nome: string) => {
  const palavras = nome.trim().split(" ").filter(Boolean);
  if (palavras.length >= 2) return `${palavras[0][0]}${palavras[1][0]}`.toUpperCase();
  return nome.slice(0, 2).toUpperCase();
};

// Linha/card compacto de projeto (redesign visual, item 6) — mesma
// informação que a lista antiga já carregava (editar/arquivar, navegação
// pra /clientes/:id), só reorganizada num formato mais denso e "premium":
// avatar, nome+nicho, contagem de notas/atividades, status, última
// atividade relativa, abrir + menu de ações.
export function ProjetoRow({
  nome,
  nicho,
  notas,
  atividades,
  arquivado,
  ultimaAtividade,
  podeGerenciar,
  visualizacao,
  onAbrir,
  onEditar,
  onArquivar,
}: ProjetoRowProps) {
  const conteudo = (
    <>
      <Avatar className="h-11 w-11 shrink-0">
        <AvatarFallback className="bg-primary/10 font-semibold text-primary">{getIniciais(nome)}</AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-foreground">{nome}</h3>
        <p className="truncate text-sm text-muted-foreground">{nicho || "Sem categoria"}</p>
      </div>

      <div className={cn("flex shrink-0 items-center gap-4 text-xs text-muted-foreground", visualizacao === "grid" && "mt-3 w-full justify-start border-t border-border pt-3")}>
        <span className="flex items-center gap-1.5">
          <StickyNote className="h-3.5 w-3.5 text-status-notes" />
          {notas} {notas === 1 ? "Nota" : "Notas"}
        </span>
        <span className="flex items-center gap-1.5">
          <ListChecks className="h-3.5 w-3.5 text-status-info" />
          {atividades} {atividades === 1 ? "Atividade" : "Atividades"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", arquivado ? "bg-muted-foreground" : "bg-status-success")} />
          {arquivado ? "Arquivado" : "Ativo"}
        </span>
      </div>

      <div className={cn("shrink-0 text-right text-xs text-muted-foreground", visualizacao === "grid" && "hidden")}>
        {ultimaAtividade ? (
          <>
            Última atividade
            <br />
            {formatDistanceToNow(new Date(ultimaAtividade), { locale: ptBR, addSuffix: true })}
          </>
        ) : (
          "Sem atividades ainda"
        )}
      </div>

      <div className={cn("flex shrink-0 items-center gap-1", visualizacao === "grid" && "mt-3 w-full justify-end")}>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onAbrir}>
          Abrir
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        {podeGerenciar && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()} aria-label="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {!arquivado && (
                <DropdownMenuItem onClick={onEditar}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onArquivar}>
                {arquivado ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />}
                {arquivado ? "Reativar" : "Arquivar"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </>
  );

  return (
    <div
      onClick={onAbrir}
      className={cn(
        "group cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40",
        visualizacao === "lista" ? "flex items-center gap-4" : "flex flex-col",
      )}
    >
      {conteudo}
    </div>
  );
}
