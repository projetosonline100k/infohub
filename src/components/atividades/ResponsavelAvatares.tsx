import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { iniciais, cn } from "@/lib/utils";
import { parseResponsaveis } from "@/lib/responsaveis";

interface ResponsavelAvataresProps {
  responsavelNome?: string | null;
  max?: number;
  size?: string;
  fallbackTextClassName?: string;
}

// Uma atividade pode ter mais de um responsável (ver AtividadeDetailPanel);
// aqui é só a pilha de bolinhas com as iniciais de cada um, igual já era
// feito pra uma pessoa só.
export function ResponsavelAvatares({ responsavelNome, max = 3, size = "h-5 w-5", fallbackTextClassName = "text-[9px]" }: ResponsavelAvataresProps) {
  const nomes = parseResponsaveis(responsavelNome);

  if (nomes.length === 0) {
    return (
      <Avatar className={cn(size, "flex-shrink-0")} title="Sem responsável">
        <AvatarFallback className={cn(fallbackTextClassName, "bg-muted text-muted-foreground")}>?</AvatarFallback>
      </Avatar>
    );
  }

  const visiveis = nomes.slice(0, max);
  const restantes = nomes.length - visiveis.length;

  return (
    <div className="flex flex-shrink-0 items-center" title={nomes.join(", ")}>
      <div className="flex -space-x-1.5">
        {visiveis.map((nome) => (
          <Avatar key={nome} className={cn(size, "border-2 border-background")}>
            <AvatarFallback className={cn(fallbackTextClassName, "bg-muted text-muted-foreground")}>
              {iniciais(nome)}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      {restantes > 0 && <span className="ml-1 text-[10px] text-muted-foreground">+{restantes}</span>}
    </div>
  );
}
