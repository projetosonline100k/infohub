import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, Archive, ArchiveRestore, ArrowLeft, CheckCheck, ChevronDown, Clock3, Copy, FileText, Folder, FolderPlus, Forward, PanelRightClose, PanelRightOpen, Reply, Loader2, MessageCircle, Mic, Paperclip, Pencil, Plus, Search, Send, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDesktop } from "@/lib/platform";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { cn } from "@/lib/utils";
import { ehComODavi, esperaSuaResposta, type ConversaResumo } from "@/lib/whatsapp/shirley";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AudioMensagem } from "./AudioMensagem";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrganizacaoWhatsapp } from "@/hooks/useOrganizacaoWhatsapp";
import { confirmar, pedirTexto } from "@/components/DialogosGlobais";

// Guia WhatsApp → "Conversas": o WhatsApp ao vivo dentro do Atlas. As
// mensagens chegam pelo WAHA no Mac (scripts/whatsapp-receptor.py) na tabela
// whatsapp_mensagens; áudios já vêm transcritos. Enviar só acontece quando o
// Davi clica em Enviar (comando whatsapp_enviar, só no app do Mac).

interface Conversa {
  chat_id: string; chat_nome: string | null; eh_grupo: boolean; ultima_em: string; ultima_de_mim: boolean;
  ultima_tipo: string; ultima_texto: string | null; ultima_autor: string | null; total: number;
}
// 19/10 (Davi): "quando mando mensagem, em vez de ficar vazio e só aparecer quando é enviada, já
// aparece com o relógio no cantinho igual ao WhatsApp; quando enviar, os dois tracinhos". A mensagem
// fica aqui até a de verdade chegar do WhatsApp (pelo receptor, ao vivo).
interface Pendente { id: string; tipo: "texto" | "audio" | "arquivo"; responderA?: string; texto: string; criada: string; estado: "enviando" | "enviada" | "erro"; erro?: string; audio?: Blob; audioUrl?: string; arquivo?: File; arquivoUrl?: string }
// Até onde o WhatsApp do Mac aguenta mandar de uma vez (o arquivo vai inteiro em base64).
const LIMITE_ARQUIVO = 64 * 1024 * 1024;
const normTexto = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim();

function Situacao({ estado }: { estado: "enviando" | "enviada" | "erro" }) {
  if (estado === "enviando") return <Clock3 className="inline h-3 w-3" aria-label="enviando" />;
  if (estado === "erro") return <AlertCircle className="inline h-3 w-3 text-rose-500" aria-label="não enviou" />;
  return <CheckCheck className="inline h-3.5 w-3.5" aria-label="enviada" />;
}

interface Mensagem {
  id: string; chat_id: string; chat_nome: string | null; eh_grupo: boolean; de_mim: boolean; autor_nome: string | null;
  autor_id?: string | null; tipo: string; texto: string | null; transcricao: string | null; transcricao_status: string | null; enviada_em: string;
  midia_arquivo?: string | null; responde_a?: string | null;
}

// Opções da mensagem, como no WhatsApp (26/10): reagir, responder, copiar, encaminhar, editar e apagar.
const REACOES = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
const resumoDe = (m: Pick<Mensagem, "tipo" | "texto" | "transcricao">) =>
  m.tipo === "audio" ? `🎤 ${m.transcricao ?? "Áudio"}` : m.tipo !== "texto" ? `${ROTULO_TIPO[m.tipo] ?? "Mensagem"}${m.texto ? ` ${m.texto}` : ""}` : m.texto ?? "";

function EncaminharPara({ onEscolher }: { onEscolher: (c: { chat_id: string; chat_nome: string | null }) => void }) {
  const conta = useContext(ContaWhatsapp);
  const [lista, setLista] = useState<{ chat_id: string; chat_nome: string | null; eh_grupo: boolean; ultima_em: string }[]>([]);
  const [busca, setBusca] = useState("");
  useEffect(() => {
    void (supabase as unknown as SupabaseClient).rpc("whatsapp_conversas", { p_conta: conta })
      .then(({ data }) => setLista(((data || []) as typeof lista).sort((a, b) => b.ultima_em.localeCompare(a.ultima_em))));
  }, [conta]);
  const q = busca.trim().toLowerCase();
  const vistas = lista.filter((c) => !q || (c.chat_nome ?? c.chat_id).toLowerCase().includes(q)).slice(0, 40);
  return (
    <div className="w-64 space-y-1.5">
      <p className="text-xs font-semibold">Encaminhar para…</p>
      <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conversa"
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary/50" />
      <div className="max-h-60 overflow-y-auto">
        {vistas.map((c) => (
          <button key={c.chat_id} type="button" onClick={() => onEscolher(c)}
            className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-accent">
            <FotoChat chatId={c.chat_id} nome={c.chat_nome} grupo={c.eh_grupo} tamanho="h-6 w-6" />
            <span className="truncate">{c.chat_nome ?? c.chat_id.split("@")[0]}</span>
          </button>
        ))}
        {!vistas.length && <p className="px-1.5 py-2 text-[11px] text-muted-foreground">Nenhuma conversa.</p>}
      </div>
    </div>
  );
}

