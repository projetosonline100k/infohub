import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotasListPane } from "@/components/notas/NotasListPane";
import { NotaEditorPane } from "@/components/notas/NotaEditorPane";
import { ProjetoSelectorInline } from "../ProjetoSelectorInline";
import type { AssistantDocumento } from "@/hooks/useAssistantDocumentos";
import type { AssistantProjetoOpcao } from "@/hooks/useAssistantProjeto";

interface AssistantNotasTabProps {
  projetoId: string | null;
  projetos: AssistantProjetoOpcao[];
  onSelecionarProjeto: (id: string | null) => void;
  notas: AssistantDocumento[];
  loading: boolean;
  onCriarNota: (titulo: string, conteudo: string) => Promise<AssistantDocumento>;
  onFixarNota: (id: string, fixado: boolean) => void;
  onExcluirNota: (id: string) => void;
  onNotaAtualizada: (id: string, patch: Partial<AssistantDocumento>) => void;
  onAbrirNotasCompleto: () => void;
}

// Estilo app de notas mobile: lista (100% da largura) OU editor (100% da
// largura), nunca os dois lado a lado — o painel do Jarvis é estreito
// demais pra 2 colunas ficarem legíveis. A lista fica escondida via CSS
// (não desmontada) enquanto o editor está aberto, pra "voltar" preservar a
// posição de rolagem em vez de resetar a lista do zero. O projeto é
// escolhido bem aqui (ProjetoSelectorInline) — não existe mais uma aba
// "Projeto" separada só pra isso.
export function AssistantNotasTab({ projetoId, projetos, onSelecionarProjeto, notas, loading, onCriarNota, onFixarNota, onExcluirNota, onNotaAtualizada, onAbrirNotasCompleto }: AssistantNotasTabProps) {
  const [notaAbertaId, setNotaAbertaId] = useState<string | null>(null);
  const notaAberta = notas.find((n) => n.id === notaAbertaId) ?? null;

  const criarNota = async () => {
    const nova = await onCriarNota("Nota sem título", "");
    setNotaAbertaId(nova.id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-full min-h-0 flex-col", notaAberta && "hidden")}>
        <div className="flex shrink-0 items-center justify-between">
          <p className="text-sm font-semibold">Notas</p>
          <button
            type="button"
            onClick={onAbrirNotasCompleto}
            title="Abrir Notas"
            aria-label="Abrir Notas"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
        <div className="shrink-0 pb-1.5">
          <ProjetoSelectorInline projetos={projetos} projetoId={projetoId} onSelecionar={onSelecionarProjeto} />
        </div>
        {!projetoId ? (
          <p className="pt-1 text-sm text-muted-foreground">Selecione um projeto acima para ver as notas.</p>
        ) : (
          <div className="min-h-0 flex-1">
            <NotasListPane
              notas={notas}
              loading={loading}
              notaSelecionadaId={notaAbertaId}
              onSelecionar={setNotaAbertaId}
              onCriar={criarNota}
              compact
            />
          </div>
        )}
      </div>

      {notaAberta && (
        <div className="h-full min-h-0">
          <NotaEditorPane
            nota={notaAberta}
            onVoltar={() => setNotaAbertaId(null)}
            onFixar={onFixarNota}
            onExcluir={(id) => {
              onExcluirNota(id);
              setNotaAbertaId(null);
            }}
            onNotaAtualizada={onNotaAtualizada}
            compact
          />
        </div>
      )}
    </div>
  );
}
