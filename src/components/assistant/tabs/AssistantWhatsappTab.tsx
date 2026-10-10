import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Copy, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import {
  DIFICULDADE, EMOJI_SATISFACAO, UPGRADE, calcularMetricas, cardRespondido, marcarCard, marcarItem, minutosRestantes, progressoCard, dataCurta, diasDesde, formatarMinutos, htmlSeguro, media, mediana, textoParaCopiar,
  type CardWhatsapp, type Historico,
} from "@/lib/whatsapp/painel";

type SubAba = "responder" | "saude" | "desempenho" | "compromissos";
type Ordem = "facil" | "dificil";
interface Painel {
  cards: CardWhatsapp[]; historico: Historico | null; respondidos: Record<string, boolean>; atualizado_em: string;
  pedidoEm: string | null; pedidoStatus: "pedida" | "rodando" | "ok" | "erro" | null; pedidoMensagem: string | null;
}
// Se ninguém pegar o pedido nesse tempo, o chat do Claude não está ouvindo.
const ESPERA_MAXIMA_PEDIDO_MS = 90_000;

const CHAVE_SUBABA = "jarvis:whatsapp-aba";
const CHAVE_ORDEM = "jarvis:whatsapp-ordem";
const ler = <T extends string>(chave: string, padrao: T): T => { try { return (localStorage.getItem(chave) as T) || padrao; } catch { return padrao; } };
const gravar = (chave: string, valor: string) => { try { localStorage.setItem(chave, valor); } catch { /* sem storage */ } };

// Cores das etiquetas, iguais às do painel HTML (urg/alta/media/ok/cinza).
const TOM: Record<string, string> = {
  urg: "text-orange-700 bg-orange-100 dark:text-orange-400 dark:bg-orange-950/60",
  alta: "text-amber-700 bg-amber-100 dark:text-yellow-400 dark:bg-yellow-950/50",
  media: "text-blue-700 bg-blue-100 dark:text-blue-300 dark:bg-blue-950/60",
  ok: "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-950/50",
  cinza: "text-muted-foreground bg-muted",
};
const TEXTO: Record<string, string> = { ok: "text-green-700 dark:text-green-400", alta: "text-amber-600 dark:text-yellow-400", urg: "text-orange-700 dark:text-orange-400" };
const BARRA: Record<string, string> = { ok: "bg-green-600", alta: "bg-amber-500", urg: "bg-orange-600" };
const DISC_COR: Record<string, string> = { D: "bg-red-600", I: "bg-amber-600", S: "bg-green-600", C: "bg-blue-600" };

function Disc({ letra, mini }: { letra: string; mini?: boolean }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full font-extrabold text-white", DISC_COR[letra] ?? "bg-muted-foreground", mini ? "h-[18px] w-[18px] text-[10px]" : "h-[26px] w-[26px] text-[13px]")}>
      {letra}
    </span>
  );
}
const Tag = ({ tom, children }: { tom: string; children: React.ReactNode }) => (
  <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", TOM[tom] ?? TOM.cinza)}>{children}</span>
);
const Kpi = ({ valor, rotulo, tom }: { valor: React.ReactNode; rotulo: React.ReactNode; tom?: string }) => (
  <div className="rounded-lg border border-border bg-card p-2.5">
    <b className={cn("block text-xl leading-tight", tom && TEXTO[tom])}>{valor}</b>
    <span className="text-[11px] text-muted-foreground">{rotulo}</span>
  </div>
);
const Nota = ({ children }: { children: React.ReactNode }) => <p className="mt-1.5 text-xs text-muted-foreground">{children}</p>;
const Titulo = ({ children }: { children: React.ReactNode }) => <h3 className="mb-2 mt-4 text-[13px] font-semibold">{children}</h3>;
const Html = ({ html, className }: { html: string; className?: string }) => <span className={className} dangerouslySetInnerHTML={{ __html: htmlSeguro(html) }} />;