function MenuMensagem({ m, podeEnviar, onResponder, onReagir, onCopiar, onEncaminhar, onEditar, onApagar }: {
  m: Mensagem; podeEnviar: boolean; onResponder: () => void; onReagir: (r: string) => void; onCopiar: () => void;
  onEncaminhar: (c: { chat_id: string; chat_nome: string | null }) => void; onEditar: () => void; onApagar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [encaminhando, setEncaminhando] = useState(false);
  const fechar = () => { setAberto(false); setEncaminhando(false); };
  const editavel = m.de_mim && m.tipo === "texto" && Date.now() - new Date(m.enviada_em).getTime() < 15 * 60_000;
  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent";
  return (
    <Popover open={aberto} onOpenChange={(a) => { setAberto(a); if (!a) setEncaminhando(false); }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Opções da mensagem"
          className={cn("absolute right-1 top-1 z-10 rounded-full bg-inherit p-0.5 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100")}>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={m.de_mim ? "end" : "start"} className="w-auto p-1.5">
        {encaminhando ? <EncaminharPara onEscolher={(c) => { fechar(); onEncaminhar(c); }} /> : (
          <div className="w-48">
            {podeEnviar && (
              <div className="mb-1 flex justify-between rounded-full bg-muted px-1.5 py-1">
                {REACOES.map((r) => (
                  <button key={r} type="button" onClick={() => { fechar(); onReagir(r); }} className="rounded-full px-0.5 text-base transition-transform hover:scale-125" aria-label={`Reagir com ${r}`}>{r}</button>
                ))}
              </div>
            )}
            {podeEnviar && <button type="button" className={item} onClick={() => { fechar(); onResponder(); }}><Reply className="h-3.5 w-3.5" />Responder</button>}
            <button type="button" className={item} onClick={() => { fechar(); onCopiar(); }}><Copy className="h-3.5 w-3.5" />Copiar</button>
            {podeEnviar && <button type="button" className={item} onClick={() => setEncaminhando(true)}><Forward className="h-3.5 w-3.5" />Encaminhar</button>}
            {podeEnviar && editavel && <button type="button" className={item} onClick={() => { fechar(); onEditar(); }}><Pencil className="h-3.5 w-3.5" />Editar</button>}
            {podeEnviar && m.de_mim && <button type="button" className={cn(item, "text-rose-600 dark:text-rose-400")} onClick={() => { fechar(); onApagar(); }}><Trash2 className="h-3.5 w-3.5" />Apagar para todos</button>}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Fotos/vídeos/áudios ficam no Mac e o receptor do WhatsApp entrega pro
// Atlas (só no app do Mac). Endereço + chave vêm do comando whatsapp_midia_base.
// Qual número (20/10/2026): "principal" (o da Shirley da Core) ou "pessoal" (o do Davi, no Davi Queiroz).
export const ContaWhatsapp = createContext("principal");
const midiaBases = new Map<string, Promise<{ base: string; chave: string } | null>>();
function midiaBaseDe(conta: string) {
  if (!midiaBases.has(conta)) {
    midiaBases.set(conta, import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<{ base: string; chave: string }>("whatsapp_midia_base", { conta })).catch(() => null));
  }
  return midiaBases.get(conta)!;
}
function useMidiaUrl() {
  const conta = useContext(ContaWhatsapp);
  const [cfg, setCfg] = useState<{ base: string; chave: string } | null>(null);
  useEffect(() => {
    if (!isDesktop()) return;
    void midiaBaseDe(conta).then(setCfg);
  }, [conta]);
  return useCallback((arquivo?: string | null) => (cfg && arquivo ? `${cfg.base}${encodeURIComponent(arquivo)}?k=${cfg.chave}` : null), [cfg]);
}

// @ marcado na mensagem (24/10, Davi: "esse @ que é marcado, preciso que mostre quem é"): o WhatsApp manda
// o id da pessoa (nas contas novas, um id interno @lid); o receptor do Mac traduz em nome (/contato/<id>).
type Contato = { nome: string | null; eu?: boolean; numero?: string | null };
const contatos = new Map<string, Promise<Contato | null>>();
function useContato(id: string | null, ligado = true) {
  const conta = useContext(ContaWhatsapp);
  const [r, setR] = useState<Contato | null>(null);
  useEffect(() => {
    if (!isDesktop() || !id || !ligado) return;
    const chave = `${conta}:${id}`;
    if (!contatos.has(chave)) {
      contatos.set(chave, midiaBaseDe(conta).then((cfg) => (cfg
        ? fetch(`${cfg.base.replace(/\/midia\/$/, "/contato/")}${encodeURIComponent(id)}?k=${cfg.chave}`).then((x) => x.json()).catch(() => null)
        : null)));
    }
    let vivo = true;
    void contatos.get(chave)!.then((v) => { if (vivo) setR(v); });
    return () => { vivo = false; };
  }, [conta, id, ligado]);
  return r;
}
function Mencao({ numero, nomeDoGrupo }: { numero: string; nomeDoGrupo?: string }) {
  const r = useContato(numero);
  const nome = r?.eu ? "Você" : r?.nome || nomeDoGrupo || numero;
  return (
    <PerfilPessoa id={numero} nome={r?.eu ? "Você" : r?.nome || nomeDoGrupo || null}>
      <button type="button" className="font-semibold text-sky-600 hover:underline dark:text-sky-400">@{nome}</button>
    </PerfilPessoa>
  );
}

// Perfil de quem está no grupo (24/10, Davi: "clicar no nome ou no ícone da pessoa e ver as informações dela,
// número e tal"): foto, nome, telefone (o receptor do Mac traduz o id @lid), copiar, abrir a conversa no
// privado (se já existe aqui) ou no WhatsApp, e os grupos em que ela fala com quantas mensagens.
const AbrirPrivado = createContext<(numeros: string[]) => boolean>(() => false);
const telefoneBonito = (n: string) => {
  const m = n.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${n}`;
};
function PerfilPessoa({ id, nome, children }: { id: string; nome: string | null; children: React.ReactNode }) {
  const conta = useContext(ContaWhatsapp);
  const abrirPrivado = useContext(AbrirPrivado);
  const [aberto, setAberto] = useState(false);
  const contato = useContato(id, aberto);
  const [grupos, setGrupos] = useState<{ nome: string; total: number; ultima: string }[] | null>(null);
  const digitos = id.split("@")[0];
  const numero = contato?.numero ?? (id.endsWith("@lid") || digitos.length > 13 ? null : digitos);
  useEffect(() => {
    if (!aberto || grupos) return;
    void (supabase as unknown as SupabaseClient).from("whatsapp_mensagens")
      .select("chat_id, chat_nome, enviada_em").eq("conta", conta).eq("eh_grupo", true)
      .in("autor_id", [id, `${digitos}@c.us`, `${digitos}@lid`]).order("enviada_em", { ascending: false }).limit(2000)
      .then(({ data }) => {
        const porChat = new Map<string, { nome: string; total: number; ultima: string }>();
        for (const m of (data || []) as { chat_id: string; chat_nome: string | null; enviada_em: string }[]) {
          const g = porChat.get(m.chat_id) ?? { nome: m.chat_nome || "Grupo", total: 0, ultima: m.enviada_em };
          g.total += 1;
          porChat.set(m.chat_id, g);
        }
        setGrupos([...porChat.values()]);
      });
  }, [aberto, grupos, conta, id, digitos]);
  const nomeMostrado = contato?.eu ? "Você" : nome || contato?.nome || (numero ? telefoneBonito(numero) : "Sem nome");
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center gap-2 border-b px-4 pb-3 pt-4 text-center">
          <FotoChat chatId={id.includes("@") ? id : `${id}@c.us`} nome={nomeMostrado} grupo={false} tamanho="h-16 w-16 text-xl" />
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold">{nomeMostrado}</p>
            {contato?.nome && nome && contato.nome !== nome && <p className="truncate text-[11px] text-muted-foreground">No seu WhatsApp: {contato.nome}</p>}
            <p className="mt-0.5 text-[12.5px] tabular-nums text-muted-foreground">
              {numero ? telefoneBonito(numero) : contato || !isDesktop() ? "Número escondido pelo WhatsApp" : "Buscando o número…"}
            </p>
          </div>
        </div>
        {numero && (
          <div className="grid grid-cols-2 gap-1.5 border-b p-2">
            <button type="button" className="flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[12px] hover:bg-muted"
              onClick={() => { void navigator.clipboard.writeText(`+${numero}`).then(() => toast.success("Número copiado")); }}>
              <Copy className="h-3.5 w-3.5" /> Copiar número
            </button>
            <button type="button" className="flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[12px] hover:bg-muted"
              onClick={() => {
                if (abrirPrivado([numero, digitos])) { setAberto(false); return; }
                void abrirLinkExterno(`https://wa.me/${numero}`);
              }}>
              <MessageCircle className="h-3.5 w-3.5" /> Conversar
            </button>
          </div>
        )}
        <div className="max-h-48 overflow-y-auto px-3 py-2">
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">Grupos em que fala</p>
          {!grupos ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            : grupos.length === 0 ? <p className="text-[12px] text-muted-foreground">Nenhuma mensagem em grupo.</p>
            : grupos.map((g) => (
              <div key={g.nome + g.ultima} className="flex items-center justify-between gap-2 py-0.5 text-[12px]">
                <span className="truncate">{g.nome}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" title={`Última: ${format(new Date(g.ultima), "dd/MM HH:mm")}`}>
                  {g.total} msg · {format(new Date(g.ultima), "dd/MM")}
                </span>
              </div>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
function TextoComMencoes({ texto, nomes }: { texto: string; nomes: Map<string, string> }) {
  const partes = texto.split(/(@\d{8,})/g);
  if (partes.length === 1) return <>{texto}</>;
  return <>{partes.map((p, i) => (/^@\d{8,}$/.test(p) ? <Mencao key={i} numero={p.slice(1)} nomeDoGrupo={nomes.get(p.slice(1))} /> : p))}</>;
}

// Documento (24/10, Davi: "queria conseguir abrir isso aqui"): o receptor do Mac baixa na hora (vale para os
// antigos), salva com o nome original em Downloads/WhatsApp (Infopro) e abre no programa do Mac.
function DocumentoMensagem({ id, nome }: { id: string; nome: string | null }) {
  const conta = useContext(ContaWhatsapp);
  const [estado, setEstado] = useState<"parado" | "abrindo">("parado");
  const [nomeArquivo, setNomeArquivo] = useState(nome);
  const abrir = async () => {
    if (!isDesktop()) { toast.info("Abra pelo app do Mac (o WhatsApp está conectado nele)."); return; }
    setEstado("abrindo");
    try {
      const cfg = await midiaBaseDe(conta);
      if (!cfg) throw new Error("o receptor do WhatsApp não respondeu");
      const r = await fetch(`${cfg.base.replace(/\/midia\/$/, "/abrir/")}${encodeURIComponent(id)}?k=${cfg.chave}`).then((x) => x.json());
      if (r.erro) throw new Error(r.erro);
      setNomeArquivo(r.nome);
      toast.success(`Abrindo ${r.nome} (fica em Downloads › WhatsApp (Infopro))`);
    } catch (e) {
      toast.error(`Não abri o documento: ${e instanceof Error ? e.message : "erro"}`);
    } finally {
      setEstado("parado");
    }
  };
  return (
    <button type="button" onClick={() => void abrir()} disabled={estado === "abrindo"}
      className="flex w-60 max-w-full items-center gap-2 rounded-md bg-black/5 px-2 py-1.5 text-left hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10">
      <FileText className="h-6 w-6 shrink-0 text-sky-500" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium">{nomeArquivo || "Documento"}</span>
        <span className="text-[10.5px] opacity-70">{estado === "abrindo" ? "baixando…" : "clique para abrir"}</span>
      </span>
      {estado === "abrindo" && <Loader2 className="h-4 w-4 animate-spin" />}
    </button>
  );
}

// Foto de perfil da pessoa ou do grupo (16/10), pelo receptor do WhatsApp (/foto/<chat_id>);
// sem foto (ou fora do app do Mac), a bolinha com a inicial / o ícone de grupo de sempre.
export function FotoChat({ chatId, nome, grupo, tamanho = "h-9 w-9" }: { chatId: string; nome: string | null; grupo: boolean; tamanho?: string }) {
  const conta = useContext(ContaWhatsapp);
  const [cfg, setCfg] = useState<{ base: string; chave: string } | null>(null);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    if (!isDesktop()) return;
    void midiaBaseDe(conta).then(setCfg);
  }, [conta]);
  const src = cfg && !falhou ? `${cfg.base.replace(/\/midia\/$/, "/foto/")}${encodeURIComponent(chatId)}?k=${cfg.chave}` : null;
  return (
    <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[12px] font-semibold text-white", tamanho, grupo ? "bg-teal-600" : "bg-emerald-500")}>
      {grupo ? <Users className="h-4 w-4" /> : (nome ?? "?").slice(0, 1).toUpperCase()}
      {src && <img src={src} alt="" loading="lazy" onError={() => setFalhou(true)} className="absolute inset-0 h-full w-full object-cover" />}
    </span>
  );
}

const paraBase64 = (blob: Blob) => new Promise<string>((ok, erro) => {
  const leitor = new FileReader();
  leitor.onload = () => ok(String(leitor.result).split(",")[1] ?? "");
  leitor.onerror = () => erro(leitor.error);
  leitor.readAsDataURL(blob);
});

const CHAVE_VISTAS = "jarvis:whatsapp-vistas";
const CHAVE_ABERTA = "jarvis:whatsapp-conversa-aberta";
const lerVistas = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(CHAVE_VISTAS) || "{}"); } catch { return {}; } };
const ROTULO_TIPO: Record<string, string> = { imagem: "📷 Foto", video: "🎥 Vídeo", documento: "📄 Documento", figurinha: "Figurinha", outro: "Mensagem" };

