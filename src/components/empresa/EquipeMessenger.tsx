import { useCallback, useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { naoLidasPorMembro } from "@/lib/empresa/notificacoes";
import { ArrowLeft, Bot, ListTodo, MessageCircle, X } from "lucide-react";
import { AssistantConversaTab } from "@/components/assistant/tabs/AssistantConversaTab";
import { cn } from "@/lib/utils";
import type { MembroResumo, Sinal } from "@/lib/empresa/visaoGeral";
import { CabecaBoneco } from "./BonecoMesa";
import { BriefingTarefa } from "./BriefingTarefa";
import { criarTarefaParaMembro } from "./FilaPessoa";
import { ehCoordenador } from "@/lib/empresa/visaoGeral";

// Gaveta da equipe na lateral direita, no jeito do Messenger (pedido do
// Davi): fechada é uma aba com as carinhas; aberta lista todo mundo com o
// status; clicando em alguém abre a conversa (o mesmo briefing da fila da
// pessoa: ela diz o que entendeu e, confirmando, vira tarefa).
export interface PessoaChat { membro: MembroResumo; sinal: Sinal; atual: string | null }

const STATUS: Record<Sinal, { cor: string; texto: string }> = {
  trabalhando: { cor: "bg-emerald-500", texto: "Online · trabalhando" },
  esperando: { cor: "bg-amber-400", texto: "Precisa de você" },
  problema: { cor: "bg-rose-500", texto: "Com problema" },
  parado: { cor: "bg-zinc-400", texto: "Livre" },
};

export function EquipeMessenger({ clienteId, pessoas, onAbrirFila, onMudou, pedido }: {
  clienteId: string; pessoas: PessoaChat[]; onAbrirFila: (m: MembroResumo) => void; onMudou: () => void;
  /** 22/10 (Davi: "ao clicar no colaborador, apareça o chat dele"): abre a conversa dessa pessoa. */
  pedido?: { membroId: string; n: number } | null;
}) {
  const [aberta, setAberta] = useState(false);
  const [conversa, setConversa] = useState<PessoaChat | null>(null);
  // Respostas não lidas por pessoa (bolinha, como num app de mensagens; 15/10).
  const [naoLidas, setNaoLidas] = useState<Map<string, number>>(new Map());
  const contar = useCallback(() => { void naoLidasPorMembro(clienteId).then(setNaoLidas).catch(() => {}); }, [clienteId]);
  useEffect(() => {
    contar();
    const t = window.setInterval(contar, 15_000);
    window.addEventListener("conversa-lida", contar);
    return () => { window.clearInterval(t); window.removeEventListener("conversa-lida", contar); };
  }, [contar]);
  const totalNaoLidas = [...naoLidas.values()].reduce((s, n) => s + n, 0);
  // O Atlas conversa pela orbe (⌘J); aqui fica o resto da equipe.
  const lista = pessoas.filter((p) => !ehCoordenador(p.membro));
  const precisam = lista.filter((p) => p.sinal === "esperando").length;
  // ?conversa=<membro>: o Atlas avisou que ele respondeu — abre direto a conversa (16/10).
  const [params, setParams] = useSearchParams();
  const pedida = params.get("conversa");
  // Atende cada pedido uma vez só (19/10: a lista é recriada a cada desenho e o efeito tirava o
  // ?conversa= do endereço sem parar — "history.replaceState() mais de 100 vezes" e a tela em branco).
  const atendida = useRef<string | null>(null);
  useEffect(() => {
    if (!pedida || atendida.current === pedida) return;
    const p = lista.find((x) => x.membro.id === pedida);
    if (!p) return;                       // a equipe ainda está carregando
    atendida.current = pedida;
    setAberta(true);
    setConversa(p);
    setParams((sp) => { const n = new URLSearchParams(sp); n.delete("conversa"); return n; }, { replace: true });
  }, [pedida, lista, setParams]);
  const pedidoAtendido = useRef(0);
  useEffect(() => {
    if (!pedido || pedido.n === pedidoAtendido.current) return;
    const p = pessoas.find((x) => x.membro.id === pedido.membroId);
    if (!p) return;
    pedidoAtendido.current = pedido.n;
    setAberta(true);
    if (ehCoordenador(p.membro)) { setConversa(null); setComAtlas(true); setFocoAtlas((f) => f + 1); }
    else { setComAtlas(false); setConversa(p); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, pessoas]);
  const atualDaConversa = conversa ? lista.find((p) => p.membro.id === conversa.membro.id) ?? conversa : null;
  // 20/10 (Davi: "crie o chat dele"): o Atlas também na lista; a conversa é a mesma do ⌘J, atendida
  // pelo chat do Claude Code ligado ao Atlas (ou pelo ouvinte, quando o chat está fechado).
  const [comAtlas, setComAtlas] = useState(false);
  const [focoAtlas, setFocoAtlas] = useState(0);

  if (!aberta) {
    return (
      <button type="button" onClick={() => setAberta(true)} title="Conversar com a equipe"
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-xl border border-r-0 bg-card px-1.5 py-3 shadow-lg transition-colors hover:bg-muted">
        <MessageCircle className="h-4 w-4 text-primary" />
        <span className="flex flex-col -space-y-2">
          {lista.slice(0, 5).map((p) => (
            <span key={p.membro.id} className="relative h-7 w-7 overflow-hidden rounded-full border-2 border-card bg-sky-100 dark:bg-slate-700">
              <CabecaBoneco nome={p.membro.nome} ehIa={p.membro.eh_ia} className="h-full w-full" />
            </span>
          ))}
        </span>
        <span className="text-[10px] font-semibold [writing-mode:vertical-rl]">Equipe</span>
        {totalNaoLidas > 0 && <span className="animate-pulse rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white" title="Respostas não lidas">{totalNaoLidas}</span>}
        {precisam > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-900">{precisam}</span>}
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 top-24 z-40 flex w-[340px] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
      {/* Cabeçalho: lista ou a pessoa da conversa */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        {comAtlas ? (
          <>
            <button type="button" onClick={() => setComAtlas(false)} className="rounded-md p-1 hover:bg-muted" aria-label="Voltar para a equipe"><ArrowLeft className="h-4 w-4" /></button>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-sky-300"><Bot className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Atlas</p>
              <p className="truncate text-[11px] text-muted-foreground">Coordena a operação · fala direto com o Claude</p>
            </div>
          </>
        ) : atualDaConversa ? (
          <>
            <button type="button" onClick={() => setConversa(null)} className="rounded-md p-1 hover:bg-muted" aria-label="Voltar para a equipe"><ArrowLeft className="h-4 w-4" /></button>
            <Avatar p={atualDaConversa} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{atualDaConversa.membro.nome}</p>
              <p className="truncate text-[11px] text-muted-foreground">{STATUS[atualDaConversa.sinal].texto}{atualDaConversa.atual ? ` · ${atualDaConversa.atual}` : ""}</p>
            </div>
            <button type="button" title="Ver a fila e o que está fazendo" onClick={() => onAbrirFila(atualDaConversa.membro)} className="rounded-md p-1 hover:bg-muted"><ListTodo className="h-4 w-4" /></button>
          </>
        ) : (
          <>
            <MessageCircle className="h-4 w-4 text-primary" />
            <p className="flex-1 text-sm font-semibold">Equipe</p>
          </>
        )}
        <button type="button" onClick={() => { setAberta(false); setConversa(null); setComAtlas(false); }} className="rounded-md p-1 hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
      </div>

      {comAtlas ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <AssistantConversaTab foco={focoAtlas} />
        </div>
      ) : atualDaConversa ? (
        <div className="min-h-0 flex-1">
          <BriefingTarefa key={atualDaConversa.membro.id} messenger clienteId={clienteId} membro={atualDaConversa.membro}
            onCriarTarefa={async (t) => { const id = await criarTarefaParaMembro(clienteId, atualDaConversa.membro.id, t); onMudou(); return id; }} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          <button type="button" onClick={() => { setComAtlas(true); setFocoAtlas((n) => n + 1); }}
            className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-sky-300"><Bot className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">Atlas</span>
              <span className="block truncate text-[11px] text-muted-foreground">Coordenando a operação · fale direto com o Claude</span>
            </span>
            <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] text-muted-foreground">IA</span>
          </button>
          {lista.map((p) => (
            <button key={p.membro.id} type="button" onClick={() => setConversa(p)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted">
              <Avatar p={p} />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm", naoLidas.get(p.membro.id) ? "font-bold" : "font-medium")}>{p.membro.nome}</span>
                <span className={cn("block truncate text-[11px]", naoLidas.get(p.membro.id) ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {naoLidas.get(p.membro.id) ? "Nova mensagem" : p.atual ?? STATUS[p.sinal].texto}
                </span>
              </span>
              {!!naoLidas.get(p.membro.id) && (
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{naoLidas.get(p.membro.id)}</span>
              )}
              <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px]", p.sinal === "esperando" ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                {p.sinal === "esperando" ? "precisa de você" : p.membro.eh_ia ? "IA" : ""}
              </span>
            </button>
          ))}
          <p className="px-2 pt-2 text-[11px] text-muted-foreground">Converse com alguém: ele diz o que entendeu e, quando você confirma, vira tarefa. O Atlas é o Claude: pede o que quiser no sistema.</p>
        </div>
      )}
    </div>
  );
}

function Avatar({ p }: { p: PessoaChat }) {
  return (
    <span className="relative shrink-0">
      <span className="block h-9 w-9 overflow-hidden rounded-full bg-sky-100 dark:bg-slate-700">
        <CabecaBoneco nome={p.membro.nome} ehIa={p.membro.eh_ia} className="h-full w-full" />
      </span>
      <span className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card", STATUS[p.sinal].cor)} />
    </span>
  );
}
