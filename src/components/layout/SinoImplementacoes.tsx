import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, CheckCircle2, ChevronDown, Clock, Hammer, Loader2, ShieldQuestion, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { duracaoMs, duracaoTexto, type PontePedido } from "@/lib/ponte/painel";

// Sino das implementações (12/11/2026, Davi: "um sino no canto que mostra o que está sendo implementado, porque hoje eu não sei o que está sendo feito").
// Lê a fila da ponte (Claude de voz, Gabriela… → Claude Code) pela função ponte_painel(), que só responde ao login do Davi: para os outros o sino nem aparece.
const db = supabase as unknown as SupabaseClient;
const ORIGEM: Record<string, string> = { claude_voz: "Claude de voz", gabriela: "Gabriela" };
const ATIVOS = ["pendente", "aguardando_aprovacao", "em_andamento"];
const haQuanto = (iso: string | null) => (iso ? formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true }) : "");

export function SinoImplementacoes() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<PontePedido[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [visto, setVisto] = useState<number>(() => { try { return Number(localStorage.getItem("sino-implementacoes:visto")) || 0; } catch { return 0; } });
  const anterior = useRef<Map<string, string>>(new Map());
  const emCurso = useRef(false);

  const recarregar = useCallback(async () => {
    if (emCurso.current) return;
    emCurso.current = true;
    try {
      const { data, error } = await db.rpc("ponte_painel");
      if (error) { setPedidos(null); return; }   // não é o Davi (ou sem rede): o sino não aparece
      const lista = ((data ?? []) as PontePedido[]).slice().sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em));
      // Aviso quando um pedido que estava sendo feito termina.
      if (anterior.current.size) {
        for (const p of lista) {
          const antes = anterior.current.get(p.id);
          if (antes && ATIVOS.includes(antes) && p.status === "concluido") toast.success(`Implementado: ${p.titulo}`);
          if (antes && ATIVOS.includes(antes) && p.status === "erro") toast.error(`Não deu certo: ${p.titulo}`);
        }
      }
      anterior.current = new Map(lista.map((p) => [p.id, p.status]));
      setPedidos(lista);
    } finally { emCurso.current = false; }
  }, []);

  useEffect(() => {
    void recarregar();
    const t = window.setInterval(() => { if (!document.hidden) void recarregar(); }, 8000);
    const r = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => { window.clearInterval(t); window.clearInterval(r); };
  }, [recarregar]);

  if (pedidos === null) return null;
  const ativos = pedidos.filter((p) => ATIVOS.includes(p.status));
  const fazendo = ativos.filter((p) => p.status === "em_andamento");
  const recentes = pedidos.filter((p) => !ATIVOS.includes(p.status)).slice(0, 12);
  const novos = recentes.filter((p) => Date.parse(p.concluido_em ?? p.criado_em) > visto).length;
  const abrir = (a: boolean) => {
    setAberto(a);
    if (a) { const t = Date.now(); setVisto(t); try { localStorage.setItem("sino-implementacoes:visto", String(t)); } catch { /* sem armazenamento */ } }
  };
  const aprovar = async (id: string) => {
    const { error } = await db.rpc("ponte_aprovar", { p_id: id });
    if (error) toast.error("Não consegui aprovar"); else { toast.success("Aprovado: já entra na fila"); void recarregar(); }
  };

  const Linha = ({ p }: { p: PontePedido }) => {
    const dur = duracaoMs(p, agora);
    const aberta = expandido === p.id;
    const detalhe = p.status === "erro" ? p.erro : p.resultado;
    return (
      <div className="rounded-lg border border-border/60 bg-card/50">
        <button type="button" onClick={() => setExpandido(aberta ? null : p.id)} className="flex w-full items-start gap-2 p-2 text-left">
          {p.status === "em_andamento" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-cyan-400" />
            : p.status === "concluido" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            : p.status === "erro" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
            : p.status === "aguardando_aprovacao" ? <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-sm font-medium leading-snug">{p.titulo}</span>
            <span className="text-[11px] text-muted-foreground">
              {ORIGEM[p.origem] ?? p.origem.charAt(0).toUpperCase() + p.origem.slice(1)} · {p.status === "em_andamento" ? `fazendo há ${duracaoTexto(dur ?? 0)}` : p.status === "pendente" ? `na fila desde ${haQuanto(p.criado_em)}` : p.status === "aguardando_aprovacao" ? "esperando sua aprovação" : haQuanto(p.concluido_em ?? p.criado_em)}
            </span>
          </span>
          {detalhe && <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", aberta && "rotate-180")} />}
        </button>
        {(p.status === "aguardando_aprovacao" || (p.status === "pendente" && p.requer_aprovacao && !p.aprovado)) && (
          <div className="px-2 pb-2"><button type="button" onClick={() => void aprovar(p.id)} className="rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-black hover:bg-amber-400">Aprovar</button></div>
        )}
        {aberta && detalhe && <p className="max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-border/60 p-2 text-xs text-muted-foreground">{detalhe}</p>}
      </div>
    );
  };

  return (
    <div className="fixed right-3 top-1.5 z-40">
      <Popover open={aberto} onOpenChange={abrir}>
        <PopoverTrigger asChild>
          <button type="button" title={fazendo.length ? `Implementando: ${fazendo[0].titulo}` : ativos.length ? "Pedidos na fila" : "Implementações"}
            className={cn("relative flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/80 backdrop-blur hover:bg-muted", fazendo.length > 0 && "border-cyan-400/60")}>
            <Bell className={cn("h-4 w-4", fazendo.length > 0 && "animate-pulse text-cyan-400")} />
            {ativos.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold text-black">{ativos.length}</span>}
            {ativos.length === 0 && novos > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[360px] space-y-3 p-3">
          <div className="flex items-center gap-2"><Hammer className="h-4 w-4 text-cyan-400" /><p className="text-sm font-semibold">Implementações</p>
            <button type="button" onClick={() => { setAberto(false); navigate("/ponte"); }} className="ml-auto text-xs text-cyan-400 hover:underline">Abrir a Ponte</button></div>
          {ativos.length === 0 && recentes.length === 0 && <p className="text-sm text-muted-foreground">Nada sendo implementado no momento.</p>}
          {ativos.length > 0 && <div className="space-y-1.5"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Agora</p>{ativos.map((p) => <Linha key={p.id} p={p} />)}</div>}
          {ativos.length === 0 && recentes.length > 0 && <p className="text-sm text-muted-foreground">Nada sendo implementado agora.</p>}
          {recentes.length > 0 && <div className="max-h-72 space-y-1.5 overflow-y-auto"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recentes</p>{recentes.map((p) => <Linha key={p.id} p={p} />)}</div>}
        </PopoverContent>
      </Popover>
    </div>
  );
}