const horaCurta = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "ontem";
  return format(d, "dd/MM");
};
const resumo = (c: Conversa) => {
  const pre = c.ultima_de_mim ? "Você: " : c.eh_grupo && c.ultima_autor ? `${c.ultima_autor.split(" ")[0]}: ` : "";
  const corpo = c.ultima_tipo === "audio" ? `🎤 ${c.ultima_texto ?? "Áudio"}` : c.ultima_tipo !== "texto" ? (ROTULO_TIPO[c.ultima_tipo] ?? "Mensagem") : c.ultima_texto ?? "";
  return pre + corpo;
};

// Acha a conversa de um card do painel: pelo telefone (últimos 8 dígitos,
// que não mudam com o 9 extra) ou, se não tiver, pelo nome.
function acharConversa(conversas: Conversa[], nome: string, when: string): Conversa | null {
  const numeros = (when.match(/\+?\d[\d\s().-]{8,}\d/g) || []).map((d) => d.replace(/\D/g, "")).filter((d) => d.length >= 10);
  for (const n of numeros) {
    const c = conversas.find((x) => x.chat_id.split("@")[0].replace(/\D/g, "").endsWith(n.slice(-8)));
    if (c) return c;
  }
  const alvo = nome.trim().toLowerCase();
  if (!alvo) return null;
  return conversas.find((x) => (x.chat_nome ?? "").trim().toLowerCase() === alvo)
    ?? conversas.find((x) => { const n = (x.chat_nome ?? "").trim().toLowerCase(); return !!n && (n.includes(alvo) || alvo.includes(n)); })
    ?? null;
}

/** `info`: coluna ao lado da conversa aberta com o que se sabe daquele grupo ou pessoa (19/10, Davi:
 *  "ao clicar no grupo aparecem as informações dele, focado neles; não precisa abrir do lado"). */
type PropsConversas = {
  /** Qual número: "principal" (padrão) ou "pessoal". */
  conta?: string;
  /** Tela grande (guia WhatsApp do projeto, ⌘⌥W): igual ao WhatsApp Web — lista sempre à esquerda. */
  tela?: boolean;
  pedido?: { nome: string; when: string; n: number } | null;
  info?: (c: { chat_id: string; chat_nome: string | null; eh_grupo: boolean }) => React.ReactNode;
  /** Etiquetas ao lado do nome na lista (Precisa responder, Risco de churn…). */
  /** Quem é da equipe (nome do autor no grupo): mensagem nova deles não é "pra você". */
  ehEquipe?: (nome: string | null) => boolean;
  etiquetas?: (c: { chat_id: string; chat_nome: string | null; eh_grupo: boolean; ultima_em: string; ultima_de_mim: boolean; ultima_texto: string | null; ultima_tipo: string; ultima_autor: string | null }) => React.ReactNode;
};
/** Mensagem nova é para o Davi? Privado sempre; grupo só se fala com ele e não veio da equipe. */
function paraODavi(c: ConversaResumo, ehEquipe?: (nome: string | null) => boolean): boolean {
  if (c.eh_grupo && ehEquipe?.(c.ultima_autor)) return false;
  return ehComODavi(c);
}

export function WhatsappConversas(props: PropsConversas = {}) {
  return <ContaWhatsapp.Provider value={props.conta ?? "principal"}><ListaConversas {...props} /></ContaWhatsapp.Provider>;
}