function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(textoParaCopiar(texto));
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1800);
        } catch {
          toast.error("Não consegui copiar — selecione o texto e copie");
        }
      }}
      className={cn(
        "absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-[11px]",
        copiado ? "border-green-600 text-green-700 dark:text-green-400" : "border-border text-foreground hover:bg-accent",
      )}
    >
      {copiado ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

// Guia "WhatsApp" do Jarvis: o mesmo painel que a rotina "Ideias de resposta
// WhatsApp" montava em HTML (cards com DISC e sugestões em sanduíche, saúde
// dos mentorados, desempenho e compromissos), agora lido do banco
// (whatsapp_painel). A rotina publica com scripts/publicar-painel-whatsapp.py;
// aqui só se marca o que já foi respondido.
export function AssistantWhatsappTab() {
  const { user } = useAuth();
  const [painel, setPainel] = useState<Painel | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [subAba, setSubAba] = useState<SubAba>(() => ler(CHAVE_SUBABA, "responder"));
  const [ordem, setOrdem] = useState<Ordem>(() => ler(CHAVE_ORDEM, "facil"));
  const [agora, setAgora] = useState(() => new Date());
  const refsCards = useRef<Record<string, HTMLDivElement | null>>({});

  // silencioso: recarga de fundo (polling/foco), sem mostrar "carregando".
  const carregar = useCallback(async (silencioso = false) => {
    if (!user?.id) return;
    if (!silencioso) setCarregando(true);
    const { data, error } = await supabase.from("whatsapp_painel").select("cards, historico, respondidos, atualizado_em, atualizacao_pedida_em, atualizacao_status, atualizacao_mensagem").eq("user_id", user.id).maybeSingle();
    if (error) {
      if (!silencioso) toast.error("Não consegui carregar o painel do WhatsApp");
      setCarregando(false);
      return;
    }
    setPainel(data ? {
      cards: (data.cards as unknown as CardWhatsapp[]) || [],
      historico: data.historico && Object.keys(data.historico as object).length ? (data.historico as unknown as Historico) : null,
      respondidos: (data.respondidos as Record<string, boolean>) || {},
      atualizado_em: data.atualizado_em,
      pedidoEm: data.atualizacao_pedida_em,
      pedidoStatus: data.atualizacao_status as Painel["pedidoStatus"],
      pedidoMensagem: data.atualizacao_mensagem,
    } : null);
    setAgora(new Date());
    setCarregando(false);
  }, [user?.id]);

  useEffect(() => { void carregar(); }, [carregar]);

  // A rotina publica de fora do app: acompanha em tempo real. Se a conexão
  // cair (rede instável derruba o canal e ele não volta sozinho), reinscreve
  // depois de alguns segundos e recarrega pra não perder o que mudou.
  const [tentativaCanal, setTentativaCanal] = useState(0);
  useEffect(() => {
    if (!user?.id) return;
    let religar: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel(`whatsapp-painel-${user.id}-${tentativaCanal}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_painel", filter: `user_id=eq.${user.id}` }, () => { void carregar(true); })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && tentativaCanal > 0) void carregar(true);
        if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !religar) {
          religar = setTimeout(() => setTentativaCanal((n) => n + 1), 5000);
        }
      });
    const relogio = setInterval(() => setAgora(new Date()), 60_000);
    return () => { if (religar) clearTimeout(religar); void supabase.removeChannel(canal); clearInterval(relogio); };
  }, [user?.id, carregar, tentativaCanal]);

  // Voltou o foco ou a internet: recarrega (o realtime pode ter perdido algo).
  useEffect(() => {
    const recarregar = () => { void carregar(true); };
    window.addEventListener("focus", recarregar);
    window.addEventListener("online", recarregar);
    return () => { window.removeEventListener("focus", recarregar); window.removeEventListener("online", recarregar); };
  }, [carregar]);

  // Botão "Atualizar": registra o pedido; a sessão do Claude que está
  // ouvindo (scripts/esperar-pedido-whatsapp.py) lê o WhatsApp e publica — o
  // realtime acima traz o resultado.
  const pedirAtualizacao = async () => {
    if (!user?.id || !painel) return;
    const pedidoEm = new Date().toISOString();
    setPainel({ ...painel, pedidoEm, pedidoStatus: "pedida", pedidoMensagem: null });
    const { error } = await supabase.from("whatsapp_painel")
      .update({ atualizacao_pedida_em: pedidoEm, atualizacao_status: "pedida", atualizacao_mensagem: null }).eq("user_id", user.id);
    if (error) toast.error("Não consegui enviar o pedido");
  };
  // Enquanto há pedido em andamento, consulta o banco a cada 5s (não depende
  // só do realtime) e re-renderiza pra notar quando passou do tempo.
  const pedidoEmAndamento = painel?.pedidoStatus === "pedida" || painel?.pedidoStatus === "rodando";
  useEffect(() => {
    if (!pedidoEmAndamento) return;
    const t = setInterval(() => { setAgora(new Date()); void carregar(true); }, 5000);
    return () => clearInterval(t);
  }, [pedidoEmAndamento, carregar]);

  const metricas = useMemo(() => (painel?.historico ? calcularMetricas(painel.historico, agora) : null), [painel?.historico, agora]);

  const mudarSubAba = (aba: SubAba) => { setSubAba(aba); gravar(CHAVE_SUBABA, aba); };
  const mudarOrdem = (o: Ordem) => { setOrdem(o); gravar(CHAVE_ORDEM, o); };

  // Salva as marcas (card inteiro ou item do checklist). Quando o card
  // acabou de ficar respondido, rola até o próximo da fila, como no painel.
  const salvarRespondidos = async (card: CardWhatsapp, respondidos: Record<string, boolean>) => {
    if (!painel || !user?.id) return;
    const terminou = !cardRespondido(card, painel.respondidos) && cardRespondido(card, respondidos);
    setPainel({ ...painel, respondidos });
    const { error } = await supabase.from("whatsapp_painel").update({ respondidos }).eq("user_id", user.id);
    if (error) toast.error("Não consegui salvar");
    if (terminou) {
      setTimeout(() => {
        const prox = ordenados.find((c) => !cardRespondido(c, respondidos));
        if (prox) refsCards.current[prox.id]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
    }
  };
  const marcar = (card: CardWhatsapp, feito: boolean) => {
    if (painel) void salvarRespondidos(card, marcarCard(card, feito, painel.respondidos));
  };
  const marcarParte = (card: CardWhatsapp, itemId: string, feito: boolean) => {
    if (painel) void salvarRespondidos(card, marcarItem(card, itemId, feito, painel.respondidos));
  };

  const cards = painel?.cards ?? [];
  const ordenados = useMemo(() => [...(painel?.cards ?? [])].sort((a, b) => (ordem === "facil" ? 1 : -1) * (a.dif - b.dif)), [painel?.cards, ordem]);
  const feitos = painel?.respondidos ?? {};
  const pendentes = ordenados.filter((c) => !cardRespondido(c, feitos));
  const concluidos = ordenados.filter((c) => cardRespondido(c, feitos));
  const proximoId = pendentes[0]?.id;

  if (carregando && !painel) return <div className="p-4 text-xs text-muted-foreground">Carregando…</div>;
  if (!painel) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-muted-foreground">
        <MessageCircle className="h-6 w-6" />
        <p>Nenhum painel publicado ainda.</p>
        <p>Peça no Claude: “ideias de resposta WhatsApp” — as sugestões aparecem aqui.</p>
      </div>
    );
  }

  const h = painel.historico;
  const meta = metricas?.meta ?? 240;
  const minutosAbertos = pendentes.reduce((t, c) => t + minutosRestantes(c, feitos), 0);
  const fimPrevisto = new Date(agora.getTime() + minutosAbertos * 60000).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const atrasadas = metricas?.atrasadas.length ?? 0;
  const semResposta = painel.pedidoStatus === "pedida" && !!painel.pedidoEm && agora.getTime() - new Date(painel.pedidoEm).getTime() > ESPERA_MAXIMA_PEDIDO_MS;
  const emAndamento = painel.pedidoStatus === "rodando" || (painel.pedidoStatus === "pedida" && !semResposta);

  return (
    <div className="space-y-0 px-3 pb-4 pt-2 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground">
          Atualizado {format(new Date(painel.atualizado_em), "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}
        </div>
        <button
          type="button"
          onClick={() => void pedirAtualizacao()}
          disabled={emAndamento}
          title="Pede pro Claude ler o WhatsApp de novo e atualizar as sugestões"
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", emAndamento && "animate-spin")} />
          {emAndamento ? "Atualizando…" : "Atualizar"}
        </button>
      </div>
      {painel.pedidoStatus === "pedida" && !semResposta && (
        <div className="mb-2 rounded-md bg-muted/70 px-2.5 py-1.5 text-[11px] text-muted-foreground">Pedido enviado — esperando o Claude começar…</div>
      )}
      {painel.pedidoStatus === "pedida" && semResposta && (
        <div className={cn("mb-2 rounded-md px-2.5 py-1.5 text-[11px]", TOM.alta)}>
          O Claude não pegou o pedido. Abra o chat dele e peça: “fica ouvindo o Jarvis”. Assim que ele começar, o pedido é atendido.
        </div>
      )}
      {painel.pedidoStatus === "rodando" && (
        <div className={cn("mb-2 rounded-md px-2.5 py-1.5 text-[11px]", TOM.media)}>O Claude está lendo o WhatsApp e montando as sugestões… (leva alguns minutos)</div>
      )}
      {painel.pedidoStatus === "erro" && (
        <div className={cn("mb-2 rounded-md px-2.5 py-1.5 text-[11px]", TOM.urg)}>Não deu pra atualizar: {painel.pedidoMensagem || "erro desconhecido"}</div>
      )}

      <nav className="scrollbar-thin mb-3 flex gap-1 overflow-x-auto border-b border-border">
        {([["responder", "Responder agora"], ["saude", "Saúde"], ["desempenho", "Meu desempenho"], ["compromissos", "Compromissos"]] as [SubAba, string][]).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            onClick={() => mudarSubAba(id)}
            className={cn("-mb-px shrink-0 whitespace-nowrap border-b-2 px-2 py-1.5 text-[13px] font-semibold", subAba === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {rotulo}
            {id === "compromissos" && atrasadas > 0 && <i className="ml-1 rounded-full bg-orange-600 px-1.5 text-[10px] not-italic text-white">{atrasadas}</i>}
          </button>
        ))}
      </nav>

      {subAba === "responder" && (
        <section>
          <p className="mb-3 text-xs text-muted-foreground">Só aparece quem está esperando resposta sua</p>

          <div className="mb-3 rounded-lg border border-border bg-card px-3 py-2.5">
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <b className="text-[13px] text-foreground">Progresso</b>
              <span>{concluidos.length} de {cards.length} respondidos</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <i className="block h-full rounded-full bg-green-600 transition-[width]" style={{ width: `${cards.length ? (concluidos.length / cards.length) * 100 : 0}%` }} />
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>Ordenar:</span>
            {([["facil", "Mais fácil primeiro"], ["dificil", "Mais difícil primeiro"]] as [Ordem, string][]).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                onClick={() => mudarOrdem(id)}
                className={cn("rounded-full border px-2.5 py-1 text-xs", ordem === id ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-accent")}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {!pendentes.length && (
            <div className="mb-3 rounded-lg bg-green-100 p-3 text-center font-semibold text-green-700 dark:bg-green-950/50 dark:text-green-400">🎉 Todos os grupos respondidos!</div>
          )}

          <div className="mb-3 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
            <Kpi valor={minutosAbertos ? `~${formatarMinutos(minutosAbertos)}` : "✓"} rotulo={minutosAbertos ? `para zerar tudo · se começar agora, termina ~${fimPrevisto}` : "nada pendente no painel"} />
            <Kpi
              valor={pendentes.length}
              tom={pendentes.length && metricas?.pendentes.some((p) => p.min > meta) ? "urg" : "ok"}
              rotulo={`conversas para responder${metricas?.pendentes[0] ? ` · mais antiga há ${formatarMinutos(metricas.pendentes[0].min)}` : ""}`}
            />
            <Kpi
              valor={(metricas?.respondidasHoje ?? 0) + concluidos.length}
              tom="ok"
              rotulo={`respondidas hoje${concluidos.length ? ` (${metricas?.respondidasHoje ?? 0} no WhatsApp + ${concluidos.length} marcadas aqui)` : ""}`}
            />
            <Kpi valor={atrasadas} tom={atrasadas ? "urg" : "ok"} rotulo="promessa(s) atrasada(s)" />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
            {[["D", "Dominante · direto, foco em resultado"], ["I", "Influente · energia, reconhecimento"], ["S", "Estável · segurança, passo a passo"], ["C", "Conforme · dados, lógica, detalhe"]].map(([l, t]) => (
              <div key={l} className="flex items-center gap-1.5"><Disc letra={l} mini />{t}</div>
            ))}
          </div>

          {pendentes.map((c) => (
            <CardResposta
              key={c.id}
              card={c}
              atual={c.id === proximoId}
              espera={metricas?.esperaPorCard[c.id]}
              meta={meta}
              cor={metricas?.cor}
              respondidos={feitos}
              onMarcar={(v) => marcar(c, v)}
              onMarcarItem={(itemId, v) => marcarParte(c, itemId, v)}
              refCard={(el) => { refsCards.current[c.id] = el; }}
            />
          ))}

          {concluidos.length > 0 && <div className="mb-2 mt-4 text-xs font-semibold text-muted-foreground">✓ Concluídos</div>}
          {concluidos.map((c) => (
            <CardResposta key={c.id} card={c} feito respondidos={feitos} onMarcar={(v) => marcar(c, v)} onMarcarItem={(itemId, v) => marcarParte(c, itemId, v)} meta={meta} refCard={(el) => { refsCards.current[c.id] = el; }} />
          ))}
        </section>
      )}

      {subAba !== "responder" && (!h || !metricas) && <Nota>O histórico ainda não foi publicado.</Nota>}

      {subAba === "desempenho" && h && metricas && <AbaDesempenho h={h} m={metricas} />}
      {subAba === "saude" && h && metricas && <AbaSaude h={h} m={metricas} />}
      {subAba === "compromissos" && h && metricas && <AbaCompromissos h={h} m={metricas} agora={agora} />}
    </div>
  );
}

type Metricas = ReturnType<typeof calcularMetricas>;

function CardResposta({ card: c, feito, atual, espera, meta, cor, respondidos, onMarcar, onMarcarItem, refCard }: {
  card: CardWhatsapp; feito?: boolean; atual?: boolean; espera?: number; meta: number; cor?: (min: number) => string;
  respondidos: Record<string, boolean>;
  onMarcar: (feito: boolean) => void; onMarcarItem: (itemId: string, feito: boolean) => void; refCard: (el: HTMLDivElement | null) => void;
}) {
  const itens = c.itens ?? [];
  const progresso = progressoCard(c, respondidos);
  const restante = minutosRestantes(c, respondidos);
  const itemFeito = (id: string) => !!respondidos[c.id] || !!respondidos[id];
  const proximoItem = itens.find((i) => !itemFeito(i.id))?.id;
  const tomDif = c.dif <= 2 ? "text-green-600" : c.dif === 3 ? "text-amber-600" : "text-orange-600";
  return (
    <div
      ref={refCard}
      className={cn(
        "mb-3 scroll-mt-2 rounded-xl border bg-card p-3.5 transition-opacity",
        atual ? "border-2 border-green-600 shadow-[0_0_0_4px] shadow-green-600/15" : "border-border",
        feito && "opacity-55",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={!!feito} onChange={(e) => onMarcar(e.target.checked)} className="h-[18px] w-[18px] shrink-0 cursor-pointer accent-green-600" />
          <div>
            <div className={cn("text-[15px] font-semibold", feito && "line-through")}>{c.nome}</div>
            <div className="text-[11px] text-muted-foreground">{c.when}</div>
          </div>
        </label>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Tag tom={c.tagc}>{c.tag}</Tag>
          {atual && <span className="text-[11px] font-bold text-green-600">Próximo</span>}
        </div>
      </div>

      {!feito && espera != null && cor && (
        <div className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", TOM[cor(espera)])}>
          ⏱ esperando há {formatarMinutos(espera)} úteis{espera > meta ? " · fora da meta" : ""}
        </div>
      )}
      <div className="mt-1 text-[11px] text-muted-foreground">
        Dificuldade: <b>{DIFICULDADE[c.dif] ?? "Média"}</b> <span className={cn("tracking-wider", tomDif)}>{"●".repeat(c.dif)}{"○".repeat(5 - c.dif)}</span> · {itens.length && !feito
          ? <>~{restante} min restantes · <b>{progresso.feitos}/{progresso.total}</b> partes</>
          : <>~{c.tempo} min para responder</>}
      </div>

      {!feito && (
        <>
          <div className="mb-1 mt-2.5 flex items-start gap-2 rounded-lg bg-muted/70 px-2.5 py-2 text-xs">
            <Disc letra={c.disc.letra} />
            <div>
              <b>{c.disc.nome}</b><br />
              <Html html={c.disc.evidencia} className="text-muted-foreground" /><br />
              <b>Como falar:</b> <Html html={c.disc.dica} />
            </div>
          </div>
          <ul className="my-1.5 list-disc space-y-0.5 pl-[18px]">
            {c.ctx.map((linha, i) => <li key={i}><Html html={linha} /></li>)}
          </ul>
          {c.q && <div className="my-2 rounded-lg border-l-[3px] border-border bg-muted/70 px-2.5 py-2 text-[13px]"><Html html={c.q} /></div>}
          {itens.length > 0 && (
            // Checklist: responder por partes, na ordem de envio.
            <div className="mt-2">
              <div className="text-[13px] font-semibold text-muted-foreground">Responder por partes</div>
              {itens.map((item, n) => {
                const marcado = itemFeito(item.id);
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "relative mt-2 rounded-lg p-2.5 pr-20 text-[13px]",
                      marcado ? "bg-muted/40 opacity-60" : "bg-muted/70",
                      item.id === proximoItem && "ring-1 ring-green-600/60",
                    )}
                  >
                    <label className="mb-1 flex cursor-pointer items-center gap-2 text-xs font-semibold">
                      <input type="checkbox" checked={marcado} onChange={(e) => onMarcarItem(item.id, e.target.checked)} className="h-4 w-4 shrink-0 cursor-pointer accent-green-600" />
                      <span className={cn(marcado && "line-through")}>{n + 1}. {item.titulo}</span>
                      <span className="font-normal text-muted-foreground">~{item.tempo} min</span>
                      {item.opcional && <span className="rounded-full bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">opcional</span>}
                    </label>
                    <BotaoCopiar texto={item.texto} />
                    {!marcado && <div className="whitespace-pre-wrap"><Html html={item.texto} /></div>}
                  </div>
                );
              })}
            </div>
          )}
          <details open={!itens.length} className="mt-2">
            <summary className="cursor-pointer text-[13px] font-semibold text-muted-foreground">{itens.length ? "Ou tudo numa mensagem só" : "Sugestões de resposta"}</summary>
            {c.opcoes.map((o, i) => (
              <div key={i} className="relative mt-2 whitespace-pre-wrap rounded-lg bg-muted/70 p-2.5 pr-20 text-[13px]">
                <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{o.titulo}</h4>
                {o.sanduiche && <div className="mb-1.5 text-[11px] text-muted-foreground">{o.sanduiche}</div>}
                <BotaoCopiar texto={o.texto} />
                <Html html={o.texto} />
              </div>
            ))}
          </details>
          {c.nota && <Nota><Html html={c.nota} /></Nota>}
        </>
      )}
    </div>
  );
}

function AbaDesempenho({ h, m }: { h: Historico; m: Metricas }) {
  const c = h.config;
  const [h0, h1] = c.horario_util;
  const pctMeta = m.tempos.length ? m.dentroDaMeta / m.tempos.length : 0;
  const maxDia = Math.max(1, ...m.ritmo.map((d) => Math.max(d.recebidas, d.respondidas)));
  const itens: [keyof Historico["avaliacoes"][number], string][] = [["acolheu", "Acolheu / pontuou"], ["solucao", "Trouxe solução"], ["proximos", "Deixou próximo passo"], ["junto", "“Estou junto”"], ["disc_ok", "Tom certo pro DISC"]];
  const nomes = Object.fromEntries(h.mentorados.map((x) => [x.id, x.nome]));
  return (
    <section>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Kpi valor={formatarMinutos(mediana(m.tempos))} rotulo="tempo típico de resposta (mediana, úteis)" />
        <Kpi valor={`${Math.round(100 * pctMeta)}%`} tom={pctMeta >= 0.8 ? "ok" : pctMeta >= 0.5 ? "alta" : "urg"} rotulo={`dentro da meta de ${c.meta_resposta_horas_uteis}h úteis`} />
        <Kpi valor={m.pendentes.length} tom={m.pendentes.some((p) => p.min > m.meta) ? "urg" : "ok"} rotulo="esperando você agora" />
      </div>

      <Titulo>Ritmo por dia</Titulo>
      <div className="grid grid-cols-7 items-start gap-1.5">
        {m.ritmo.map((d) => (
          <div key={d.dia} className="text-center text-[11px] text-muted-foreground">
            <div className={cn(d.dia === m.hoje && "font-bold text-foreground")}>{d.rotulo}</div>
            <div className="my-1 flex h-[70px] items-end justify-center gap-[3px] rounded-md bg-muted/70 py-1">
              <span className="min-h-[2px] w-[30%] rounded-t-sm bg-border" style={{ height: `${(d.recebidas / maxDia) * 100}%` }} title={`${d.recebidas} recebidas`} />
              <span className="min-h-[2px] w-[30%] rounded-t-sm bg-green-600" style={{ height: `${(d.respondidas / maxDia) * 100}%` }} title={`${d.respondidas} respondidas`} />
            </div>
            <div><b className="text-foreground">{d.respondidas}</b>/{d.recebidas}</div>
            <div className="min-h-[14px] text-[10px]">{d.tempoMedio == null ? "" : formatarMinutos(d.tempoMedio)}</div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-2.5 text-[11px] text-muted-foreground">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-border align-[-1px]" />recebidas</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-green-600 align-[-1px]" />respondidas por você</span>
      </div>
      <Nota>Cada “interação” é um bloco de mensagens de um mentorado (ex.: 7 headlines seguidas contam 1).</Nota>

      <Titulo>Tempo de resposta por mentorado</Titulo>
      {m.porMentorado.map((x) => {
        const v = media(x.tempos) ?? 0;
        return (
          <div key={x.mentorado.id} className="mb-1.5 grid grid-cols-[minmax(0,38%)_1fr_52px] items-center gap-2 text-xs">
            <span className="truncate">{x.mentorado.nome}</span>
            <span className="relative h-2 rounded-full bg-muted">
              <i className={cn("block h-full rounded-full", BARRA[m.cor(v)])} style={{ width: `${Math.max(Math.min(100, (v / (m.meta * 3)) * 100), 2)}%` }} />
              <em className="absolute -bottom-[3px] -top-[3px] w-0.5 bg-foreground/50" style={{ left: `${100 / 3}%` }} />
            </span>
            <span className="text-right tabular-nums">{formatarMinutos(v)}</span>
          </div>
        );
      })}
      <Nota>A linha vertical marca a meta ({c.meta_resposta_horas_uteis}h úteis). Conta só seg a sex, das {h0}h às {h1}h.</Nota>

      <Titulo>Qualidade das respostas ({m.avaliacoes.length} avaliadas)</Titulo>
      {[...itens.map(([k, l]) => [l, m.pct(k)] as [string, number]), ["Reação positiva depois", m.reacaoPositiva] as [string, number]].map(([l, p]) => (
        <div key={l} className="mb-1.5 grid grid-cols-[minmax(0,38%)_1fr_52px] items-center gap-2 text-xs">
          <span>{l}</span>
          <span className="h-2 rounded-full bg-muted"><i className={cn("block h-full rounded-full", p >= 80 ? BARRA.ok : p >= 60 ? BARRA.alta : BARRA.urg)} style={{ width: `${p}%` }} /></span>
          <b className="text-right tabular-nums">{p}%</b>
        </div>
      ))}
      <details className="mt-2.5">
        <summary className="cursor-pointer text-[13px] font-semibold text-muted-foreground">Ver respostas avaliadas</summary>
        {[...m.avaliacoes].reverse().map((a, i) => (
          <div key={i} className="mt-2 rounded-lg border border-border bg-card px-2.5 py-2 text-xs">
            <div><b>{nomes[a.mentorado]}</b> · {dataCurta(a.data)} · {a.resumo}</div>
            <div className="my-1 flex flex-wrap gap-1">
              {([["acolheu", "acolheu"], ["solucao", "solução"], ["proximos", "próximo passo"], ["junto", "junto"], ["disc_ok", "DISC"]] as [keyof typeof a, string][]).map(([k, l]) => (
                <span key={k} className={cn("rounded-full px-1.5 text-[11px]", a[k] ? TOM.ok : TOM.urg)}>{a[k] ? "✓" : "✗"} {l}</span>
              ))}
            </div>
            {a.obs && <div className="text-muted-foreground">{a.obs}</div>}
          </div>
        ))}
      </details>
      <Nota>Avaliação feita pelo Claude a partir das transcrições: é uma leitura, não uma nota absoluta.</Nota>
    </section>
  );
}

function AbaSaude({ h, m }: { h: Historico; m: Metricas }) {
  const c = h.config;
  const nUp = (k: string) => h.mentorados.filter((x) => x.upgrade?.nivel === k).length;
  return (
    <section>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Kpi valor={`${h.mentorados.filter((x) => x.satisfacao.at(-1)?.nivel === 3).length}/${h.mentorados.length}`} rotulo="satisfeitos 😊" />
        <Kpi valor={m.saude.filter((x) => (x.silencio ?? 0) >= c.silencio_alerta_dias).length} tom="urg" rotulo={`em silêncio há ${c.silencio_alerta_dias}+ dias`} />
        <Kpi valor={nUp("alto")} tom="ok" rotulo="com potencial alto de upgrade" />
      </div>
      {m.saude.map(({ mentorado: x, ult, ant, silencio, tempos }) => {
        const tom = silencio == null ? "" : silencio >= c.silencio_critico_dias ? "urg" : silencio >= c.silencio_alerta_dias ? "alta" : "ok";
        const [upRotulo, upTom] = UPGRADE[x.upgrade?.nivel] ?? ["—", "cinza"];
        const mediaResp = media(tempos);
        return (
          <div key={x.id} className="mb-2.5 rounded-xl border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-[15px] font-semibold"><Disc letra={x.disc} mini /> {x.nome}</div>
                <div className="text-[11px] text-muted-foreground">{x.grupo}</div>
              </div>
              <span className="text-[22px] leading-none" title="satisfação">{EMOJI_SATISFACAO[ult?.nivel] ?? "❔"}</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <span><small className="block text-[10px] text-muted-foreground">Satisfação</small>{EMOJI_SATISFACAO[ult?.nivel] ?? "❔"}{" "}
                {ant && (ult.nivel > ant.nivel ? <span className={TEXTO.ok}>↗ melhorando</span> : ult.nivel < ant.nivel ? <span className={TEXTO.urg}>↘ piorando</span> : "→ estável")}
              </span>
              <span><small className="block text-[10px] text-muted-foreground">Silêncio deles</small><b className={TEXTO[tom]}>{silencio == null ? "—" : silencio === 0 ? "hoje" : `${silencio} ${silencio === 1 ? "dia" : "dias"}`}</b></span>
              <span><small className="block text-[10px] text-muted-foreground">Sua resposta (média)</small><b className={mediaResp != null ? TEXTO[m.cor(mediaResp)] : ""}>{formatarMinutos(mediaResp)}</b></span>
              <span><small className="block text-[10px] text-muted-foreground">Upgrade</small><Tag tom={upTom}>{upRotulo}</Tag></span>
            </div>
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[13px] font-semibold text-muted-foreground">Por quê</summary>
              <div className="mt-1 text-xs text-muted-foreground"><b>Satisfação:</b> {ult?.evidencia}{ant && <><br /><b>Antes:</b> {EMOJI_SATISFACAO[ant.nivel]} {ant.evidencia}</>}</div>
              <div className="mt-1 text-xs text-muted-foreground"><b>Upgrade:</b> {(x.upgrade?.sinais || []).join(" · ")}</div>
            </details>
          </div>
        );
      })}
      <Nota>Satisfação e upgrade são leituras do Claude a partir das mensagens, sempre com a evidência. Antes de oferecer upgrade, combine com o comercial.</Nota>
    </section>
  );
}

function AbaCompromissos({ h, m, agora }: { h: Historico; m: Metricas; agora: Date }) {
  const nomes = Object.fromEntries(h.mentorados.map((x) => [x.id, x.nome]));
  return (
    <section>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Kpi valor={m.promessas.length} rotulo="promessas em aberto" />
        <Kpi valor={m.atrasadas.length} tom={m.atrasadas.length ? "urg" : "ok"} rotulo="atrasadas" />
        <Kpi valor={m.agenda.length} rotulo="na agenda" />
      </div>
      <Titulo>O que você prometeu</Titulo>
      {m.promessas.map((p, i) => {
        const atrasada = m.promessaAtrasada(p);
        const d = diasDesde(p.desde, agora) ?? 0;
        return (
          <div key={i} className={cn("mb-2 rounded-lg border bg-card px-3 py-2.5 text-[13px]", atrasada ? "border-orange-600" : "border-border")}>
            <div><b>{nomes[p.mentorado] ?? p.mentorado}</b> · {p.o_que}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              prometido {d === 0 ? "hoje" : `há ${d} ${d === 1 ? "dia" : "dias"}`} · prazo {dataCurta(p.prazo)} {atrasada && <Tag tom="urg">atrasada</Tag>}
            </div>
          </div>
        );
      })}
      {!m.promessas.length && <Nota>Nenhuma promessa em aberto.</Nota>}
      <Titulo>Agenda</Titulo>
      {m.agenda.map((a, i) => (
        <div key={i} className="mb-2 rounded-lg border border-border bg-card px-3 py-2.5 text-[13px]"><b>{dataCurta(a.data)}</b> · {a.o_que}</div>
      ))}
      <Nota>Cada vez que o Claude ler o WhatsApp, registra aqui o que você prometeu em áudio ou texto.</Nota>
    </section>
  );
}
