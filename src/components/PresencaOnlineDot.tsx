import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn, iniciais } from "@/lib/utils";
import type { PessoaOnlineProjeto } from "@/hooks/usePresencaProjeto";

// Minimalista de propósito: só o pontinho. Verde e sem número quando tem
// gente, cinza quando não tem ninguém. Clicar é que mostra quem é.
export function PresencaOnlineDot({ pessoas }: { pessoas: PessoaOnlineProjeto[] }) {
  const [open, setOpen] = useState(false);
  const texto = pessoas.length === 0 ? "Ninguém mais online agora" : pessoas.length === 1 ? "1 pessoa online" : `${pessoas.length} pessoas online`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-muted"
          title={texto}
          aria-label="Ver quem está online"
        >
          <span className={cn("h-2.5 w-2.5 rounded-full", pessoas.length > 0 ? "bg-emerald-500" : "bg-muted-foreground/30")} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">{texto}</div>
        {pessoas.length > 0 && (
          <div className="max-h-64 space-y-0.5 overflow-y-auto p-1">
            {pessoas.map((pessoa) => (
              <div key={pessoa.chave} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
                <div
                  className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: pessoa.cor }}
                >
                  {iniciais(pessoa.nome || pessoa.email) || "?"}
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background bg-emerald-500" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">{pessoa.nome || pessoa.email}</p>
                  {pessoa.nome && pessoa.email && <p className="truncate text-xs text-muted-foreground">{pessoa.email}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
