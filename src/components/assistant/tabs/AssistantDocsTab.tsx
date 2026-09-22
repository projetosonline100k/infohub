import { useMemo, useState } from "react";
import { FileText, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssistantDocumento } from "@/hooks/useAssistantDocumentos";
import type { AssistantProjetoOpcao } from "@/hooks/useAssistantProjeto";

interface AssistantDocsTabProps {
  projetoId: string | null;
  projetoAtual: AssistantProjetoOpcao | null;
  documentos: AssistantDocumento[];
  loading: boolean;
  onCriarDocumento: () => void;
  onAbrirDocumento: (id: string) => void;
  onIrParaProjeto: () => void;
}

// Aba "Docs" — item 6: reaproveita a tabela `documentos` e o DocumentEditor
// já existentes (ver DocumentosView.tsx) — sem rota nova, o editor é
// montado direto por cima do painel (ver Assistant.tsx).
export function AssistantDocsTab({ projetoId, projetoAtual, documentos, loading, onCriarDocumento, onAbrirDocumento, onIrParaProjeto }: AssistantDocsTabProps) {
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return documentos;
    return documentos.filter((d) => (d.titulo || "").toLowerCase().includes(termo));
  }, [documentos, busca]);

  if (!projetoId) {
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>Selecione um projeto pra ver os documentos dele.</p>
        <Button type="button" variant="outline" size="sm" onClick={onIrParaProjeto}>
          Selecionar projeto
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{projetoAtual?.nome ?? "Documentos"}</p>
        <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 gap-1 px-2 text-xs" onClick={onCriarDocumento}>
          <Plus className="h-3.5 w-3.5" /> Novo documento
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar documento..." className="h-8 pl-7 text-sm" />
      </div>

      {loading && <p className="text-xs text-muted-foreground">Carregando...</p>}

      {!loading && filtrados.length === 0 && (
        <p className="text-sm text-muted-foreground">{documentos.length === 0 ? "Nenhum documento neste projeto ainda." : "Nada encontrado."}</p>
      )}

      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {filtrados.map((doc) => (
          <li key={doc.id}>
            <button
              type="button"
              onClick={() => onAbrirDocumento(doc.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{doc.titulo || "Documento sem título"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