function ListaConversas({ pedido, info, etiquetas, ehEquipe, tela }: PropsConversas) {
  const conta = useContext(ContaWhatsapp);
  const chaveAberta = conta === "principal" ? CHAVE_ABERTA : `${CHAVE_ABERTA}:${conta}`;
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  // A conversa aberta continua aberta ao sair e voltar (fechar o Atlas,
  // trocar de guia ou de "Painel"/"Conversas").
  const [aberta, setAbertaEstado] = useState<Conversa | null>(() => {
    try { return JSON.parse(localStorage.getItem(chaveAberta) || "null"); } catch { return null; }
  });
  const setAberta = (c: Conversa | null) => {
    setAbertaEstado(c);
    try { if (c) localStorage.setItem(chaveAberta, JSON.stringify(c)); else localStorage.removeItem(chaveAberta); } catch { /* sem storage */ }
  };
  const [vistas, setVistas] = useState(lerVistas);

  const carregarConversas = useCallback(async () => {
    const { data } = await (supabase as unknown as SupabaseClient).rpc("whatsapp_conversas", { p_conta: conta });
    setConversas(((data || []) as Conversa[]).sort((a, b) => b.ultima_em.localeCompare(a.ultima_em)));
    setCarregando(false);
  }, [conta]);

  useEffect(() => { void carregarConversas(); }, [carregarConversas]);

  // Ao vivo: qualquer mensagem nova (ou transcrição pronta) atualiza a lista.
  const [novidade, setNovidade] = useState<Mensagem | null>(null);
  useEffect(() => {
    const canal = supabase.channel(`jarvis-whatsapp-conversas-${conta}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_mensagens" }, (ev) => {
        const de = (ev.new as { conta?: string } | null)?.conta;
        if (de && de !== conta) return;   // mensagem do outro número
        void carregarConversas();
        if (ev.new && (ev.new as Mensagem).id) setNovidade(ev.new as Mensagem);
      })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [carregarConversas, conta]);

  const marcarVista = useCallback((chatId: string, quando: string) => {
    setVistas((v) => {
      if (v[chatId] && v[chatId] >= quando) return v;
      const novo = { ...v, [chatId]: quando };
      try { localStorage.setItem(CHAVE_VISTAS, JSON.stringify(novo)); } catch { /* sem storage */ }
      return novo;
    });
  }, []);

  // Pedido do painel (modo Dividido): abre a conversa daquele card.
  const pedidoAtendido = useRef(0);
  useEffect(() => {
    if (!pedido || pedido.n === pedidoAtendido.current || carregando) return;
    pedidoAtendido.current = pedido.n;
    const c = acharConversa(conversas, pedido.nome, pedido.when);
    if (c) { setAberta(c); marcarVista(c.chat_id, c.ultima_em); }
    else toast.error(`Não achei a conversa de ${pedido.nome} no WhatsApp do Mac`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, conversas, carregando]);

  // Quantas mensagens novas em cada conversa (20/10, Davi: "aparecer o número, como no WhatsApp"):
  // as que chegaram depois da última vez que ele abriu a conversa e depois da última resposta dele.
  const [novas, setNovas] = useState<Record<string, number>>({});
  const chaveNovas = conversas.filter((c) => !c.ultima_de_mim && (!vistas[c.chat_id] || vistas[c.chat_id] < c.ultima_em))
    .map((c) => `${c.chat_id}|${c.ultima_em}|${vistas[c.chat_id] ?? ""}`).join(",");
  useEffect(() => {
    const alvo = conversas.filter((c) => !c.ultima_de_mim && (!vistas[c.chat_id] || vistas[c.chat_id] < c.ultima_em)).slice(0, 60);
    if (!alvo.length) { setNovas({}); return; }
    const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();
    void (supabase as unknown as SupabaseClient).from("whatsapp_mensagens").select("chat_id, de_mim, enviada_em")
      .eq("conta", conta).in("chat_id", alvo.map((c) => c.chat_id)).gte("enviada_em", desde)
      .order("enviada_em", { ascending: false }).limit(3000)
      .then(({ data }) => {
        const conta_: Record<string, number> = {};
        const parou = new Set<string>();
        for (const m of (data || []) as { chat_id: string; de_mim: boolean; enviada_em: string }[]) {
          if (parou.has(m.chat_id)) continue;
          const vista = vistas[m.chat_id];
          if (m.de_mim || (vista && m.enviada_em <= vista)) { parou.add(m.chat_id); continue; }
          conta_[m.chat_id] = (conta_[m.chat_id] ?? 0) + 1;
        }
        setNovas(conta_);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveNovas, conta]);

  // Arquivar e pastas (20/10, Davi: "no meu WhatsApp eu consigo arquivar; aqui está tudo junto" e
  // "conseguir criar pastas"). Arquivada some da lista e fica em "Arquivadas"; a busca acha todas.
  const [infoAberta, setInfoAberta] = useState(() => { try { return localStorage.getItem("whatsapp:painel-conversa") !== "fechado"; } catch { return true; } });
  const mudarInfo = (v: boolean) => { setInfoAberta(v); try { localStorage.setItem("whatsapp:painel-conversa", v ? "aberto" : "fechado"); } catch { /* sem storage */ } };
  const org = useOrganizacaoWhatsapp(conta);
  const agoraLista = new Date();
  const [visao, setVisao] = useState<{ tipo: "tudo" } | { tipo: "pasta"; id: string } | { tipo: "arquivadas" }>({ tipo: "tudo" });
  const [menuDe, setMenuDe] = useState<string | null>(null);
  const qtdArquivadas = conversas.filter((c) => org.arquivada(c.chat_id)).length;
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (t) return conversas.filter((c) => (c.chat_nome ?? c.chat_id).toLowerCase().includes(t));
    if (visao.tipo === "arquivadas") return conversas.filter((c) => org.arquivada(c.chat_id));
    const ativas = conversas.filter((c) => !org.arquivada(c.chat_id));
    // 24/10 (Davi: "o Geral precisa ser todas as mensagens"): o Geral mostra todas (menos as arquivadas),
    // inclusive as que estão em pastas; a pasta é um atalho para ver só aquele grupo.
    return visao.tipo === "pasta" ? ativas.filter((c) => org.pastaDe(c.chat_id) === visao.id) : ativas;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversas, busca, visao, org.arquivada, org.pastaDe, org.pastas]);
  useEffect(() => {
    if (visao.tipo === "pasta" && !org.pastas.some((p) => p.id === visao.id)) setVisao({ tipo: "tudo" });
  }, [org.pastas, visao]);
  const novaPasta = async (chatId?: string) => {
    const nome = await pedirTexto("Nome da pasta (ex.: Família, Condomínio, Ofertas)");
    if (!nome?.trim()) return;
    const id = await org.criarPasta(nome);
    if (id && chatId) void org.moverParaPasta(chatId, id);
    if (id && !chatId) setVisao({ tipo: "pasta", id });
  };
  const naoLidasDa = (pastaId: string) => conversas.filter((c) => org.pastaDe(c.chat_id) === pastaId && !org.arquivada(c.chat_id)
    && !c.ultima_de_mim && (!vistas[c.chat_id] || vistas[c.chat_id] < c.ultima_em)).length;
  const menuDaConversa = (c: Conversa) => {
    const arq = org.arquivada(c.chat_id);
    const pastaAtual = org.pastaDe(c.chat_id);
    return (
      <DropdownMenu open={menuDe === c.chat_id} onOpenChange={(a) => setMenuDe(a ? c.chat_id : null)}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Opções da conversa" onClick={(e) => e.stopPropagation()}
            className={cn("rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground",
              menuDe === c.chat_id ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
            <ChevronDown className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="w-52">
          <DropdownMenuItem onSelect={() => void org.arquivar(c.chat_id, !arq)}>
            {arq ? <><ArchiveRestore className="mr-2 h-4 w-4" />Desarquivar</> : <><Archive className="mr-2 h-4 w-4" />Arquivar conversa</>}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><Folder className="mr-2 h-4 w-4" />Mover para pasta</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              {org.pastas.map((p) => (
                <DropdownMenuItem key={p.id} onSelect={() => void org.moverParaPasta(c.chat_id, p.id)} className={cn(pastaAtual === p.id && "font-semibold")}>
                  {p.nome}{pastaAtual === p.id ? " ✓" : ""}
                </DropdownMenuItem>
              ))}
              {org.pastas.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={() => void novaPasta(c.chat_id)}><FolderPlus className="mr-2 h-4 w-4" />Nova pasta…</DropdownMenuItem>
              {pastaAtual && <DropdownMenuItem onSelect={() => void org.moverParaPasta(c.chat_id, null)}><X className="mr-2 h-4 w-4" />Tirar da pasta</DropdownMenuItem>}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };
  const pastaAtiva = visao.tipo === "pasta" ? org.pastas.find((p) => p.id === visao.id) : null;

  const lista = (
    <div className="flex h-full flex-col">
      <div className="relative mx-3 mb-2">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar ou começar uma nova conversa"
          className={cn("w-full rounded-lg bg-muted pl-8 pr-2 outline-none focus:ring-1 focus:ring-emerald-500/40", tela ? "h-9 text-[13px]" : "h-8 text-[12px]")} />
      </div>
      {visao.tipo === "arquivadas" ? (
        <button type="button" onClick={() => setVisao({ tipo: "tudo" })}
          className="mx-3 mb-1 flex items-center gap-2 rounded-md px-1 py-1.5 text-left text-[13px] font-semibold hover:bg-muted/70">
          <ArrowLeft className="h-4 w-4" /> Arquivadas
        </button>
      ) : (
        <div className="mx-3 mb-1.5 flex flex-wrap items-center gap-1.5">
          {[{ id: null as string | null, nome: "Geral" }, ...org.pastas].map((p) => {
            const ativa = p.id ? visao.tipo === "pasta" && visao.id === p.id : visao.tipo === "tudo";
            // 24/10 (Davi): quantas conversas tem e quantas estão sem resposta sua (a última é da pessoa).
            const daPasta = conversas.filter((c) => !org.arquivada(c.chat_id) && (!p.id || org.pastaDe(c.chat_id) === p.id));
            const semResposta = daPasta.filter((c) => esperaSuaResposta(c, agoraLista, ehEquipe)).length;
            const novas = p.id ? naoLidasDa(p.id) : 0;
            return (
              <button key={p.id ?? "tudo"} type="button" onClick={() => setVisao(p.id ? { tipo: "pasta", id: p.id } : { tipo: "tudo" })}
                title={`${daPasta.length} ${daPasta.length === 1 ? "conversa" : "conversas"} · ${semResposta} sem resposta sua${novas ? ` · ${novas} com mensagem nova` : ""}`}
                className={cn("flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                  ativa ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground hover:text-foreground")}>
                {p.nome}
                <span className="text-[10.5px] font-normal opacity-60">{daPasta.length}</span>
                {semResposta > 0 && <span className="rounded-full bg-orange-500 px-1.5 text-[10px] font-semibold text-white">{semResposta} sem resposta</span>}
              </button>
            );
          })}
          <button type="button" onClick={() => void novaPasta()} title="Nova pasta"
            className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-dashed text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" /></button>
          {pastaAtiva && (
            <span className="ml-auto flex gap-0.5">
              <button type="button" title="Renomear pasta" onClick={async () => { const n = await pedirTexto("Novo nome da pasta", pastaAtiva.nome); if (n) void org.renomearPasta(pastaAtiva.id, n); }}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
              <button type="button" title="Apagar pasta (as conversas voltam para Geral)" onClick={async () => { if (await confirmar(`Apagar a pasta "${pastaAtiva.nome}"? As conversas dela voltam para Geral.`, { botao: "Apagar pasta", destrutivo: true })) void org.apagarPasta(pastaAtiva.id); }}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
            </span>
          )}
        </div>
      )}
      {visao.tipo === "tudo" && !busca.trim() && qtdArquivadas > 0 && (
        <button type="button" onClick={() => setVisao({ tipo: "arquivadas" })}
          className="flex items-center gap-3 px-4 py-2 text-left text-[13px] text-muted-foreground hover:bg-muted/70">
          <Archive className="h-4 w-4 text-emerald-600" /><span className="flex-1 font-medium text-foreground">Arquivadas</span><span className="text-[12px]">{qtdArquivadas}</span>
        </button>
      )}
      {carregando ? (
        <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : filtradas.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          {busca.trim() ? "Nenhuma conversa com esse nome." : visao.tipo === "pasta" ? "Pasta vazia. Para pôr uma conversa aqui: setinha da conversa (ou botão direito) › Mover para pasta."
            : visao.tipo === "arquivadas" ? "Nenhuma conversa arquivada." : conversas.length ? "Todas as conversas estão arquivadas." : "Nenhuma mensagem ainda. Elas chegam pelo WhatsApp conectado no Mac."}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtradas.map((c) => {
            const naoLida = !c.ultima_de_mim && (!vistas[c.chat_id] || vistas[c.chat_id] < c.ultima_em);
            return (
              <div key={c.chat_id} role="button" tabIndex={0} onClick={() => { setAberta(c); marcarVista(c.chat_id, c.ultima_em); }}
                onKeyDown={(e) => { if (e.key === "Enter") { setAberta(c); marcarVista(c.chat_id, c.ultima_em); } }}
                onContextMenu={(e) => { e.preventDefault(); setMenuDe(c.chat_id); }}
                className={cn("group flex w-full cursor-pointer items-center text-left hover:bg-muted/70", tela ? "gap-3 px-3 py-2.5" : "gap-2.5 border-b border-border/60 px-3 py-2",
                  aberta?.chat_id === c.chat_id && "bg-muted")}>
                <FotoChat chatId={c.chat_id} nome={c.chat_nome} grupo={c.eh_grupo} tamanho={tela ? "h-12 w-12" : undefined} />
                <span className={cn("min-w-0 flex-1", tela && "border-b border-border/50 pb-2.5")}>
                  {/* Nome e hora em cima, a mensagem no meio e as etiquetas embaixo (20/10, Davi: "preciso
                      que as etiquetas apareçam embaixo do nome; hoje preciso ir para o lado"). */}
                  <span className="flex items-baseline gap-2">
                    <span className={cn("min-w-0 flex-1 truncate", tela ? "text-[15px]" : "text-[13px]", naoLida ? "font-semibold" : "font-medium")}>{c.chat_nome ?? c.chat_id.split("@")[0]}</span>
                    <span className={cn("shrink-0 text-[10.5px]", naoLida ? "font-semibold text-emerald-600" : "text-muted-foreground")}>{horaCurta(c.ultima_em)}</span>
                    {menuDaConversa(c)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("flex min-w-0 flex-1 items-center gap-1 truncate text-muted-foreground", tela ? "text-[13.5px]" : "text-[11.5px]")}>
                      {c.ultima_de_mim && <CheckCheck className="h-3.5 w-3.5 shrink-0 text-sky-500" />}
                      <span className="truncate">{resumo(c)}</span>
                    </span>
                    {naoLida && (
                      <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[11px] font-semibold leading-none text-white"
                        aria-label={`${novas[c.chat_id] ?? 1} mensage${(novas[c.chat_id] ?? 1) === 1 ? "m nova" : "ns novas"}`}>
                        {(novas[c.chat_id] ?? 0) > 99 ? "99+" : novas[c.chat_id] || ""}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1 empty:hidden">
                      {/* 19/10 (Davi): etiqueta "Mensagem nova" para o que chegou e ainda não foi aberto. */}
                      {/* 20/10 (Davi): "mesmo quando receber mensagem, identifique se é para mim ou não". */}
                      {naoLida && conta === "principal" && (paraODavi(c, ehEquipe)
                        ? <span className="whitespace-nowrap rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white" title="Conversa privada ou mensagem que fala com você">Mensagem nova · pra você</span>
                        : <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground" title={c.eh_grupo && ehEquipe?.(c.ultima_autor) ? "Quem mandou é da equipe" : "Mensagem do grupo que não fala com você (é para o CS)"}>{c.eh_grupo && ehEquipe?.(c.ultima_autor) ? "Mensagem nova · equipe" : "Mensagem nova · CS"}</span>)}
                      {etiquetas?.(c)}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
);

  // 20/10 (Davi): "quando abro uma conversa, ele não fecha: fica aberto na lateral o contato" —
  // como no WhatsApp Web, a lista continua à esquerda e a conversa abre do lado.
  if (tela && !aberta) {
    return (
      <ResizablePanelGroup direction="horizontal" autoSaveId={info ? "jarvis:whatsapp-lista-vazia-info" : "jarvis:whatsapp-lista-conversa"} className="h-full">
        <ResizablePanel defaultSize={34} minSize={18} className="min-w-0 pt-1">{lista}</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={66} minSize={28} className="min-w-0">
          <div className="flex h-full flex-col items-center justify-center gap-2 border-l bg-muted/40 text-center text-muted-foreground">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600"><MessageCircle className="h-8 w-8" /></span>
            <p className="text-lg font-light text-foreground">WhatsApp</p>
            <p className="max-w-xs text-[13px]">Escolha uma conversa na lista para ler e responder.</p>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  if (aberta) {
    const comInfo = !!info && infoAberta;
    const abrirPrivado = (numeros: string[]) => {
      const c = conversas.find((x) => !x.eh_grupo && numeros.includes(x.chat_id.split("@")[0]));
      if (c) { setAberta(c); marcarVista(c.chat_id, c.ultima_em); }
      return !!c;
    };
    const chat = (
      <AbrirPrivado.Provider value={abrirPrivado}>
        <Conversa key={aberta.chat_id} conversa={aberta} novidade={novidade} onVoltar={() => setAberta(null)} onVista={marcarVista} />
      </AbrirPrivado.Provider>
    );
    return (
      <div className="flex h-full">
      <ResizablePanelGroup direction="horizontal" autoSaveId={comInfo ? "jarvis:whatsapp-lista-conversa-info" : "jarvis:whatsapp-lista-conversa"} className="h-full min-w-0 flex-1">
        <ResizablePanel defaultSize={comInfo ? 26 : 34} minSize={18} className="min-w-0 pt-1">{lista}</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={comInfo ? 46 : 66} minSize={28} className="min-w-0">{chat}</ResizablePanel>
        {comInfo && (
          <>
            {/* Informações à direita da conversa (24/10, Davi: "a mensagem no meio e a inteligência no lado direito").
                26/10: dá para encolher (fica uma faixa fina com o botão de abrir de novo). */}
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={28} minSize={16} className="min-w-0">
              <div className="flex h-full flex-col">
                <div className="flex justify-end px-2 pt-1">
                  <button type="button" onClick={() => mudarInfo(false)} title="Encolher o painel"
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><PanelRightClose className="h-4 w-4" /></button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{info!(aberta)}</div>
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      {info && !infoAberta && (
        <button type="button" onClick={() => mudarInfo(true)} title="Abrir o painel da conversa"
          className="flex w-8 shrink-0 flex-col items-center gap-2 border-l border-border pt-2 text-muted-foreground hover:bg-accent hover:text-foreground">
          <PanelRightOpen className="h-4 w-4" />
          <span className="text-[11px] font-medium [writing-mode:vertical-rl]">Painel da conversa</span>
        </button>
      )}
      </div>
    );
  }

  return lista;
}

function Conversa({ conversa, novidade, onVoltar, onVista }: {
  conversa: Conversa; novidade: Mensagem | null; onVoltar: () => void; onVista: (chatId: string, quando: string) => void;
}) {
  const conta = useContext(ContaWhatsapp);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregando, setCarregando] = useState(true);
  // Rascunho por conversa (sobrevive a fechar o Atlas) e erro visível aqui
  // mesmo (o aviso flutuante nem sempre aparece na janela do Atlas).
  const chaveRascunho = `jarvis:whatsapp-rascunho:${conversa.chat_id}`;
  const [texto, setTextoEstado] = useState(() => { try { return localStorage.getItem(chaveRascunho) ?? ""; } catch { return ""; } });
  const setTexto = (valor: string) => {
    setTextoEstado(valor);
    try { if (valor) localStorage.setItem(chaveRascunho, valor); else localStorage.removeItem(chaveRascunho); } catch { /* sem storage */ }
  };
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const urlDe = useMidiaUrl();
  const [ampliada, setAmpliada] = useState<string | null>(null);

  // Gravar áudio (microfone): clica pra começar, depois Enviar ou lixeira.
  const [gravando, setGravando] = useState<{ inicio: number } | null>(null);
  const [segundos, setSegundos] = useState(0);
  const gravadorRef = useRef<MediaRecorder | null>(null);
  const pedacosRef = useRef<Blob[]>([]);
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSegundos(Math.floor((Date.now() - gravando.inicio) / 1000)), 250);
    return () => clearInterval(t);
  }, [gravando]);
  useEffect(() => () => { gravadorRef.current?.stream.getTracks().forEach((t) => t.stop()); }, []);

  const comecarGravacao = async () => {
    setErroEnvio(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
      const gravador = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      pedacosRef.current = [];
      gravador.ondataavailable = (e) => { if (e.data.size) pedacosRef.current.push(e.data); };
      gravador.start(250);
      gravadorRef.current = gravador;
      setSegundos(0);
      setGravando({ inicio: Date.now() });
    } catch {
      setErroEnvio("Não consegui usar o microfone. Libere em Ajustes do Sistema → Privacidade → Microfone.");
    }
  };

  const pararGravacao = () => new Promise<Blob | null>((ok) => {
    const gravador = gravadorRef.current;
    gravadorRef.current = null;
    setGravando(null);
    if (!gravador) { ok(null); return; }
    gravador.onstop = () => {
      gravador.stream.getTracks().forEach((t) => t.stop());
      ok(new Blob(pedacosRef.current, { type: gravador.mimeType || "audio/mp4" }));
    };
    gravador.stop();
  });

  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const mudarPendente = (id: string, mudanca: Partial<Pendente> | null) =>
    setPendentes((l) => (mudanca ? l.map((p) => (p.id === id ? { ...p, ...mudanca } : p)) : l.filter((p) => p.id !== id)));
  useEffect(() => setPendentes([]), [conversa.chat_id]);

  const mandar = async (p: Pendente) => {
    mudarPendente(p.id, { estado: "enviando", erro: undefined });
    setErroEnvio(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      if (p.tipo === "audio" && p.audio) {
        await invoke("whatsapp_enviar_audio", { chatId: conversa.chat_id, base64: await paraBase64(p.audio), mimetype: p.audio.type.split(";")[0], conta });
      } else if (p.tipo === "arquivo" && p.arquivo) {
        await invoke("whatsapp_enviar_arquivo", {
          chatId: conversa.chat_id, base64: await paraBase64(p.arquivo), mimetype: p.arquivo.type || "application/octet-stream",
          nome: p.arquivo.name || "arquivo", legenda: p.texto || null, conta,
        });
      } else {
        await invoke("whatsapp_enviar", { chatId: conversa.chat_id, texto: p.texto, conta, responderA: p.responderA ?? null });
      }
      mudarPendente(p.id, { estado: "enviada" });
    } catch (e) {
      const msg = typeof e === "string" ? e : e instanceof Error ? e.message : "Não consegui enviar";
      mudarPendente(p.id, { estado: "erro", erro: msg });
      toast.error(msg);
    }
  };

  const enviarAudio = async () => {
    const audio = await pararGravacao();
    if (!audio || audio.size < 1000) return;
    // O balão provisório já toca o áudio gravado (24/10, Davi: "não consigo ouvir meu próprio áudio").
    const p: Pendente = { id: crypto.randomUUID(), tipo: "audio", texto: "", criada: new Date().toISOString(), estado: "enviando", audio, audioUrl: URL.createObjectURL(audio) };
    setPendentes((l) => [...l, p]);
    void mandar(p);
  };
  const fimRef = useRef<HTMLDivElement>(null);
  const podeEnviar = isDesktop();

  useEffect(() => {
    let cancelado = false;
    void (supabase as unknown as SupabaseClient).from("whatsapp_mensagens")
      .select("id, chat_id, chat_nome, eh_grupo, de_mim, autor_nome, autor_id, tipo, texto, transcricao, transcricao_status, enviada_em, midia_arquivo, responde_a")
      .eq("chat_id", conversa.chat_id).eq("conta", conta).order("enviada_em", { ascending: false }).limit(200)
      .then(({ data }) => {
        if (cancelado) return;
        setMensagens(((data || []) as Mensagem[]).reverse());
        setCarregando(false);
      });
    return () => { cancelado = true; };
  }, [conversa.chat_id, conta]);

  // Mensagem nova (ou transcrição pronta) desta conversa, ao vivo.
  useEffect(() => {
    if (!novidade || novidade.chat_id !== conversa.chat_id) return;
    setMensagens((atual) => {
      const i = atual.findIndex((m) => m.id === novidade.id);
      if (i >= 0) { const copia = [...atual]; copia[i] = { ...copia[i], ...novidade }; return copia; }
      return [...atual, novidade].sort((a, b) => a.enviada_em.localeCompare(b.enviada_em));
    });
    onVista(conversa.chat_id, novidade.enviada_em);
  }, [novidade, conversa.chat_id, onVista]);

  useLayoutEffect(() => { fimRef.current?.scrollIntoView({ block: "end" }); }, [mensagens.length, carregando, pendentes.length]);

  // Arquivos arrastados, colados (⌘V) ou escolhidos no clipe: ficam numa bandeja acima do campo e vão
  // ao apertar Enviar — o texto digitado vira a legenda do primeiro (26/10).
  const [anexos, setAnexos] = useState<{ id: string; arquivo: File; url: string }[]>([]);
  const [soltando, setSoltando] = useState(false);
  const entradaArquivo = useRef<HTMLInputElement>(null);
  useEffect(() => setAnexos([]), [conversa.chat_id]);
  // Responder uma mensagem específica e as outras opções do menu da mensagem (26/10).
  const [respondendo, setRespondendo] = useState<Mensagem | null>(null);
  const [reacoes, setReacoes] = useState<Record<string, string>>({});
  const [editadas, setEditadas] = useState<Record<string, string>>({});
  const [apagadas, setApagadas] = useState<Set<string>>(new Set());
  const campoTexto = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setRespondendo(null); setReacoes({}); setEditadas({}); setApagadas(new Set()); }, [conversa.chat_id]);
  const acao = async (comando: string, args: Record<string, unknown>, erro: string) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke(comando, { ...args, conta });
      return true;
    } catch (e) {
      toast.error(typeof e === "string" ? e : erro);
      return false;
    }
  };
  const responder = (m: Mensagem) => { setRespondendo(m); requestAnimationFrame(() => campoTexto.current?.focus()); };
  const reagir = async (m: Mensagem, r: string) => {
    const nova = reacoes[m.id] === r ? "" : r;   // a mesma de novo tira a reação
    setReacoes((x) => ({ ...x, [m.id]: nova }));
    if (!(await acao("whatsapp_reagir", { messageId: m.id, reacao: nova }, "Não consegui reagir"))) setReacoes((x) => ({ ...x, [m.id]: reacoes[m.id] ?? "" }));
  };
  const copiar = (m: Mensagem) => { void navigator.clipboard.writeText(editadas[m.id] ?? m.texto ?? m.transcricao ?? ""); toast.success("Copiado"); };
  const encaminhar = async (m: Mensagem, c: { chat_id: string; chat_nome: string | null }) => {
    if (await acao("whatsapp_encaminhar", { chatId: c.chat_id, messageId: m.id }, "Não consegui encaminhar")) toast.success(`Encaminhada para ${c.chat_nome ?? "a conversa"}`);
  };
  const editar = async (m: Mensagem) => {
    const novo = await pedirTexto("Editar mensagem", editadas[m.id] ?? m.texto ?? "");
    if (!novo?.trim() || novo.trim() === (editadas[m.id] ?? m.texto ?? "").trim()) return;
    if (await acao("whatsapp_editar", { chatId: conversa.chat_id, messageId: m.id, texto: novo.trim() }, "Não consegui editar")) setEditadas((x) => ({ ...x, [m.id]: novo.trim() }));
  };
  const apagar = async (m: Mensagem) => {
    if (!(await confirmar("Apagar esta mensagem para todos?", { botao: "Apagar para todos", destrutivo: true, descricao: "Ela some para todo mundo na conversa." }))) return;
    if (await acao("whatsapp_apagar", { chatId: conversa.chat_id, messageId: m.id }, "Não consegui apagar")) setApagadas((x) => new Set(x).add(m.id));
  };
  const irParaMensagem = (id: string) => {
    const el = document.getElementById(`wa-msg-${id}`);
    if (!el) { toast.info("Essa mensagem é mais antiga do que as carregadas aqui."); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("ring-2", "ring-emerald-500");
    window.setTimeout(() => el.classList.remove("ring-2", "ring-emerald-500"), 1200);
  };
  const anexar = (lista: FileList | File[] | null | undefined) => {
    const novos = [...(lista ?? [])].filter((f) => {
      if (f.size > LIMITE_ARQUIVO) { toast.error(`"${f.name}" passa de 64 MB`); return false; }
      return f.size > 0;
    });
    if (novos.length) setAnexos((l) => [...l, ...novos.map((arquivo) => ({ id: crypto.randomUUID(), arquivo, url: URL.createObjectURL(arquivo) }))]);
  };
  const tirarAnexo = (id: string) => setAnexos((l) => l.filter((a) => a.id !== id));

  // A mensagem entra na conversa na hora (com o relógio) e o campo já fica livre para a próxima.
  const enviar = () => {
    const t = texto.trim();
    if (anexos.length) {
      const novos: Pendente[] = anexos.map((a, i) => ({ id: crypto.randomUUID(), tipo: "arquivo", texto: i === 0 ? t : "", criada: new Date().toISOString(), estado: "enviando", arquivo: a.arquivo, arquivoUrl: a.url }));
      setPendentes((l) => [...l, ...novos]);
      setAnexos([]);
      setTexto("");
      void (async () => { for (const p of novos) await mandar(p); })();
      return;
    }
    if (!t) return;
    const p: Pendente = { id: crypto.randomUUID(), tipo: "texto", texto: t, criada: new Date().toISOString(), estado: "enviando", responderA: respondendo?.id };
    setRespondendo(null);
    setPendentes((l) => [...l, p]);
    setTexto("");
    void mandar(p);
  };

  // A pendente sai quando a de verdade (minha, mesmo texto, depois dela) chega do WhatsApp.
  const aindaPendentes = pendentes.filter((p) => !mensagens.some((m) => m.de_mim
    && new Date(m.enviada_em).getTime() >= new Date(p.criada).getTime() - 5 * 60_000
    && (p.tipo === "audio" ? m.tipo === "audio"
      : p.tipo === "arquivo" ? m.tipo !== "texto" && m.tipo !== "audio" && new Date(m.enviada_em).getTime() >= new Date(p.criada).getTime() - 60_000
      : normTexto(m.texto) === normTexto(p.texto))));
  useEffect(() => {
    if (aindaPendentes.length !== pendentes.length) setPendentes(aindaPendentes);
  }, [aindaPendentes.length, pendentes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nome de cada número que já falou nesta conversa (para o @ quando o WhatsApp não souber o nome).
  const nomesDoChat = new Map(mensagens.filter((x) => x.autor_id && x.autor_nome).map((x) => [x.autor_id!.split("@")[0], x.autor_nome!]));
  let diaAnterior = "";
  return (
    <div className="relative flex h-full flex-col"
      onDragOver={podeEnviar ? (e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setSoltando(true); } } : undefined}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSoltando(false); }}
      onDrop={podeEnviar ? (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); anexar(e.dataTransfer.files); } setSoltando(false); } : undefined}>
      {soltando && (
        <div className="pointer-events-none absolute inset-1 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-emerald-500 bg-emerald-500/10 text-sm font-medium text-emerald-700 backdrop-blur-[1px] dark:text-emerald-300">
          Solte para enviar nesta conversa
        </div>
      )}
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-2 py-1.5">
        <button type="button" onClick={onVoltar} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Voltar às conversas">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <FotoChat chatId={conversa.chat_id} nome={conversa.chat_nome} grupo={conversa.eh_grupo} tamanho="h-8 w-8" />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{conversa.chat_nome ?? conversa.chat_id.split("@")[0]}</p>
          <p className="text-[10.5px] text-muted-foreground">{conversa.eh_grupo ? "Grupo" : `+${conversa.chat_id.split("@")[0]}`}</p>
        </div>
      </div>

      <div className="whatsapp-fundo min-h-0 flex-1 space-y-1 overflow-y-auto bg-[#efeae2] px-2.5 py-2 dark:bg-[#0b141a]">
        {carregando ? (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : mensagens.map((m, i) => {
          const dia = format(new Date(m.enviada_em), "EEEE, dd/MM", { locale: ptBR });
          const separador = dia !== diaAnterior;
          diaAnterior = dia;
          // Grupo (24/10, Davi): a foto de quem mandou ao lado, na 1ª mensagem de uma sequência da mesma pessoa.
          const anterior = mensagens[i - 1];
          const comFoto = m.eh_grupo && !m.de_mim;
          const primeiraDaSequencia = comFoto && (separador || !anterior || anterior.de_mim || anterior.autor_id !== m.autor_id);
          return (
            <div key={m.id}>
              {separador && <div className="my-2 text-center"><span className="rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">{dia}</span></div>}
              <div className={cn("flex", m.de_mim ? "justify-end" : "justify-start", comFoto && "items-start gap-1.5", primeiraDaSequencia && i > 0 && "mt-1.5")}>
                {comFoto && (primeiraDaSequencia && m.autor_id
                  ? <PerfilPessoa id={m.autor_id} nome={m.autor_nome}>
                      <button type="button" aria-label={`Ver ${m.autor_nome || "pessoa"}`} className="shrink-0 rounded-full"><FotoChat chatId={m.autor_id} nome={m.autor_nome} grupo={false} tamanho="h-7 w-7" /></button>
                    </PerfilPessoa>
                  : <span className="w-7 shrink-0" aria-hidden />)}
                <div id={`wa-msg-${m.id}`} onDoubleClick={podeEnviar ? () => responder(m) : undefined}
                  className={cn("group relative max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12.5px] leading-snug shadow-sm transition-shadow",
                  m.de_mim ? "bolha-minha bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]" : "bolha-outra bg-white text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]",
                  reacoes[m.id] && "mb-3")}>
                  {!apagadas.has(m.id) && (
                    <MenuMensagem m={m} podeEnviar={podeEnviar} onResponder={() => responder(m)} onReagir={(r) => void reagir(m, r)}
                      onCopiar={() => copiar(m)} onEncaminhar={(c) => void encaminhar(m, c)} onEditar={() => void editar(m)} onApagar={() => void apagar(m)} />
                  )}
                  {reacoes[m.id] && (
                    <span className={cn("absolute -bottom-3 rounded-full border border-border bg-background px-1 text-[12px] leading-5 shadow-sm", m.de_mim ? "right-2" : "left-2")}>{reacoes[m.id]}</span>
                  )}
                  {primeiraDaSequencia && (m.autor_id
                    ? <PerfilPessoa id={m.autor_id} nome={m.autor_nome}>
                        <button type="button" className="mb-0.5 block text-left text-[10.5px] font-semibold text-teal-600 hover:underline">{m.autor_nome || m.autor_id.split("@")[0]}</button>
                      </PerfilPessoa>
                    : <p className="mb-0.5 text-[10.5px] font-semibold text-teal-600">{m.autor_nome || "?"}</p>)}
                  {m.responde_a && (() => {
                    const citada = mensagens.find((x) => x.id === m.responde_a);
                    return (
                      <button type="button" onClick={() => irParaMensagem(m.responde_a!)}
                        className="mb-1 block w-full rounded-md border-l-4 border-teal-600 bg-black/5 px-2 py-1 text-left dark:bg-white/5">
                        <span className="block text-[10.5px] font-semibold text-teal-600">{citada ? (citada.de_mim ? "Você" : citada.autor_nome || conversa.chat_nome || "Mensagem") : "Mensagem"}</span>
                        <span className="line-clamp-2 text-[11px] opacity-80">{citada ? resumoDe(citada) : "mensagem anterior"}</span>
                      </button>
                    );
                  })()}
                  {apagadas.has(m.id) ? (
                    <p className="italic text-muted-foreground">🚫 Você apagou esta mensagem</p>
                  ) : editadas[m.id] ? (
                    <p className="whitespace-pre-wrap break-words">{editadas[m.id]} <span className="text-[9.5px] text-muted-foreground">(editada)</span></p>
                  ) : m.tipo === "audio" ? (
                    <div className="space-y-1">
                      {urlDe(m.midia_arquivo) ? (
                        <AudioMensagem url={urlDe(m.midia_arquivo)!} deMim={m.de_mim} />
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10.5px] font-medium text-muted-foreground"><Mic className="h-3 w-3" />Áudio{m.transcricao_status == null ? " (antigo, não guardado)" : ""}</span>
                      )}
                      {m.transcricao ? <p className="text-[12px]">{m.transcricao}</p>
                        : m.transcricao_status && <p className="text-[11.5px] italic text-muted-foreground">{m.transcricao_status === "erro" ? "não deu pra transcrever" : "transcrevendo…"}</p>}
                    </div>
                  ) : (m.tipo === "imagem" || m.tipo === "figurinha") && urlDe(m.midia_arquivo) ? (
                    <div className="space-y-1">
                      <button type="button" onClick={() => setAmpliada(urlDe(m.midia_arquivo))} className="block overflow-hidden rounded-md" aria-label="Ver foto">
                        <img src={urlDe(m.midia_arquivo)!} alt="" loading="lazy" className={cn("object-cover", m.tipo === "figurinha" ? "h-24 w-24" : "max-h-64 w-56 max-w-full")} />
                      </button>
                      {m.texto && <p className="whitespace-pre-wrap break-words"><TextoComMencoes texto={m.texto} nomes={nomesDoChat} /></p>}
                    </div>
                  ) : m.tipo === "video" && urlDe(m.midia_arquivo) ? (
                    <div className="space-y-1">
                      <video controls preload="metadata" src={urlDe(m.midia_arquivo)!} className="max-h-64 w-56 max-w-full rounded-md bg-black" />
                      {m.texto && <p className="whitespace-pre-wrap break-words"><TextoComMencoes texto={m.texto} nomes={nomesDoChat} /></p>}
                    </div>
                  ) : m.tipo === "documento" ? (
                    <DocumentoMensagem id={m.id} nome={m.texto} />
                  ) : m.tipo === "texto" ? (
                    <p className="whitespace-pre-wrap break-words">{m.texto && <TextoComMencoes texto={m.texto} nomes={nomesDoChat} />}</p>
                  ) : (
                    <p><span className="text-muted-foreground">{ROTULO_TIPO[m.tipo] ?? "Mensagem"}{m.midia_arquivo === null && m.tipo !== "outro" ? " (abra no celular)" : ""}</span>{m.texto ? ` ${m.texto}` : ""}</p>
                  )}
                  <p className="mt-0.5 flex items-center justify-end gap-1 text-[9.5px] text-muted-foreground">
                    {format(new Date(m.enviada_em), "HH:mm")}{m.de_mim && <Situacao estado="enviada" />}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {aindaPendentes.map((p) => (
          <div key={p.id} className="flex justify-end">
            <div className={cn("max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12.5px] leading-snug shadow-sm",
              "bolha-minha bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]", p.estado === "erro" && "ring-1 ring-rose-400")}>
              {p.tipo === "audio"
                ? (p.audioUrl ? <AudioMensagem url={p.audioUrl} deMim /> : <span className="inline-flex items-center gap-1 text-[11.5px]"><Mic className="h-3 w-3" />Áudio</span>)
                : p.tipo === "arquivo" && p.arquivo ? (
                  <div className="space-y-1">
                    {p.arquivo.type.startsWith("image/") && p.arquivoUrl
                      ? <img src={p.arquivoUrl} alt="" className="max-h-64 w-56 max-w-full rounded-md object-cover" />
                      : p.arquivo.type.startsWith("video/") && p.arquivoUrl
                        ? <video src={p.arquivoUrl} className="max-h-64 w-56 max-w-full rounded-md" muted />
                        : <span className="inline-flex items-center gap-1.5 text-[11.5px]"><FileText className="h-4 w-4" />{p.arquivo.name}</span>}
                    {p.texto && <p className="whitespace-pre-wrap break-words">{p.texto}</p>}
                  </div>
                )
                : <p className="whitespace-pre-wrap break-words">{p.texto}</p>}
              <p className="mt-0.5 flex items-center justify-end gap-1 text-[9.5px] text-muted-foreground">
                {format(new Date(p.criada), "HH:mm")}<Situacao estado={p.estado} />
              </p>
              {p.estado === "erro" && (
                <p className="mt-0.5 text-[10.5px] text-rose-600 dark:text-rose-400">
                  Não enviou: {p.erro}{" "}
                  <button type="button" onClick={() => void mandar(p)} className="font-semibold underline">tentar de novo</button>
                  {" · "}
                  <button type="button" onClick={() => { if (p.tipo === "texto" || (p.tipo === "arquivo" && p.texto)) setTexto(p.texto); mudarPendente(p.id, null); }} className="underline">desistir</button>
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={fimRef} />
      </div>

      {erroEnvio && <p className="border-t border-border bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-600 dark:text-rose-400">Não enviou: {erroEnvio}</p>}
      {ampliada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setAmpliada(null)}>
          <button type="button" className="absolute right-3 top-3 rounded-full bg-white/10 p-1.5 text-white" aria-label="Fechar"><X className="h-4 w-4" /></button>
          <img src={ampliada} alt="" className="max-h-full max-w-full rounded-md object-contain" />
        </div>
      )}
      {podeEnviar && gravando ? (
        <div className="flex items-center gap-2 border-t border-border p-2">
          <button type="button" onClick={() => void pararGravacao()} aria-label="Descartar áudio"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-rose-500">
            <Trash2 className="h-4 w-4" />
          </button>
          <span className="flex flex-1 items-center gap-2 text-[12.5px]">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-500" />
            Gravando {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, "0")}
          </span>
          <button type="button" onClick={() => void enviarAudio()} aria-label="Enviar áudio"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Send className="h-4 w-4" />
          </button>
        </div>
      ) : podeEnviar ? (
        <form className="border-t border-border p-2" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          {anexos.length > 0 && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {anexos.map((a) => (
                <div key={a.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted" title={a.arquivo.name}>
                  {a.arquivo.type.startsWith("image/") ? <img src={a.url} alt="" className="h-full w-full object-cover" />
                    : a.arquivo.type.startsWith("video/") ? <video src={a.url} className="h-full w-full object-cover" muted />
                    : <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-1 text-center text-[9px] leading-tight"><FileText className="h-4 w-4" /><span className="line-clamp-2 break-all">{a.arquivo.name}</span></span>}
                  <button type="button" onClick={() => tirarAnexo(a.id)} aria-label="Tirar"
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
          {respondendo && (
            <div className="mb-2 flex items-start gap-2 rounded-md border-l-4 border-teal-600 bg-muted/60 px-2 py-1">
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-semibold text-teal-600">Respondendo {respondendo.de_mim ? "você" : respondendo.autor_nome || conversa.chat_nome || ""}</p>
                <p className="line-clamp-2 text-[11px] text-muted-foreground">{resumoDe(respondendo)}</p>
              </div>
              <button type="button" onClick={() => setRespondendo(null)} aria-label="Cancelar resposta" className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <div className="flex items-end gap-1.5">
          <input ref={entradaArquivo} type="file" multiple className="hidden" onChange={(e) => { anexar(e.target.files); e.target.value = ""; }} />
          <button type="button" onClick={() => entradaArquivo.current?.click()} aria-label="Anexar foto, vídeo ou arquivo" title="Anexar (ou arraste / cole aqui)"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground">
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea ref={campoTexto} value={texto} onChange={(e) => setTexto(e.target.value)} rows={1}
            onPaste={(e) => { const fs = [...e.clipboardData.files]; if (fs.length) { e.preventDefault(); anexar(fs); } }}
            onKeyDown={(e) => { if (e.key === "Escape" && respondendo) { e.preventDefault(); setRespondendo(null); } if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
            placeholder={anexos.length ? "Legenda (opcional)…" : `Mensagem para ${conversa.chat_nome ?? "a conversa"}…`}
            className="max-h-28 min-h-[34px] flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary/50" />
          {/* Igual ao WhatsApp: sem texto, o botão grava áudio. */}
          {!texto.trim() && !anexos.length ? (
            <button type="button" onClick={() => void comecarGravacao()} aria-label="Gravar áudio"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Mic className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={!texto.trim() && !anexos.length} aria-label="Enviar"
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          )}
          </div>
        </form>
      ) : (
        <p className="border-t border-border p-2 text-center text-[11px] text-muted-foreground">Para responder, use o app do Mac (o WhatsApp está conectado nele).</p>
      )}
    </div>
  );
}
