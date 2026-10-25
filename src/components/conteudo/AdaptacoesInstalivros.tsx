// Roteiros do Instalivros adaptados para o Davi (25/10/2026, Davi por voz): quando um roteiro do
// Instalivros fica pronto, o Junior escreve a versão do @eu.daviqueiroz (scripts/empresa/adaptacao.py)
// e ela chega aqui "Aguardando aprovação". Aprovar → fila de gravação; Pedir ajuste → nova tarefa do
// Junior com o pedido e a versão anterior guardada na descrição; Descartar → sai da Vertical (não apaga).
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceTabsOpcional } from "@/components/workspace/WorkspaceTabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { textoDoRoteiro } from "@/lib/conteudo/roteirosNoDocumento";
import { toast } from "sonner";
import { Check, ExternalLink, FileText, History, Loader2, MessageSquare, X } from "lucide-react";

// Mesmos textos de scripts/empresa/adaptacao.py.
const MARCA = "ADAPTAR:";
const AJUSTE = "--- Ajuste pedido pelo Davi ---";
const ANTERIOR = "--- Versão anterior (guardada) ---";

export interface CardAdaptado {
  id: string;
  titulo: string;
  roteiro: string | null;
  status: string;
  ideia_origem_id?: string | null;
}

interface TarefaAdaptacao {
  id: string;
  descricao: string;
  concluida: boolean;
  created_at: string;
  video_vertical_id: string | null;
  responsavel_id: string | null;
  setor_id: string | null;
}

interface Original { id: string; cliente_id: string; titulo: string }

const db = supabase as unknown as SupabaseClient;

