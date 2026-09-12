import { iniciais } from "@/lib/utils";
import type { PessoaOnline } from "@/hooks/useDocumentoColaboracao";

// Bolinhas com as iniciais de quem mais está vendo este documento agora
// (dono, equipe ou convidado de um link compartilhado). O ponto verde é
// literal: só aparece aqui quem está com o documento aberto neste instante.
export function PresencaAvatares({ pessoas }: { pessoas: PessoaOnline[] }) {
  if (pessoas.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex -space-x-2">
        {pessoas.slice(0, 4).map((pessoa) => (
          <div
            key={pessoa.chave}
            title={`${pessoa.nome || pessoa.email} está vendo este documento agora`}
            className="relative h-7 w-7 rounded-full border-2 border-background flex items-center justify-center text-[11px] font-semibold text-white"
            style={{ backgroundColor: pessoa.cor }}
          >
            {iniciais(pessoa.nome || pessoa.email) || "?"}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-background" />
          </div>
        ))}
      </div>
      {pessoas.length > 4 && (
        <span className="text-xs text-muted-foreground">+{pessoas.length - 4}</span>
      )}
      <span className="text-xs text-muted-foreground hidden sm:inline">
        {pessoas.length === 1 ? "1 pessoa online" : `${pessoas.length} pessoas online`}
      </span>
    </div>
  );
}
