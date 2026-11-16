import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MarkerType, Position, applyNodeChanges, getSmoothStepPath, type EdgeProps, type Connection, type Edge, type Node, type NodeChange, type NodeProps, type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { AlertTriangle, BookOpen, Check, Clock, FileText, GitBranch, ImageIcon, Link2, Loader2, MessageCircle, MessageSquareText, Plus, Power, Send, Tag, Trash2, Upload, X, Zap, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { GATILHOS } from "@/lib/automacoes/instagram";
import { cn } from "@/lib/utils";
import {
  LIMITE_TITULO_BOTAO, MAX_BOTOES_LINK, MAX_RESPOSTAS, VARIAVEIS_MENSAGEM, grafoVazio, problemasDoFluxo, saidasDoNo,
  type Botao, type GrafoFluxo, type NoFluxo, type TipoNo,
} from "../../../supabase/functions/_shared/fluxo";
import type { FluxoInstagram, NumerosDoNo } from "@/hooks/useInstagramFluxos";
import { buscarPostsInstagram, type InstagramPost } from "@/hooks/useInstagramAutomacoes";

// Editor de fluxo de mensagens do Instagram (13/11/2026, Davi: "automações igual ao dash do ManyChat").
// Blocos ligados por setas, da esquerda para a direita: início → mensagem (com botões) → esperar → condição → fim.
// Cada saída de um bloco (botão de resposta, "sim/não", "depois do tempo") tem o seu ponto de ligação.

type Dados = { no: NoFluxo; selecionado: boolean; problemas: string[]; numeros?: NumerosDoNo; gatilhoTexto?: string };
const VISUAL: Record<TipoNo, { nome: string; Icone: LucideIcon; cor: string }> = {
  inicio: { nome: "Gatilho", Icone: Zap, cor: "border-amber-300/70 bg-amber-300/10 text-amber-100" },
  mensagem: { nome: "Mensagem", Icone: MessageCircle, cor: "border-cyan-300/60 bg-cyan-300/10 text-cyan-100" },
  midia: { nome: "Mídia", Icone: ImageIcon, cor: "border-sky-300/60 bg-sky-300/10 text-sky-100" },
  tag: { nome: "Tag", Icone: Tag, cor: "border-pink-300/60 bg-pink-300/10 text-pink-100" },
  esperar: { nome: "Esperar", Icone: Clock, cor: "border-violet-300/60 bg-violet-300/10 text-violet-100" },
  condicao: { nome: "Condição", Icone: GitBranch, cor: "border-emerald-300/60 bg-emerald-300/10 text-emerald-100" },
  fim: { nome: "Fim", Icone: Power, cor: "border-rose-300/60 bg-rose-300/10 text-rose-100" },
};

// Gatilhos (15/11, Davi: "preciso conseguir selecionar o gatilho que eu quero, pode copiar do ManyChat"): cartões como no ManyChat. Os três primeiros o robô já atende;
// os outros aparecem como "em breve" (a Meta ainda não entrega ou o robô ainda não trata).
const TIPOS_GATILHO: { valor: "comentario" | "story" | "dm"; titulo: string; descricao: string; Icone: LucideIcon }[] = [
  { valor: "comentario", titulo: "Comentário em post ou reel", descricao: "Alguém comenta uma palavra-chave no seu post ou reel. O fluxo abre a conversa no direct.", Icone: MessageSquareText },
  { valor: "story", titulo: "Resposta a um story", descricao: "Alguém responde ao seu story com uma palavra-chave.", Icone: BookOpen },
  { valor: "dm", titulo: "Mensagem direta (DM)", descricao: "Alguém manda a palavra-chave por direct para a conta.", Icone: Send },
];
// Gatilhos de negócio do WhatsApp (15/11, Davi: "a pessoa virou lead e não comprou → X; a pessoa comprou → Y"): o robô olha os leads sozinho.
export type GatilhoWa = { tipo: "manual" | "virou_lead" | "lead_sem_compra" | "checkout_sem_compra" | "comprou" | "tag"; espera_min: number; quiz_id: string | null; tag?: string | null };
export const TIPOS_GATILHO_WA: { valor: GatilhoWa["tipo"]; titulo: string; descricao: string; espera: string | null }[] = [
  { valor: "manual", titulo: "Eu inicio pelo chat", descricao: "Você clica em “Iniciar fluxo” no chat de um lead.", espera: null },
  { valor: "virou_lead", titulo: "A pessoa virou lead", descricao: "Terminou o quiz e deixou o WhatsApp.", espera: "Depois de" },
  { valor: "lead_sem_compra", titulo: "Virou lead e não comprou", descricao: "Passou o tempo escolhido desde que virou lead e ainda não comprou. Se comprar no meio do fluxo, ele para.", espera: "Se não comprar em" },
  { valor: "checkout_sem_compra", titulo: "Foi ao checkout e não comprou", descricao: "Clicou no botão de compra, passou o tempo escolhido e não comprou. Se comprar no meio do fluxo, ele para.", espera: "Se não comprar em" },
  { valor: "comprou", titulo: "A pessoa comprou", descricao: "Uma venda com o e-mail do lead entrou (sem reembolso). Bom para agradecer e dar as boas-vindas.", espera: "Depois de" },
  { valor: "tag", titulo: "Tem a tag…", descricao: "Toda pessoa que tem a tag escolhida entra no fluxo, inclusive quem já está na sua base. Cada pessoa entra uma vez só.", espera: null },
];
const GATILHOS_EM_BREVE = ["Menção no story", "Comentário na live", "Clique em anúncio para o direct", "Link do Instagram (ig.me)"];

const resumo = (no: NoFluxo) => {
  if (no.tipo === "mensagem") return (no.dados.texto ?? "").trim() || "Toque para escrever a mensagem";
  if (no.tipo === "midia") return no.dados.midia_url ? `${{ imagem: "Foto", audio: "Áudio", video: "Vídeo", arquivo: "Arquivo" }[no.dados.midia_tipo ?? "arquivo"]}${no.dados.midia_nome ? ` · ${no.dados.midia_nome}` : ""}${(no.dados.texto ?? "").trim() ? `\n${(no.dados.texto ?? "").trim()}` : ""}` : "Toque para escolher a foto, o áudio, o vídeo ou o arquivo";
  if (no.tipo === "tag") return no.dados.tag_nome ? `${no.dados.tag_acao === "remover" ? "Tirar" : "Pôr"} a tag “${no.dados.tag_nome}”` : "Toque para escolher a tag";
  if (no.tipo === "esperar") { const m = no.dados.minutos ?? 0; return m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`; }
  if (no.tipo === "condicao") return no.dados.condicao === "texto_contem" ? `Resposta contém “${no.dados.palavra ?? ""}”` : "A pessoa respondeu?";
  if (no.tipo === "inicio") return "Quando a palavra chegar";
  return "O fluxo termina aqui";
};

function BlocoFluxo({ data }: NodeProps<Dados>) {
  const { no } = data;
  const v = VISUAL[no.tipo];
  const saidas = saidasDoNo(no);
  const botoes = no.tipo === "mensagem" ? (no.dados.botoes ?? []) : [];
  return (
    <div className={cn("relative w-[280px] rounded-2xl border bg-[#0b1220] text-white shadow-lg transition-shadow", data.selecionado ? "border-cyan-300 shadow-[0_0_0_2px_rgba(103,232,249,0.45),0_0_26px_rgba(34,211,238,0.35)]" : "border-white/15")}>
      {no.tipo !== "inicio" && <Handle type="target" position={Position.Left} className="!h-3.5 !w-3.5 !border-2 !border-[#0b1220] !bg-cyan-300" />}
      <div className={cn("flex items-center gap-2 rounded-t-2xl border-b px-3 py-2 text-xs font-semibold", v.cor)}><v.Icone className="h-4 w-4" />{v.nome}
        {data.problemas.length > 0 && <span title={data.problemas.join("\n")} className="ml-auto text-amber-300"><AlertTriangle className="h-4 w-4" /></span>}
        {data.numeros && no.tipo === "mensagem" && <span className="ml-auto text-[10px] font-normal text-white/60" title="Enviadas · respostas">{data.numeros.enviadas} env · {data.numeros.respostas} resp</span>}
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <p className={cn("line-clamp-4 whitespace-pre-wrap text-[13px] leading-snug", no.tipo === "mensagem" && !(no.dados.texto ?? "").trim() && "text-white/40")}>{no.tipo === "inicio" && data.gatilhoTexto ? data.gatilhoTexto : resumo(no)}</p>
        {no.tipo === "midia" && no.dados.midia_tipo === "imagem" && no.dados.midia_url && <img src={no.dados.midia_url} alt="" className="max-h-32 w-full rounded-lg object-cover" loading="lazy" />}
        {botoes.length > 0 && no.tipo === "mensagem" && (
          <div className="space-y-1">{botoes.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">{b.tipo === "link" && <Link2 className="h-3 w-3 shrink-0 text-cyan-300" />}<span className="truncate">{b.titulo || "Botão"}</span></span>
              {b.tipo === "resposta" && <span className="relative h-0 w-0"><Handle id={b.id} type="source" position={Position.Right} className="!right-[-20px] !h-3.5 !w-3.5 !border-2 !border-[#0b1220] !bg-cyan-300" /></span>}
            </div>))}
          </div>)}
      </div>
      {/* Números do bloco, como no ManyChat: enviadas, abertas (visto) e respostas, com a porcentagem. */}
      {data.numeros && (no.tipo === "mensagem" || no.tipo === "midia") && data.numeros.enviadas > 0 && (() => {
        const n = data.numeros, pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
        const col = (rot: string, v: string, sub: string, dica: string) => (
          <div className="px-1 py-1.5" title={dica}><p className="text-[13px] font-semibold text-white">{v}</p><p className="text-white/50">{rot}</p><p className="text-white/35">{sub}</p></div>);
        return (
          <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 text-center text-[10px]">
            {col("Enviadas", String(n.enviadas), "pessoas", "Quantas vezes esta mensagem foi enviada")}
            {col("Abertas", n.rastreadas ? pct(n.abertas, n.rastreadas) : "—", n.rastreadas ? `${n.abertas} de ${n.rastreadas}` : "só novas", "Abriu a conversa (visto da Meta) ou respondeu depois. Conta só as mensagens enviadas a partir de 15/11.")}
            {col("Respostas", pct(n.respostas, n.enviadas), `${n.respostas} de ${n.enviadas}`, "Tocaram num botão ou responderam esta mensagem")}
          </div>);
      })()}
      {/* Onde a pessoa fica ou sai (WhatsApp): chegaram ao bloco, estão parados nele agora, pararam ali (você parou ou deu erro). */}
      {data.numeros && no.tipo !== "inicio" && (data.numeros.chegaram ?? 0) > 0 && (
        <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 text-center text-[10px]" title="Chegaram: entraram neste bloco. Aqui agora: estão parados nele. Pararam: o fluxo terminou neste bloco por erro ou porque foi parado.">
          <div className="px-1 py-1"><p className="text-[13px] font-semibold text-white">{data.numeros.chegaram}</p><p className="text-white/50">Chegaram</p></div>
          <div className="px-1 py-1"><p className="text-[13px] font-semibold text-cyan-200">{data.numeros.aqui ?? 0}</p><p className="text-white/50">Aqui agora</p></div>
          <div className="px-1 py-1"><p className={cn("text-[13px] font-semibold", (data.numeros.saiu ?? 0) > 0 ? "text-rose-300" : "text-white")}>{data.numeros.saiu ?? 0}</p><p className="text-white/50">Pararam</p></div>
        </div>)}
      {/* saídas que não são botões da própria mensagem (próximo, sim/não, outra resposta) */}
      {saidas.filter((s) => !botoes.some((b) => b.id === s.id)).map((s) => (
        <div key={s.id} className="relative flex items-center justify-end border-t border-white/10 px-3 py-1.5 text-[11px] text-white/60">
          {s.rotulo || "Depois"}
          <Handle id={s.id} type="source" position={Position.Right} className="!h-3.5 !w-3.5 !border-2 !border-[#0b1220] !bg-fuchsia-300" />
        </div>))}
    </div>
  );
}
const tipos = { bloco: BlocoFluxo };
// Seta com um × no meio (16/11, Davi: "conecto algo e não consigo mais desconectar"): um clique desliga os dois blocos (antes só dava para apagar com a tecla Delete).
function SetaDesligavel({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps<{ aoDesligar?: () => void }>) {
  const [caminho, lx, ly] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={caminho} markerEnd={markerEnd} style={style} interactionWidth={24} />
      <EdgeLabelRenderer>
        <button type="button" title="Desligar estes dois blocos" onClick={(e) => { e.stopPropagation(); data?.aoDesligar?.(); }}
          className="nodrag nopan absolute grid h-5 w-5 place-items-center rounded-full border border-white/30 bg-[#0b1220] text-white/60 shadow hover:scale-110 hover:border-rose-300 hover:bg-rose-500 hover:text-white"
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, pointerEvents: "all" }}><X className="h-3 w-3" /></button>
      </EdgeLabelRenderer>
    </>
  );
}
const tiposSeta = { desligavel: SetaDesligavel };
/** Texto da mensagem: digitar "/" abre a lista de dados da pessoa (nome, @, e-mail…) e insere {chave} no cursor. */
function TextoComVariaveis({ valor, aoMudar, whatsapp, ...resto }: { valor: string; aoMudar: (v: string) => void; whatsapp: boolean } & Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<{ ini: number; filtro: string } | null>(null);
  const [ativa, setAtiva] = useState(0);
  const lista = useMemo(() => VARIAVEIS_MENSAGEM.filter((v) => !v.so || v.so === (whatsapp ? "whatsapp" : "instagram")).filter((v) => !menu || (v.chave + " " + v.rotulo).toLowerCase().includes(menu.filtro.toLowerCase())), [whatsapp, menu]);
  const detectar = (texto: string, cursor: number) => {
    const m = /(?:^|\s)\/([\wà-ú]*)$/i.exec(texto.slice(0, cursor));
    if (m) { setMenu({ ini: cursor - m[1].length - 1, filtro: m[1] }); setAtiva(0); } else setMenu(null);
  };
  const inserir = (chave: string) => {
    if (!menu || !ref.current) return;
    const cursor = ref.current.selectionStart;
    const novo = valor.slice(0, menu.ini) + `{${chave}}` + valor.slice(cursor);
    aoMudar(novo);
    setMenu(null);
    const pos = menu.ini + chave.length + 2;
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(pos, pos); });
  };
  return (
    <div className="relative">
      <Textarea {...resto} ref={ref} value={valor}
        onChange={(e) => { aoMudar(e.target.value); detectar(e.target.value, e.target.selectionStart); }}
        onKeyDown={(e) => {
          if (!menu || lista.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setAtiva((a) => (a + 1) % lista.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAtiva((a) => (a - 1 + lista.length) % lista.length); }
          else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); inserir(lista[ativa].chave); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMenu(null); }
        }}
        onBlur={() => setTimeout(() => setMenu(null), 150)} />
      {menu && lista.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-white/15 bg-zinc-900 shadow-xl">
          <p className="border-b border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-wide text-white/40">Dados da pessoa</p>
          {lista.map((v, i) => (
            <button key={v.chave} type="button" onMouseDown={(e) => { e.preventDefault(); inserir(v.chave); }} onMouseEnter={() => setAtiva(i)}
              className={cn("flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs", i === ativa ? "bg-cyan-300/15 text-cyan-100" : "text-white/75")}>
              <span>{v.rotulo}</span><span className="text-white/40">ex.: {v.exemplo}</span>
            </button>))}
        </div>)}
      <p className="mt-1 text-[10px] text-white/35">Digite <b>/</b> para inserir o nome da pessoa e outros dados.</p>
    </div>);
}

const novoId = () => `n${Math.random().toString(36).slice(2, 8)}`;

export type RascunhoFluxo = Partial<Omit<FluxoInstagram, "id" | "ig_user_id" | "disparos" | "user_id">>;

export function FluxoEditor({ aberto, fluxo, inicial, contaNome, numeros: numerosTudo, numerosDoPeriodo, onFechar, onSalvar, painelEsquerda, whatsapp = false, igUserId, gatilhoWaInicial, quizzesWa = [], tagsWa = [] }: {
  painelEsquerda?: React.ReactNode;   // coluna à esquerda (WhatsApp: leads a receber / no fluxo)
  numerosDoPeriodo?: (desde: number | null, ate: number | null) => Record<string, NumerosDoNo>;   // números dos blocos numa janela de dias
  gatilhoWaInicial?: GatilhoWa; quizzesWa?: { id: string; titulo: string }[]; tagsWa?: string[];   // só no WhatsApp
  igUserId?: string;   // para escolher posts específicos no gatilho de comentário
  whatsapp?: boolean;   // 15/11: o mesmo editor serve aos fluxos do WhatsApp (sem palavra-chave nem regras da Meta)
  aberto: boolean; fluxo: FluxoInstagram | null; inicial?: RascunhoFluxo | null; contaNome: string; numeros: Record<string, NumerosDoNo>;
  onFechar: () => void; onSalvar: (f: Omit<FluxoInstagram, "id" | "ig_user_id" | "disparos" | "user_id"> & { gatilho_wa?: GatilhoWa }, id?: string) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [gatilhos, setGatilhos] = useState<string[]>(["comentario"]);
  const [palavras, setPalavras] = useState("");
  const [modoPalavra, setModoPalavra] = useState<"contem" | "trecho" | "exata">("contem");
  const [respostas, setRespostas] = useState("");
  // Números por dia (16/11, Davi: "preciso filtrar por dia para conferir os dias"): os blocos mostram só o que aconteceu na janela escolhida.
  const [periodo, setPeriodo] = useState<"tudo" | "hoje" | "ontem" | "7" | "14" | "30" | "dia">("tudo");
  const [dia, setDia] = useState("");
  const janela = useMemo(() => {
    const ini = new Date(); ini.setHours(0, 0, 0, 0);
    const d = (n: number) => ini.getTime() - n * 86_400_000;
    if (periodo === "hoje") return [ini.getTime(), null] as const;
    if (periodo === "ontem") return [d(1), ini.getTime()] as const;
    if (periodo === "7" || periodo === "14" || periodo === "30") return [d(Number(periodo) - 1), null] as const;
    if (periodo === "dia" && dia) { const a = new Date(`${dia}T00:00:00`).getTime(); return [a, a + 86_400_000] as const; }
    return [null, null] as const;
  }, [periodo, dia]);
  const numeros = useMemo(() => (numerosDoPeriodo ? numerosDoPeriodo(janela[0], janela[1]) : numerosTudo), [numerosDoPeriodo, numerosTudo, janela]);
  const [gatilhoWa, setGatilhoWa] = useState<GatilhoWa>({ tipo: "manual", espera_min: 0, quiz_id: null });
  const [mediaIds, setMediaIds] = useState<string[] | null>(null);   // null = todos os posts e reels
  const [posts, setPosts] = useState<InstagramPost[] | null>(null);
  const [carregandoPosts, setCarregandoPosts] = useState(false);
  const [erroPosts, setErroPosts] = useState<string | null>(null);
  const [grafo, setGrafo] = useState<GrafoFluxo>(grafoVazio());
  const [sel, setSel] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const instancia = useRef<ReactFlowInstance | null>(null);

  // O que você escreve não se perde (16/11, Davi: "o que eu deixar escrito, mesmo que eu não salve, não pode mudar; eu tinha configurado e do nada sumiu"):
  // (1) a tela só recomeça quando abre OU troca de fluxo (antes, qualquer atualização da página por trás refazia tudo e apagava a configuração);
  // (2) o que ainda não foi salvo fica guardado como rascunho neste Mac e volta quando você reabrir o fluxo.
  const propsRef = useRef({ fluxo, inicial, gatilhoWaInicial });
  propsRef.current = { fluxo, inicial, gatilhoWaInicial };
  const chaveRascunho = `fluxo-rascunho:${whatsapp ? "wa" : "ig"}:${fluxo?.id ?? "novo"}`;
  const baseJson = useRef("");
  const [temRascunho, setTemRascunho] = useState(false);
  const carregarBase = useCallback((usarRascunho: boolean) => {
    const { fluxo: fl, inicial: ini, gatilhoWaInicial: gwa } = propsRef.current;
    const base: RascunhoFluxo = fl ?? ini ?? {};
    const estado = {
      nome: base.nome ?? "Nova automação", ativo: fl?.ativo ?? false, mediaIds: base.media_ids?.length ? base.media_ids : null,
      gatilhoWa: gwa ?? { tipo: "manual" as const, espera_min: 0, quiz_id: null }, gatilhos: base.gatilhos ?? ["comentario"], palavras: (base.palavras_chave ?? []).join(", "),
      modoPalavra: (base.correspondencia === "exata" || base.correspondencia === "trecho" ? base.correspondencia : "contem") as "contem" | "trecho" | "exata", respostas: (base.respostas_comentario ?? []).join("\n"),
      // Automação nova já nasce com o gatilho ligado a uma primeira mensagem (como o ManyChat): é só escrever.
      grafo: base.grafo?.nos?.length ? base.grafo : { nos: [{ id: "inicio", tipo: "inicio" as const, x: 0, y: 0, dados: {} }, { id: "m1", tipo: "mensagem" as const, x: 360, y: 0, dados: { texto: "" } }], ligacoes: [{ de: "inicio", saida: "proximo", para: "m1" }] },
    };
    baseJson.current = JSON.stringify(estado);
    let usado = estado;
    let achou = false;
    if (usarRascunho) {
      try { const r = localStorage.getItem(chaveRascunho); if (r) { usado = { ...estado, ...JSON.parse(r) }; achou = true; } } catch { /* sem rascunho */ }
    } else { try { localStorage.removeItem(chaveRascunho); } catch { /* sem storage */ } }
    setNome(usado.nome); setAtivo(usado.ativo); setMediaIds(usado.mediaIds); setGatilhoWa(usado.gatilhoWa); setGatilhos(usado.gatilhos); setPalavras(usado.palavras);
    setModoPalavra(usado.modoPalavra); setRespostas(usado.respostas); setGrafo(usado.grafo);
    setSel(fl || ini?.grafo || achou ? null : "m1");
    setTemRascunho(achou);
    if (achou) toast.info("Voltei com o que você tinha escrito e não salvou. “Descartar alterações” volta ao salvo.", { duration: 6000 });
  }, [chaveRascunho]);
  const carregadoPara = useRef("");
  useEffect(() => {
    if (!aberto) { carregadoPara.current = ""; return; }
    if (carregadoPara.current === chaveRascunho) return;   // a página por trás atualizou: não mexe no que está na tela
    carregadoPara.current = chaveRascunho;
    carregarBase(true);
  }, [aberto, chaveRascunho, carregarBase]);
  // Guarda o rascunho enquanto você mexe (só se for diferente do salvo).
  useEffect(() => {
    if (!aberto || carregadoPara.current !== chaveRascunho) return;
    const t = window.setTimeout(() => {
      const atual = JSON.stringify({ nome, ativo, mediaIds, gatilhoWa, gatilhos, palavras, modoPalavra, respostas, grafo });
      try {
        if (atual === baseJson.current) { localStorage.removeItem(chaveRascunho); setTemRascunho(false); }
        else { localStorage.setItem(chaveRascunho, atual); setTemRascunho(true); }
      } catch { /* sem storage */ }
    }, 400);
    return () => window.clearTimeout(t);
  }, [aberto, chaveRascunho, nome, ativo, mediaIds, gatilhoWa, gatilhos, palavras, modoPalavra, respostas, grafo]);

  useEffect(() => { setPosts(null); }, [igUserId]);
  useEffect(() => {
    if (!aberto || whatsapp || !igUserId || mediaIds === null || !gatilhos.includes("comentario") || posts || carregandoPosts) return;
    setCarregandoPosts(true); setErroPosts(null);
    buscarPostsInstagram(igUserId).then(setPosts).catch((e) => setErroPosts(e instanceof Error ? e.message : "Não deu para buscar os posts.")).finally(() => setCarregandoPosts(false));
  }, [aberto, whatsapp, igUserId, mediaIds, gatilhos, posts, carregandoPosts]);
  const problemas = useMemo(() => problemasDoFluxo(grafo, { whatsapp }), [grafo, whatsapp]);
  const porNo = useMemo(() => { const m = new Map<string, string[]>(); for (const p of problemas) if (p.no) m.set(p.no, [...(m.get(p.no) ?? []), p.texto]); return m; }, [problemas]);
  const palavrasLista = useMemo(() => palavras.split(/[,\n]/).map((p) => p.trim()).filter(Boolean), [palavras]);

  const textoGatilho = useMemo(() => {
    if (whatsapp) {
      const t = TIPOS_GATILHO_WA.find((x) => x.valor === gatilhoWa.tipo)!;
      if (t.valor === "manual") return "Quando você clicar em Iniciar fluxo no chat do lead";
      if (t.valor === "tag") return `Quem tem a tag “${gatilhoWa.tag ?? ""}”`;
      const m = gatilhoWa.espera_min, esp = !m ? "na hora" : m % 1440 === 0 ? `${m / 1440} dia${m / 1440 === 1 ? "" : "s"}` : m % 60 === 0 ? `${m / 60} h` : `${m} min`;
      return `${t.titulo}\n${t.espera ? `${t.espera}: ${esp}` : ""}`;
    }
    const tipos = TIPOS_GATILHO.filter((t) => gatilhos.includes(t.valor)).map((t) => t.titulo);
    const palavra = palavrasLista.length ? `palavra: ${palavrasLista.slice(0, 3).join(", ")}${palavrasLista.length > 3 ? "…" : ""}` : "sem palavra ainda";
    const post = gatilhos.includes("comentario") ? (mediaIds === null ? "todos os posts" : `${mediaIds.length} post${mediaIds.length === 1 ? "" : "s"}`) : "";
    return [tipos.join(" · ") || "Escolha o gatilho", palavra, post].filter(Boolean).join("\n");
  }, [whatsapp, gatilhoWa, gatilhos, palavrasLista, mediaIds]);
  const nodes = useMemo<Node<Dados>[]>(() => grafo.nos.map((n) => ({
    id: n.id, type: "bloco", position: { x: n.x, y: n.y }, draggable: true, deletable: n.tipo !== "inicio",
    data: { no: n, selecionado: n.id === sel, problemas: porNo.get(n.id) ?? [], numeros: numeros[n.id], gatilhoTexto: n.tipo === "inicio" ? textoGatilho : undefined },
  })), [grafo.nos, sel, porNo, numeros, textoGatilho]);
  const edges = useMemo<Edge[]>(() => grafo.ligacoes.map((l) => ({
    id: `${l.de}:${l.saida}`, source: l.de, sourceHandle: l.saida, target: l.para, type: "desligavel", interactionWidth: 24,
    data: { aoDesligar: () => setGrafo((g) => ({ ...g, ligacoes: g.ligacoes.filter((x) => !(x.de === l.de && x.saida === l.saida)) })) },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#67e8f9" }, style: { stroke: "#67e8f9", strokeWidth: 2 },
  })), [grafo.ligacoes]);

  const [subindoMidia, setSubindoMidia] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const enviarMidia = async (id: string, arquivo: File) => {
    const mime = arquivo.type || "";
    const tipo: "imagem" | "audio" | "video" | "arquivo" = mime.startsWith("image/") ? "imagem" : mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "arquivo";
    if (arquivo.size > 50 * 1024 * 1024) { toast.error("O arquivo passa de 50 MB"); return; }
    setSubindoMidia(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const ext = (arquivo.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
      const caminho = `${u.user?.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error } = await supabase.storage.from("fluxo-midias").upload(caminho, arquivo, { contentType: mime || undefined });
      if (error) throw error;
      const url = supabase.storage.from("fluxo-midias").getPublicUrl(caminho).data.publicUrl;
      mudarNo(id, (n) => ({ ...n, dados: { ...n.dados, midia_url: url, midia_tipo: tipo, midia_nome: arquivo.name.slice(0, 120), midia_mimetype: mime } }));
    } catch (e) { toast.error(`Não consegui enviar o arquivo: ${(e as { message?: string })?.message ?? "erro"}`); } finally { setSubindoMidia(false); }
  };
  const mudarNo = (id: string, f: (n: NoFluxo) => NoFluxo) => setGrafo((g) => ({ ...g, nos: g.nos.map((n) => (n.id === id ? f(n) : n)) }));
  const onNodesChange = useCallback((ch: NodeChange[]) => {
    setGrafo((g) => {
      const mov = ch.filter((c) => c.type === "position" && c.position) as (NodeChange & { id: string; position: { x: number; y: number } })[];
      if (!mov.length) return g;
      return { ...g, nos: g.nos.map((n) => { const m = mov.find((c) => c.id === n.id); return m ? { ...n, x: m.position.x, y: m.position.y } : n; }) };
    });
    void applyNodeChanges;
  }, []);
  const ligar = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    setGrafo((g) => ({ ...g, ligacoes: [...g.ligacoes.filter((l) => !(l.de === c.source && l.saida === (c.sourceHandle ?? "proximo"))), { de: c.source!, saida: c.sourceHandle ?? "proximo", para: c.target! }] }));
  }, []);
  const apagarNos = (ids: string[]) => {
    const ok = ids.filter((i) => i !== "inicio"); if (!ok.length) return;
    setGrafo((g) => ({ nos: g.nos.filter((n) => !ok.includes(n.id)), ligacoes: g.ligacoes.filter((l) => !ok.includes(l.de) && !ok.includes(l.para)) }));
    setSel(null);
  };

  const adicionar = (tipo: Exclude<TipoNo, "inicio">) => {
    const id = novoId();
    const base = grafo.nos.find((n) => n.id === sel) ?? grafo.nos.find((n) => n.id === "inicio")!;
    const dados = tipo === "mensagem" ? { texto: "" } : tipo === "midia" ? { texto: "" } : tipo === "tag" ? { tag_acao: "adicionar" as const, tag_nome: "" } : tipo === "esperar" ? { minutos: 10 } : tipo === "condicao" ? { condicao: "respondeu" as const } : {};
    const novo: NoFluxo = { id, tipo, x: base.x + 360, y: base.y + (grafo.nos.filter((n) => n.x > base.x + 100 && n.x < base.x + 700).length) * 40, dados };
    // se o bloco escolhido tem uma saída livre, já liga
    const livre = saidasDoNo(base).find((s) => !grafo.ligacoes.some((l) => l.de === base.id && l.saida === s.id));
    setGrafo((g) => ({ nos: [...g.nos, novo], ligacoes: livre ? [...g.ligacoes, { de: base.id, saida: livre.id, para: id }] : g.ligacoes }));
    setSel(id);
    window.setTimeout(() => instancia.current?.setCenter(novo.x + 140, novo.y + 80, { zoom: 0.9, duration: 300 }), 50);
  };

  const guardar = async (ativar?: boolean) => {
    if (!nome.trim()) { toast.error("Dê um nome ao fluxo"); return; }
    const quer = ativar ?? ativo;
    if (!whatsapp && !gatilhos.length) { toast.error("Escolha ao menos um gatilho"); return; }
    if (!whatsapp && gatilhos.includes("comentario") && mediaIds !== null && !mediaIds.length) { toast.error("Escolha ao menos um post ou volte para “todos os posts”"); return; }
    if (quer) {
      if (!whatsapp && !palavrasLista.length) { toast.error("Escreva ao menos uma palavra-chave para ativar"); return; }
      if (problemas.length) { toast.error(`Arrume antes de ativar: ${problemas[0].texto}`); return; }
    }
    setSalvando(true);
    try {
      await onSalvar({ nome: nome.trim(), ativo: quer, gatilhos: gatilhos.length ? gatilhos : ["comentario"], palavras_chave: palavrasLista, correspondencia: modoPalavra, media_ids: gatilhos.includes("comentario") && mediaIds?.length ? mediaIds : null, respostas_comentario: respostas.split("\n").map((r) => r.trim()).filter(Boolean), grafo, ...(whatsapp ? { gatilho_wa: gatilhoWa } : {}) }, fluxo?.id);
      try { localStorage.removeItem(chaveRascunho); } catch { /* sem storage */ }
      setTemRascunho(false);
      setAtivo(quer); toast.success(quer ? "Fluxo salvo e ativo" : "Fluxo salvo (desativado)"); onFechar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui salvar"); } finally { setSalvando(false); }
  };

  const no = grafo.nos.find((n) => n.id === sel) ?? null;
  const trocarBotoes = (tipo: "resposta" | "link" | "nenhum") => mudarNo(sel!, (n) => ({ ...n, dados: { ...n.dados, botoes: tipo === "nenhum" ? [] : (n.dados.botoes ?? []).filter((b) => b.tipo === tipo) } }));
  const tipoBotoes = no?.tipo === "mensagem" ? ((no.dados.botoes ?? [])[0]?.tipo ?? "nenhum") : "nenhum";
  const [escolhaBotoes, setEscolhaBotoes] = useState<"nenhum" | "resposta" | "link" | null>(null);
  const modoBotoes = escolhaBotoes ?? (tipoBotoes as "nenhum" | "resposta" | "link");
  useEffect(() => { setEscolhaBotoes(null); }, [sel]);
  const addBotao = (tipo: "resposta" | "link") => mudarNo(sel!, (n) => ({ ...n, dados: { ...n.dados, botoes: [...(n.dados.botoes ?? []), { id: `b${Math.random().toString(36).slice(2, 7)}`, titulo: "", tipo, url: tipo === "link" ? "https://" : undefined }] } }));
  const mudarBotao = (id: string, p: Partial<Botao>) => mudarNo(sel!, (n) => ({ ...n, dados: { ...n.dados, botoes: (n.dados.botoes ?? []).map((b) => (b.id === id ? { ...b, ...p } : b)) } }));
  const tirarBotao = (id: string) => {
    mudarNo(sel!, (n) => ({ ...n, dados: { ...n.dados, botoes: (n.dados.botoes ?? []).filter((b) => b.id !== id) } }));
    setGrafo((g) => ({ ...g, ligacoes: g.ligacoes.filter((l) => !(l.de === sel && l.saida === id)) }));
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="dark flex h-[94vh] max-h-[94vh] w-[98vw] max-w-[1600px] flex-col gap-0 overflow-hidden border-white/10 bg-[#0a1520] p-0 text-white [&>button]:hidden">
        <DialogDescription className="sr-only">Editor do fluxo de mensagens</DialogDescription>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#0c1b27] px-4 py-2.5">
          <DialogTitle className="sr-only">Fluxo de mensagens</DialogTitle>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 w-64 border-white/15 bg-black/20 font-semibold" aria-label="Nome do fluxo" />
          <span className="text-xs text-white/50">{contaNome}</span>
          <label className="ml-2 flex items-center gap-2 text-xs text-white/70"><Switch checked={ativo} onCheckedChange={(v) => { if (v && (problemas.length || (!whatsapp && !palavrasLista.length))) { toast.error(problemas[0]?.texto ?? "Escreva ao menos uma palavra-chave"); return; } setAtivo(v); }} />{ativo ? "Ativo" : "Desativado"}</label>
          {numerosDoPeriodo && fluxo && (
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-0.5 text-[11px]" title="Os números de cada mensagem mostram só este período">
              <span className="px-1.5 text-white/45">Números</span>
              {([["tudo", "Tudo"], ["hoje", "Hoje"], ["ontem", "Ontem"], ["7", "7 dias"], ["14", "14 dias"], ["30", "30 dias"]] as const).map(([v, r]) => (
                <button key={v} type="button" onClick={() => setPeriodo(v)} className={cn("rounded-md px-2 py-1", periodo === v ? "bg-cyan-400/20 font-semibold text-cyan-100" : "text-white/60 hover:text-white")}>{r}</button>))}
              <input type="date" value={dia} onChange={(e) => { setDia(e.target.value); if (e.target.value) setPeriodo("dia"); }} className={cn("rounded-md bg-transparent px-1.5 py-0.5 [color-scheme:dark]", periodo === "dia" ? "bg-cyan-400/20 text-cyan-100" : "text-white/60")} title="Escolher um dia" />
            </div>)}
          <div className="ml-auto flex items-center gap-2">
            {problemas.length > 0 && <span className="flex items-center gap-1 text-xs text-amber-300"><AlertTriangle className="h-4 w-4" />{problemas.length} ponto{problemas.length === 1 ? "" : "s"} a arrumar</span>}
            {temRascunho && <Button variant="outline" size="sm" onClick={() => carregarBase(false)} title="Volta ao que está salvo e apaga o rascunho" className="border-amber-300/40 bg-transparent text-amber-200 hover:bg-amber-300/10">Descartar alterações</Button>}
            <Button variant="outline" size="sm" onClick={onFechar} className="border-white/20 bg-transparent text-white hover:bg-white/10">Fechar</Button>
            <Button size="sm" disabled={salvando} onClick={() => void guardar()}>{salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Salvar</Button>
          </div>
        </div>
        <div className={cn("grid min-h-0 flex-1", painelEsquerda ? "lg:grid-cols-[300px_minmax(0,1fr)_360px]" : "lg:grid-cols-[minmax(0,1fr)_360px]")}>
          {painelEsquerda}
          <div className="relative min-h-0">
            <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-[#0b1220]/90 p-1.5 backdrop-blur">
              {(whatsapp ? ["mensagem", "midia", "tag", "esperar", "condicao", "fim"] as const : ["mensagem", "midia", "esperar", "condicao", "fim"] as const).map((t) => { const v = VISUAL[t]; return (
                <button key={t} type="button" onClick={() => adicionar(t)} className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:brightness-125", v.cor)}><Plus className="h-3 w-3" /><v.Icone className="h-3.5 w-3.5" />{v.nome}</button>); })}
            </div>
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={tipos} edgeTypes={tiposSeta} onNodesChange={onNodesChange} onConnect={ligar} onInit={(i) => { instancia.current = i; window.setTimeout(() => i.fitView({ padding: 0.3, maxZoom: 0.9 }), 60); }}
              onNodeClick={(_, n) => setSel(n.id)} onPaneClick={() => setSel(null)} onNodesDelete={(ns) => apagarNos(ns.map((n) => n.id))}
              onEdgesDelete={(es) => setGrafo((g) => ({ ...g, ligacoes: g.ligacoes.filter((l) => !es.some((e) => e.id === `${l.de}:${l.saida}`)) }))}
              minZoom={0.2} maxZoom={1.4} deleteKeyCode={["Backspace", "Delete"]} proOptions={{ hideAttribution: true }} className="bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.07)_1px,transparent_0)] [background-size:22px_22px]">
              <Background color="transparent" /><Controls showInteractive={false} className="!bg-[#0b1220]" />
            </ReactFlow>
            {grafo.nos.length === 1 && <p className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-sm text-white/45">Toque em “+ Mensagem” para começar. Arraste do ponto de uma saída até o próximo bloco para ligar.</p>}
          </div>

          <aside className="min-h-0 space-y-4 overflow-y-auto border-t border-white/10 bg-[#0b141a] p-4 lg:border-l lg:border-t-0">
            {!no || no.tipo === "inicio" ? (
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-bold"><Zap className="h-4 w-4 text-amber-300" />{whatsapp ? "Como o fluxo começa" : "Gatilho do fluxo"}</h3>
                {whatsapp && (
                  <div className="space-y-2">
                    <p className="text-xs text-white/60">Quando este fluxo começa para uma pessoa</p>
                    {TIPOS_GATILHO_WA.map((t) => {
                      const on = gatilhoWa.tipo === t.valor;
                      return (
                        <button key={t.valor} type="button" aria-pressed={on} onClick={() => setGatilhoWa((g) => ({ ...g, tipo: t.valor, espera_min: t.valor === "manual" ? 0 : g.espera_min }))}
                          className={cn("flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left", on ? "border-amber-300 bg-amber-300/10" : "border-white/15 hover:bg-white/5")}>
                          <span className={cn("mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border", on ? "border-amber-300 bg-amber-300 text-black" : "border-white/30")}>{on && <Check className="h-3 w-3" />}</span>
                          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{t.titulo}</span><span className="block text-[11px] leading-snug text-white/55">{t.descricao}</span></span>
                        </button>);
                    })}
                    {gatilhoWa.tipo === "tag" && (
                      <div className="space-y-2 rounded-xl bg-white/5 p-3 text-xs text-white/70">
                        <label className="flex flex-wrap items-center gap-2">Tag
                          <Input list="tags-wa" value={gatilhoWa.tag ?? ""} onChange={(e) => setGatilhoWa((g) => ({ ...g, tag: e.target.value.toLowerCase().slice(0, 40) }))} placeholder="ex.: quer-black-friday" className="h-8 w-56 border-white/15 bg-black/20 text-white" /></label>
                        <datalist id="tags-wa">{tagsWa.map((t) => <option key={t} value={t} />)}</datalist>
                        {quizzesWa.length > 1 && (
                          <label className="flex flex-wrap items-center gap-2">Só do quiz
                            <select value={gatilhoWa.quiz_id ?? ""} onChange={(e) => setGatilhoWa((g) => ({ ...g, quiz_id: e.target.value || null }))} className="h-8 max-w-full rounded-md border border-white/15 bg-black/20 px-2 text-sm"><option value="">todos os quizzes e versões</option>{quizzesWa.map((q) => <option key={q.id} value={q.id}>{q.titulo} (e versões)</option>)}</select></label>)}
                        <p className="text-[11px] text-amber-200/80">⚠ Quem <b>já tem</b> a tag entra assim que você ligar o fluxo (até 10 por minuto). Quem tem a tag <b>nao-receber</b> nunca entra.</p>
                      </div>)}
                    {gatilhoWa.tipo !== "manual" && gatilhoWa.tipo !== "tag" && (() => {
                      const t = TIPOS_GATILHO_WA.find((x) => x.valor === gatilhoWa.tipo)!;
                      const m = gatilhoWa.espera_min, un = m > 0 && m % 1440 === 0 ? "dia" : m > 0 && m % 60 === 0 ? "h" : "min";
                      const n = un === "dia" ? m / 1440 : un === "h" ? m / 60 : m;
                      const aplicar = (num: number, unid: string) => setGatilhoWa((g) => ({ ...g, espera_min: Math.min(43200, Math.max(0, Math.round(num)) * (unid === "dia" ? 1440 : unid === "h" ? 60 : 1)) }));
                      return (
                        <div className="space-y-2 rounded-xl bg-white/5 p-3 text-xs text-white/70">
                          <div className="flex flex-wrap items-center gap-2">{t.espera}
                            <Input type="number" min={0} value={n} onChange={(e) => aplicar(Number(e.target.value) || 0, un)} className="h-8 w-20 border-white/15 bg-black/20 text-white" />
                            <select value={un} onChange={(e) => aplicar(n, e.target.value)} className="h-8 rounded-md border border-white/15 bg-black/20 px-2 text-sm"><option value="min">minutos</option><option value="h">horas</option><option value="dia">dias</option></select>
                            <span className="text-white/45">{m === 0 ? "(na hora)" : ""}</span></div>
                          {quizzesWa.length > 1 && (
                            <label className="flex flex-wrap items-center gap-2">Só do quiz
                              <select value={gatilhoWa.quiz_id ?? ""} onChange={(e) => setGatilhoWa((g) => ({ ...g, quiz_id: e.target.value || null }))} className="h-8 max-w-full rounded-md border border-white/15 bg-black/20 px-2 text-sm"><option value="">qualquer quiz do projeto</option>{quizzesWa.map((q) => <option key={q.id} value={q.id}>{q.titulo}</option>)}</select></label>)}
                          <p className="text-[11px] text-white/45">Só entra quem virar lead <b>depois</b> de você ligar o fluxo: a base antiga não recebe nada. Cada pessoa entra uma vez só.</p>
                        </div>);
                    })()}
                    <div className="space-y-1 rounded-xl bg-white/5 p-3 text-[11px] leading-relaxed text-white/55"><p>As <b>respostas</b> viram uma lista numerada (“1) … 2) …”) e a pessoa responde o número ou o texto. Os <b>links</b> vão por extenso. O robô para se você escrever na conversa e nunca manda entre 23h e 7h. Ligue o fluxo (chave “Ativo”) para valer.</p></div>
                  </div>)}
                {!whatsapp && (<><label className="block space-y-1 text-xs text-white/60">Palavras (separe por vírgula)
                  <Textarea rows={2} value={palavras} onChange={(e) => setPalavras(e.target.value)} placeholder="instalivros, quero, livro" className="border-white/15 bg-black/20 text-sm text-white" /></label>
                <div className="space-y-1.5"><p className="text-xs text-white/60">Quando a palavra vale</p>
                  {([["contem", "Contém a palavra", "“eu quero instalivros” dispara; “instalivors” não"], ["trecho", "Contém o trecho", "basta o pedaço: “insta” pega instalivros, instalivors, insta livros…"], ["exata", "Só a palavra", "a mensagem inteira tem de ser a palavra"]] as const).map(([v, r, d]) => (
                    <label key={v} className="flex items-start gap-2 text-xs text-white/80"><input type="radio" className="mt-0.5" checked={modoPalavra === v} onChange={() => setModoPalavra(v)} /><span><b>{r}</b> <span className="text-white/45">{d}</span></span></label>))}
                  {modoPalavra === "trecho" && palavrasLista.some((p) => p.replace(/[^a-zA-Z0-9]/g, "").length < 3) && <p className="rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-200">Trecho muito curto dispara em muita palavra (“in” aparece em quase tudo). Use 3 letras ou mais.</p>}
                </div>
                <div className="space-y-2"><p className="text-xs text-white/60">Escolha o gatilho (pode marcar mais de um)</p>
                  {TIPOS_GATILHO.map((t) => {
                    const on = gatilhos.includes(t.valor);
                    return (
                      <button key={t.valor} type="button" onClick={() => setGatilhos((x) => (on ? x.filter((y) => y !== t.valor) : [...x, t.valor]))} aria-pressed={on}
                        className={cn("flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left", on ? "border-amber-300 bg-amber-300/10" : "border-white/15 hover:bg-white/5")}>
                        <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg", on ? "bg-amber-300 text-black" : "bg-white/10 text-white/70")}><t.Icone className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{t.titulo}</span><span className="block text-[11px] leading-snug text-white/55">{t.descricao}</span></span>
                        <span className={cn("mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border", on ? "border-amber-300 bg-amber-300 text-black" : "border-white/30")}>{on && <Check className="h-3 w-3" />}</span>
                      </button>);
                  })}
                  <details className="text-[11px] text-white/40"><summary className="cursor-pointer hover:text-white/60">Em breve (como no ManyChat)</summary>
                    <ul className="mt-1 space-y-0.5 pl-3">{GATILHOS_EM_BREVE.map((g) => <li key={g}>• {g}</li>)}</ul></details>
                </div>
                {gatilhos.includes("comentario") && (
                  <div className="space-y-2"><p className="text-xs text-white/60">Em quais posts e reels</p>
                    <div className="inline-flex rounded-lg border border-white/15 p-0.5 text-xs">
                      <button type="button" onClick={() => setMediaIds(null)} className={cn("rounded-md px-3 py-1", mediaIds === null ? "bg-white/15 font-semibold" : "text-white/60")}>Todos</button>
                      <button type="button" onClick={() => setMediaIds((m) => m ?? [])} className={cn("rounded-md px-3 py-1", mediaIds !== null ? "bg-white/15 font-semibold" : "text-white/60")}>Escolher posts</button>
                    </div>
                    {mediaIds !== null && (
                      !igUserId ? <p className="text-[11px] text-white/45">Conecte uma conta do Instagram para escolher os posts.</p>
                      : carregandoPosts ? <p className="flex items-center gap-2 text-[11px] text-white/50"><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando posts…</p>
                      : erroPosts ? <p className="text-[11px] text-rose-300">{erroPosts}</p>
                      : (
                        <div className="grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto">
                          {(posts ?? []).map((p) => {
                            const marcado = mediaIds.includes(p.id), imagem = p.thumbnail_url || p.media_url;
                            return (
                              <button key={p.id} type="button" title={p.caption ?? ""} onClick={() => setMediaIds((m) => { const l = m ?? []; return l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id]; })}
                                className={cn("relative aspect-[4/5] overflow-hidden rounded-md border-2 bg-white/5", marcado ? "border-amber-300" : "border-transparent opacity-80 hover:opacity-100")}>
                                {imagem && <img src={imagem} alt="" className="h-full w-full object-cover" loading="lazy" />}
                                <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 text-[10px] text-white">{p.media_product_type === "REELS" ? "Reel" : "Post"} · {p.comments_count ?? 0} 💬</span>
                                {marcado && <span className="absolute right-1 top-1 rounded-full bg-amber-300 p-0.5 text-black"><Check className="h-3 w-3" /></span>}
                              </button>);
                          })}
                        </div>))}
                  </div>)}
                {gatilhos.includes("comentario") && (
                  <label className="block space-y-1 text-xs text-white/60">Respostas públicas no comentário (uma por linha; sorteia uma)
                    <Textarea rows={3} value={respostas} onChange={(e) => setRespostas(e.target.value)} placeholder={"Te mandei no direct! 📩\nConfere sua DM 😉"} className="border-white/15 bg-black/20 text-sm text-white" /></label>)}
                </>)}
                {!whatsapp && <div className="rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/60">
                  <p className="font-semibold text-white/80">Como a Meta funciona</p>
                  <p>A primeira mensagem de um comentário abre a conversa. As próximas só saem <b>depois que a pessoa responde</b> (toca num botão ou escreve), e valem por 24 h. Por isso a primeira mensagem deve ter botões de resposta.</p>
                </div>}
                {problemas.length > 0 && <ul className="space-y-1 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200">{problemas.map((p, i) => <li key={i}>• {p.texto}</li>)}</ul>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2"><h3 className="flex flex-1 items-center gap-2 text-sm font-bold">{(() => { const v = VISUAL[no.tipo]; return <><v.Icone className="h-4 w-4" />{v.nome}</>; })()}</h3>
                  <button type="button" onClick={() => apagarNos([no.id])} title="Apagar bloco" className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setSel(null)} title="Fechar" className="rounded-lg p-1.5 text-white/40 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
                {no.tipo === "mensagem" && (<>
                  <label className="block space-y-1 text-xs text-white/60">Mensagem
                    <TextoComVariaveis rows={6} whatsapp={whatsapp} valor={no.dados.texto ?? ""} aoMudar={(v) => mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, texto: v } }))} placeholder="Oi! Que bom que você quer. Quer receber o link agora?" className="border-white/15 bg-black/20 text-sm text-white" />
                    <span className="text-right text-[10px] text-white/40">{(no.dados.texto ?? "").length} caracteres</span></label>
                  <div className="space-y-2"><p className="text-xs text-white/60">Botões</p>
                    <div className="flex gap-1.5 text-xs">{([["nenhum", "Sem botões"], ["resposta", "Respostas"], ["link", "Links"]] as const).map(([v, r]) => (
                      <button key={v} type="button" onClick={() => { if (v !== modoBotoes) { if (v === "nenhum" || (no.dados.botoes ?? []).length === 0 || confirm("Trocar o tipo apaga os botões atuais desta mensagem. Continuar?")) { trocarBotoes(v); setEscolhaBotoes(v); } } }}
                        className={cn("rounded-lg border px-2.5 py-1.5", modoBotoes === v ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/15 text-white/60 hover:bg-white/5")}>{r}</button>))}</div>
                    {modoBotoes === "resposta" && <p className="text-[11px] text-white/45">A pessoa toca numa resposta e o fluxo segue pelo caminho daquele botão. Até {MAX_RESPOSTAS}; cada um tem a sua saída no bloco.</p>}
                    {modoBotoes === "link" && <p className="text-[11px] text-white/45">Até {MAX_BOTOES_LINK} botões que abrem um link. Depois dessa mensagem o fluxo segue direto para o próximo bloco.</p>}
                    {(no.dados.botoes ?? []).map((b) => (
                      <div key={b.id} className="space-y-1 rounded-lg border border-white/10 bg-black/20 p-2">
                        <div className="flex items-center gap-1.5"><Input value={b.titulo} maxLength={LIMITE_TITULO_BOTAO + 10} onChange={(e) => mudarBotao(b.id, { titulo: e.target.value })} placeholder="Título do botão" className="h-8 border-white/15 bg-black/30 text-sm" />
                          <span className={cn("text-[10px]", b.titulo.length > LIMITE_TITULO_BOTAO ? "text-rose-300" : "text-white/35")}>{b.titulo.length}/{LIMITE_TITULO_BOTAO}</span>
                          <button type="button" onClick={() => tirarBotao(b.id)} className="rounded p-1 text-white/40 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button></div>
                        {b.tipo === "link" && <Input value={b.url ?? ""} onChange={(e) => mudarBotao(b.id, { url: e.target.value.trim() })} placeholder="https://…" className="h-8 border-white/15 bg-black/30 text-sm" />}
                      </div>))}
                    {(modoBotoes === "resposta" && (no.dados.botoes ?? []).length < MAX_RESPOSTAS) && <Button type="button" variant="outline" size="sm" onClick={() => addBotao("resposta")} className="w-full border-white/20 bg-transparent text-white hover:bg-white/10"><Plus className="mr-1 h-3.5 w-3.5" />Botão de resposta</Button>}
                    {(modoBotoes === "link" && (no.dados.botoes ?? []).length < MAX_BOTOES_LINK) && <Button type="button" variant="outline" size="sm" onClick={() => addBotao("link")} className="w-full border-white/20 bg-transparent text-white hover:bg-white/10"><Plus className="mr-1 h-3.5 w-3.5" />Botão de link</Button>}
                  </div></>)}
                {no.tipo === "midia" && (<>
                  <div className="space-y-2">
                    <p className="text-xs text-white/60">Arquivo</p>
                    {no.dados.midia_url && (
                      <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-2">
                        {no.dados.midia_tipo === "imagem" && <img src={no.dados.midia_url} alt="" className="max-h-48 w-full rounded object-contain" />}
                        {no.dados.midia_tipo === "audio" && <audio src={no.dados.midia_url} controls className="w-full" />}
                        {no.dados.midia_tipo === "video" && <video src={no.dados.midia_url} controls className="max-h-48 w-full rounded" />}
                        {no.dados.midia_tipo === "arquivo" && <p className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4" />{no.dados.midia_nome ?? "arquivo"}</p>}
                        <p className="truncate text-[11px] text-white/40">{no.dados.midia_nome}</p>
                      </div>)}
                    <label
                      onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
                      onDragLeave={() => setArrastando(false)}
                      onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files?.[0]; if (f) void enviarMidia(no.id, f); }}
                      className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-white/25 px-3 text-xs hover:bg-white/5", arrastando ? "border-cyan-300 bg-cyan-300/10 py-8 text-cyan-100" : "py-2.5", subindoMidia && "pointer-events-none opacity-60")}>
                      {subindoMidia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{arrastando ? "Solte aqui" : no.dados.midia_url ? "Trocar o arquivo (ou arraste)" : "Enviar ou arrastar foto, áudio, vídeo ou PDF"}
                      <input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif,audio/*,video/mp4,video/quicktime,video/webm,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void enviarMidia(no.id, f); }} />
                    </label>
                    <p className="text-[11px] text-white/40">Até 50 MB. Foto: png, jpg, webp ou gif. Áudio: mp3, m4a, ogg, wav. Vídeo: mp4. {whatsapp ? "O áudio sai como mensagem de voz." : "No direct o PDF vai como link."}</p>
                  </div>
                  <label className="block space-y-1 text-xs text-white/60">Legenda (opcional)
                    <TextoComVariaveis rows={3} whatsapp={whatsapp} valor={no.dados.texto ?? ""} aoMudar={(v) => mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, texto: v } }))} placeholder="Texto que acompanha a mídia" className="border-white/15 bg-black/20 text-sm text-white" />
                    <span className="text-[10px] text-white/40">{whatsapp ? "No WhatsApp a legenda vai junto da foto, vídeo ou PDF; no áudio, vai logo depois como texto." : "No direct a legenda vai logo depois do anexo, como uma segunda mensagem."}</span></label>
                  {!whatsapp && <p className="rounded-lg bg-white/5 p-2 text-[11px] text-white/50">Anexos só saem depois que a pessoa respondeu (dentro das 24 h). Por isso a mídia não pode ser a primeira mensagem do comentário.</p>}</>)}
                {no.tipo === "tag" && (<>
                  <label className="block space-y-1 text-xs text-white/60">O que fazer
                    <select value={no.dados.tag_acao ?? "adicionar"} onChange={(e) => mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, tag_acao: e.target.value as "adicionar" | "remover" } }))} className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2 text-sm text-white"><option value="adicionar">Pôr a tag na pessoa</option><option value="remover">Tirar a tag da pessoa</option></select></label>
                  <label className="block space-y-1 text-xs text-white/60">Nome da tag
                    <Input list="tags-wa-no" value={no.dados.tag_nome ?? ""} onChange={(e) => mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, tag_nome: e.target.value.toLowerCase().slice(0, 40) } }))} placeholder="ex.: nao-receber" className="border-white/15 bg-black/20 text-sm text-white" /></label>
                  <datalist id="tags-wa-no">{["nao-receber", ...tagsWa.filter((t) => t !== "nao-receber")].map((t) => <option key={t} value={t} />)}</datalist>
                  <p className="text-[11px] text-white/45">Use o bloco no caminho de um botão (ex.: “Bloquear contato” → tag <b>nao-receber</b>) para marcar a pessoa. Quem tem <b>nao-receber</b> não entra em nenhum fluxo automático.</p>
                </>)}
                {no.tipo === "esperar" && (
                  <label className="block space-y-1 text-xs text-white/60">Esperar quanto tempo?
                    <div className="flex gap-2"><Input type="number" min={1} value={(no.dados.minutos ?? 10) >= 60 && (no.dados.minutos ?? 0) % 60 === 0 ? (no.dados.minutos ?? 0) / 60 : no.dados.minutos ?? 10} className="h-9 w-24 border-white/15 bg-black/20"
                      onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); const h = (no.dados.minutos ?? 0) >= 60 && (no.dados.minutos ?? 0) % 60 === 0; mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, minutos: h ? v * 60 : v } })); }} />
                      <select value={(no.dados.minutos ?? 10) >= 60 && (no.dados.minutos ?? 0) % 60 === 0 ? "h" : "min"} className="h-9 rounded-md border border-white/15 bg-black/20 px-2 text-sm"
                        onChange={(e) => { const atual = no.dados.minutos ?? 10; const emH = atual >= 60 && atual % 60 === 0; const base = emH ? atual / 60 : atual; mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, minutos: e.target.value === "h" ? base * 60 : base } })); }}>
                        <option value="min">minutos</option><option value="h">horas</option></select></div>
                    <span className="text-[11px] text-white/40">De 1 minuto a 24 horas (a janela da Meta fecha em 24 h).</span></label>)}
                {no.tipo === "condicao" && (<>
                  <label className="block space-y-1 text-xs text-white/60">Pergunta do bloco
                    <select value={no.dados.condicao ?? "respondeu"} onChange={(e) => mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, condicao: e.target.value as "respondeu" | "texto_contem" } }))} className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2 text-sm">
                      <option value="respondeu">A pessoa respondeu desde o início?</option><option value="texto_contem">A última resposta contém a palavra…</option></select></label>
                  {no.dados.condicao === "texto_contem" && <Input value={no.dados.palavra ?? ""} onChange={(e) => mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, palavra: e.target.value } }))} placeholder="palavra" className="h-9 border-white/15 bg-black/20" />}
                  <p className="text-[11px] text-white/45">Ligue a saída “Sim” e a saída “Não” aos blocos que seguem.</p></>)}
                {no.tipo === "fim" && <p className="text-xs text-white/55">O fluxo termina aqui para essa pessoa.</p>}
                {(porNo.get(no.id) ?? []).length > 0 && <ul className="space-y-1 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200">{(porNo.get(no.id) ?? []).map((p, i) => <li key={i}>• {p}</li>)}</ul>}
              </div>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