export function AdaptacoesInstalivros({ clienteId, cards, maiorOrdemGravacao, onAbrir, onMudou }: {
  clienteId: string;
  cards: CardAdaptado[];
  maiorOrdemGravacao: number;
  onAbrir: (id: string) => void;
  onMudou: () => void;
}) {
  const [tarefas, setTarefas] = useState<TarefaAdaptacao[]>([]);
  const [originais, setOriginais] = useState<Record<string, Original>>({});
  const [ajusteAberto, setAjusteAberto] = useState<string | null>(null);
  const [pedido, setPedido] = useState("");
  const [versoesAbertas, setVersoesAbertas] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const guias = useWorkspaceTabsOpcional();
  const navigate = useNavigate();
  const chaveCards = cards.map((c) => c.id).join(",");

  const carregar = useCallback(async () => {
    const origens = [...new Set(cards.map((c) => c.ideia_origem_id).filter(Boolean))] as string[];
    const [{ data: ts }, { data: os }] = await Promise.all([
      db.from("atividades").select("id, descricao, concluida, created_at, video_vertical_id, responsavel_id, setor_id")
        .eq("cliente_id", clienteId).like("descricao", `${MARCA}%`).is("deleted_at", null).order("created_at"),
      origens.length ? supabase.from("videos_vertical").select("id, cliente_id, titulo").in("id", origens) : Promise.resolve({ data: [] }),
    ]);
    setTarefas((ts ?? []) as TarefaAdaptacao[]);
    setOriginais(Object.fromEntries(((os ?? []) as Original[]).map((o) => [o.id, o])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, chaveCards]);

  useEffect(() => { void carregar(); }, [carregar]);
  // Enquanto o Junior escreve a nova versão, confere de tempos em tempos; quando ele entrega, recarrega a Vertical.
  const gerando = (cardId: string) => tarefas.some((t) => t.video_vertical_id === cardId && !t.concluida);
  const algumGerando = cards.some((c) => gerando(c.id));
  const gerandoAntes = useRef(false);
  useEffect(() => {
    if (gerandoAntes.current && !algumGerando) onMudou();
    gerandoAntes.current = algumGerando;
    if (!algumGerando) return;
    const t = window.setInterval(() => void carregar(), 20000);
    return () => window.clearInterval(t);
  }, [algumGerando, carregar, onMudou]);

  if (cards.length === 0) return null;

  const versoesAnteriores = (cardId: string) => tarefas
    .filter((t) => t.video_vertical_id === cardId && t.descricao.includes(ANTERIOR))
    .map((t) => ({
      id: t.id,
      em: t.created_at,
      pedido: t.descricao.split(AJUSTE)[1]?.split(ANTERIOR)[0]?.trim() ?? "",
      texto: textoDoRoteiro(t.descricao.split(ANTERIOR)[1] ?? ""),
    }))
    .reverse();

  const abrirOriginal = (o: Original) => {
    const caminho = `/clientes/${o.cliente_id}?secao=conteudo:vertical&video=${o.id}`;
    if (guias) guias.openTab(caminho, o.titulo || "Roteiro original", { nova: true });
    else navigate(caminho);
  };

  const aprovar = async (c: CardAdaptado) => {
    setSalvando(c.id);
    const { error } = await supabase.from("videos_vertical").update({ status: "gravacao", ordem: maiorOrdemGravacao + 1 }).eq("id", c.id);
    setSalvando(null);
    if (error) { toast.error("Não foi possível aprovar"); return; }
    toast.success("Aprovado: foi para a fila de gravação");
    onMudou();
  };

  const descartar = async (c: CardAdaptado) => {
    if (!window.confirm(`Descartar a versão "${c.titulo}"? Ela sai da Vertical (o roteiro do Instalivros não muda).`)) return;
    setSalvando(c.id);
    const { error } = await supabase.from("videos_vertical").update({ status: "descartado" }).eq("id", c.id);
    setSalvando(null);
    if (error) { toast.error("Não foi possível descartar"); return; }
    toast.success("Versão descartada");
    onMudou();
  };

  const pedirAjuste = async (c: CardAdaptado) => {
    const texto = pedido.trim();
    if (!texto || !c.ideia_origem_id) return;
    setSalvando(c.id);
    // Quem adaptou da primeira vez (o Junior) refaz; a versão atual fica guardada na própria tarefa.
    const primeira = tarefas.find((t) => t.descricao.startsWith(`${MARCA}${c.ideia_origem_id}`));
    if (!primeira?.responsavel_id) { setSalvando(null); toast.error("Não achei quem fez a adaptação para pedir o ajuste"); return; }
    const { data: coluna } = await supabase.from("colunas_atividade").select("status_key")
      .eq("cliente_id", clienteId).eq("eh_conclusao", false).order("ordem").limit(1).maybeSingle();
    const { error } = await db.from("atividades").insert({
      titulo: `Ajustar adaptação: ${c.titulo}`.slice(0, 300), cliente_id: clienteId,
      data_atividade: new Date().toISOString().slice(0, 10), status: coluna?.status_key ?? "backlog", concluida: false,
      prioridade: "media", ordem: 0, responsavel_id: primeira.responsavel_id, setor_id: primeira.setor_id,
      situacao: "fila", tipo: "copy", video_vertical_id: c.id,
      descricao: `${MARCA}${c.ideia_origem_id}:${c.id}\n${AJUSTE}\n${texto}\n${ANTERIOR}\n${c.roteiro ?? ""}`,
    });
    setSalvando(null);
    if (error) { toast.error("Não foi possível pedir o ajuste"); return; }
    toast.success("Pedido enviado: o Junior está escrevendo a nova versão");
    setAjusteAberto(null);
    setPedido("");
    void carregar();
  };

  return (
    <div className="space-y-3 rounded-lg border border-orange-500/30 bg-orange-500/5 p-4">
      <div>
        <h3 className="text-base font-semibold leading-tight">Adaptações do Instalivros aguardando aprovação</h3>
        <p className="text-xs text-muted-foreground">Roteiros prontos do Instalivros reescritos para o seu perfil. Aprove para ir à gravação, peça ajuste ou descarte.</p>
      </div>
      {cards.map((c) => {
        const o = c.ideia_origem_id ? originais[c.ideia_origem_id] : undefined;
        const versoes = versoesAnteriores(c.id);
        const ocupado = salvando === c.id || gerando(c.id);
        return (
          <div key={c.id} className="space-y-2 rounded-md border bg-card p-3">
            <div className="flex flex-wrap items-start gap-2">
              <Badge variant="outline" className="h-5 border-orange-500/50 px-1.5 py-0 text-[10px] text-orange-600 dark:text-orange-400">Instalivros</Badge>
              <button type="button" className="min-w-0 flex-1 text-left text-sm font-medium leading-snug hover:underline" onClick={() => onAbrir(c.id)}>
                {c.titulo}
              </button>
              {gerando(c.id) && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Junior escrevendo a nova versão…</span>
              )}
            </div>
            <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{textoDoRoteiro(c.roteiro)}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-7 gap-1" disabled={ocupado} onClick={() => void aprovar(c)}><Check className="h-3.5 w-3.5" />Aprovar</Button>
              <Button size="sm" variant="outline" className="h-7 gap-1" disabled={ocupado}
                onClick={() => { setAjusteAberto(ajusteAberto === c.id ? null : c.id); setPedido(""); }}>
                <MessageSquare className="h-3.5 w-3.5" />Pedir ajuste
              </Button>
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-muted-foreground" disabled={ocupado} onClick={() => void descartar(c)}><X className="h-3.5 w-3.5" />Descartar</Button>
              <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => onAbrir(c.id)}><FileText className="h-3.5 w-3.5" />Abrir roteiro</Button>
              {o && (
                <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => abrirOriginal(o)}><ExternalLink className="h-3.5 w-3.5" />Ver original</Button>
              )}
              {versoes.length > 0 && (
                <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => setVersoesAbertas(versoesAbertas === c.id ? null : c.id)}>
                  <History className="h-3.5 w-3.5" />{versoes.length === 1 ? "1 versão anterior" : `${versoes.length} versões anteriores`}
                </Button>
              )}
            </div>
            {ajusteAberto === c.id && (
              <div className="space-y-2">
                <Textarea autoFocus rows={3} value={pedido} onChange={(e) => setPedido(e.target.value)}
                  placeholder="O que ajustar? Ex.: a linha depois da headline está fraca; deixe o CTA mais direto" />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setAjusteAberto(null)}>Cancelar</Button>
                  <Button size="sm" className="h-7" disabled={!pedido.trim() || salvando === c.id} onClick={() => void pedirAjuste(c)}>Enviar ao Junior</Button>
                </div>
              </div>
            )}
            {versoesAbertas === c.id && versoes.map((v, i) => (
              <div key={v.id} className="space-y-1 rounded border bg-muted/30 p-2 text-xs">
                <p className="font-medium">Versão {versoes.length - i} · {new Date(v.em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                {v.pedido && <p className="text-muted-foreground">Ajuste pedido: {v.pedido}</p>}
                <p className="whitespace-pre-line">{v.texto}</p>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
