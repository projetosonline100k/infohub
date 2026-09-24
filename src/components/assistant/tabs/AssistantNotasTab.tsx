import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotasListPane } from "@/components/notas/NotasListPane";
import { NotaEditorPane } from "@/components/notas/NotaEditorPane";
import type { AssistantDocumento } from "@/hooks/useAssistantDocumentos";

interface AssistantNotasTabProps {
  projetoId: string | null;
  notas: AssistantDocumento[];
  loading: boolean;
  onCriarNota: (titulo: string, conteudo: string) => Promise<AssistantDocumento>;
  onFixarNota: (id: string, fixado: boolean) => void;
  onExcluirNota: (id: string) => void;
  onAbrirNotasCompleto: () => void;
}

// Item 9: lista → clicar → editor (empilhados, sem os dois lado a lado —
// espaço compacto do Jarvis). Mesmos panes (NotasListPane/NotaEditorPane)
// usados pela página /notas (3 colunas), sem duplicar a lógica de
// busca/ordenação/autosave. "Abrir notas completo" leva pra /notas na
// janela main (item 1) — nunca abre o app inteiro dentro do Jarvis.
export function AssistantNotasTab({ projetoId, notas, loading, onCriarNota, onFixarNota, onExcluirNota, onAbrirNotasCompleto }: AssistantNotasTabProps) {
  const [notaAbertaId, setNotaAbertaId] = useState<string | null>(null);
  const notaAberta = notas.find((n) => n.id === notaAbertaId) ?? null;

  const botaoAbrirCompleto = (
    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" onClick={onAbrirNotasCompleto}>
      <Maximize2 className="h-3 w-3" />
      Abrir notas completo
    </Button>
  );

  if (!projetoId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Selecione um projeto na aba Projeto para ver as notas.</p>
        {botaoAbrirCompleto}
      </div>
    );
  }

  if (notaAberta) {
    return (
      <div className="h-full">
        <NotaEditorPane
          nota={notaAberta}
          onVoltar={() => setNotaAbertaId(null)}
          onFixar={onFixarNota}
          onExcluir={(id) => {
            onExcluirNota(id);
            setNotaAbertaId(null);
          }}
          compact
        />
      </div>
    );
  }

  const criarNota = async () => {
    const nova = await onCriarNota("Nota sem título", "");
    setNotaAbertaId(nova.id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 justify-end pb-1">{botaoAbrirCompleto}</div>
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
    </div>
  );
}
