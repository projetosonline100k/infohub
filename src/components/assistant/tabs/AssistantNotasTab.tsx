import { useState } from "react";
import { toast } from "sonner";
import { Plus, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { conteudoDaNota, type AssistantDocumento } from "@/hooks/useAssistantDocumentos";

interface AssistantNotasTabProps {
  projetoId: string | null;
  notas: AssistantDocumento[];
  loading: boolean;
  onCriarNota: (titulo: string, conteudo: string) => Promise<unknown>;
}

// Aba "Notas" — item 7: nota rápida (título + texto simples, sem editor
// rico — por isso não reaproveita o TipTap do DocumentEditor aqui) salva na
// MESMA tabela `documentos`, marcada com o prefixo __NOTA_RAPIDA_V1__ (mesma
// técnica que Caderno/Mapa Mental já usam pra distinguir "tipo" de
// documento). Relacionada a usuário (RLS), projeto (cliente_id, quando
// houver) e data (created_at) — sem tabela nova.
export function AssistantNotasTab({ projetoId, notas, loading, onCriarNota }: AssistantNotasTabProps) {
  const [criando, setCriando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [expandidaId, setExpandidaId] = useState<string | null>(null);

  const salvar = async () => {
    if (!titulo.trim() || salvando) return;
    setSalvando(true);
    try {
      await onCriarNota(titulo.trim(), conteudo);
      setTitulo("");
      setConteudo("");
      setCriando(false);
    } catch {
      toast.error("Não foi possível salvar a nota");
    } finally {
      setSalvando(false);
    }
  };

  if (criando) {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="assistant-nota-titulo" className="text-xs">Título</Label>
          <Input id="assistant-nota-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ideia para oferta" autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="assistant-nota-conteudo" className="text-xs">Conteúdo</Label>
          <Textarea id="assistant-nota-conteudo" value={conteudo} onChange={(e) => setConteudo(e.target.value)} rows={5} placeholder="..." />
        </div>
        <div className="flex gap-2">
          <Button type="button" className="flex-1" disabled={!titulo.trim() || salvando} onClick={salvar}>
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setCriando(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Notas{!projetoId && " pessoais"}</p>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setCriando(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova nota
        </Button>
      </div>

      {loading && <p className="text-xs text-muted-foreground">Carregando...</p>}
      {!loading && notas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma nota por aqui ainda.</p>}

      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {notas.map((nota) => {
          const expandida = expandidaId === nota.id;
          const texto = conteudoDaNota(nota);
          return (
            <li key={nota.id} className="rounded-md border border-border">
              <button
                type="button"
                onClick={() => setExpandidaId(expandida ? null : nota.id)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{nota.titulo || "Nota sem título"}</span>
              </button>
              {expandida && (
                <p className="whitespace-pre-wrap border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
                  {texto || "(sem conteúdo)"}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
