import { useEffect, useMemo, useRef, useState } from "react";
import { useRascunho } from "@/hooks/useRascunho";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { Slice } from "@tiptap/pm/model";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowUp, AtSign, BookOpen, Network, Check, FileText, History, Loader2, MessageSquare, Pencil, Plus, Quote, Search, Settings2, Sparkles, Square, X } from "lucide-react";
import { RevisaoNoDocumento, acharTrecho, revisaoAtiva, trocarLinhas } from "./RevisaoNoDocumento";
import { MapaInteligenciaView } from "@/components/empresa/MapaInteligenciaView";
import { lerMapa, mapaParaTexto } from "@/lib/conteudo/mapaInteligencia";
import { CerebroEsteira, CriteriosEtapa } from "@/components/empresa/KanbanEsteira";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { isDesktop } from "@/lib/platform";
import { proximoNumeroHeadline } from "@/lib/conteudo/blocoReferencia";
import { cartoesDoHtml, escolherReferencias, palavrasDoPedido } from "@/lib/documentos/quadro";
import { alinhar } from "@/lib/conteudo/trechos";
import { acharCerebroDoPerfil, novoCerebroDoPerfil } from "@/lib/conteudo/perfisRoteiro";
import {
  ehRevisao, linhasDoTexto, montarPedido, montarRevisao, separarNotas, textoParaHtml,
  type AgenteEscrita, type CerebroEscrita, type Conversa, type FormatoEscrita, type Revisao,
} from "@/lib/conteudo/escritaAgentes";

// ⌘I no documento (19/10/2026, Davi): "ativa o modo chat; onde estiver o cursor é lá que começa a
// escrever, tipo o Claude; embaixo aparece a parte para conversar; além das skills aparecem o Leo
// (headline), o Junior (roteiros) e o Elias (revisão); selecionando Junior e Elias é um trabalho
// só". Cada um usa o mesmo contexto da esteira do escritório (critérios, formatos, skills, cérebro).
// O Claude roda no Mac (comando claude_escrever, src-tauri/src/escrita.rs).
// 24/10 (Davi): o ⌘I abre um painel de chat na lateral direita (como o Claude no Chrome). As respostas ficam
// só no chat (com Junior → Elias, cada um responde em sequência) e o Davi insere no documento se quiser.
// O "Gerar todos" continua escrevendo os roteiros direto no documento.
const db = supabase as unknown as SupabaseClient;

interface Etapa { nome: string; membro_id: string; criterios?: string | string[]; formatos?: FormatoEscrita[] }
interface Membro { id: string; nome: string; funcao: string | null; manual: string | null; visual: { pele?: string; camisa?: string } | null; mapa_inteligencia?: unknown }
interface SkillItem { id: string; agente: string; nome: string; caracteres: number | null }
interface Escritorio { id: string; nome: string; cliente_id: string; esteira: Etapa[]; cerebros: CerebroEscrita[] }

const ler = <T,>(chave: string, padrao: T): T => {
  try { const v = localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : padrao; } catch { return padrao; }
};
const gravar = (chave: string, v: unknown) => { try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* sem storage */ } };
const nomeSkill = (n: string) => n.replace(/^Skill:\s*/, "");

/** O escritório com esteira do projeto do documento (ou o primeiro que tiver), quem trabalha nele e as skills. */
function useEscritorio(clienteId: string | null, ativo: boolean) {
  const [esc, setEsc] = useState<Escritorio | null>(null);
  const [membros, setMembros] = useState<Record<string, Membro>>({});
  const [skills, setSkills] = useState<SkillItem[]>([]);
  useEffect(() => {
    if (!ativo || esc) return;
    void (async () => {
      const { data } = await db.from("setores").select("id, nome, cliente_id, esteira, cerebros").not("esteira", "is", null);
      const lista = ((data ?? []) as Escritorio[]).filter((s) => Array.isArray(s.esteira) && s.esteira.length);
      const s = lista.find((x) => x.cliente_id === clienteId) ?? lista[0];
      if (!s) return;
      const ids = s.esteira.map((e) => e.membro_id);
      const { data: ms } = await db.from("membros").select("id, nome, funcao, manual, visual, mapa_inteligencia").in("id", ids);
      const mapa = Object.fromEntries(((ms ?? []) as Membro[]).map((m) => [m.id, m]));
      const agentes = Object.values(mapa).map((m) => m.nome.trim().toLowerCase());
      const { data: sk } = await db.from("inteligencia_membros").select("id, agente, nome, caracteres")
        .in("agente", agentes).like("nome", "Skill:%").eq("status", "pronto")
        .or(`escopo.eq.geral,cliente_id.eq.${s.cliente_id}`).order("nome");
      setEsc({ ...s, cerebros: Array.isArray(s.cerebros) ? s.cerebros : [] });
      setMembros(mapa);
      setSkills((sk ?? []) as SkillItem[]);
    })();
  }, [ativo, clienteId, esc]);
  return { esc, membros, skills, setEsc, setMembros };
}

// ---------------------------------------------------------------- Claude no Mac, ao vivo
type Ouvinte = (p: { texto?: string | null; fim: boolean; erro?: string | null }) => void;
const ouvintes = new Map<string, Ouvinte>();
let escutando: Promise<void> | null = null;
function escutar() {
  escutando ??= (async () => {
    const { listen } = await import("@tauri-apps/api/event");
    await listen<{ id: string; texto?: string | null; fim: boolean; erro?: string | null }>("claude-escrita", (e) => {
      ouvintes.get(e.payload.id)?.(e.payload);
    });
  })();
  return escutando;
}

async function escreverComClaude(id: string, pedido: string, modelo: string, aoPedaco: (total: string) => void): Promise<string> {
  await escutar();
  const { invoke } = await import("@tauri-apps/api/core");
  return new Promise((resolver, rejeitar) => {
    let total = "";
    ouvintes.set(id, (p) => {
      if (p.texto) { total += p.texto; aoPedaco(total); }
      if (p.fim) {
        ouvintes.delete(id);
        if (p.erro) rejeitar(new Error(p.erro)); else resolver(total);
      }
    });
    invoke("claude_escrever", { id, pedido, modelo }).catch((e) => { ouvintes.delete(id); rejeitar(e); });
  });
}
const pararClaude = async (id: string) => {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("claude_escrever_parar", { id }).catch(() => undefined);
};

// ---------------------------------------------------------------- onde escreve no documento
interface Regiao { from: number; to: number; original: Slice; inline: boolean }
const MARCA = "docchat";   // transações da própria escrita (as outras empurram a região)

/** Cursor numa linha vazia: escreve nela. Cursor no meio de texto: logo abaixo do bloco.
 *  Palavra ou trecho dentro de um parágrafo: troca só aquele pedaço. Seleção de vários
 *  parágrafos: no lugar deles. A seleção vai junto no pedido. */
function regiaoInicial(editor: Editor): { regiao: Regiao; selecao: string | null; cursor: number } {
  const { state } = editor;
  const sel = state.selection;
  let from: number, to: number, selecao: string | null = null, inline = false;
  if (!sel.empty && sel.$from.parent === sel.$to.parent && sel.$from.parent.isTextblock) {
    from = sel.from; to = sel.to; inline = true;
    selecao = state.doc.textBetween(from, to, "\n");
  } else if (!sel.empty) {
    from = sel.$from.depth ? sel.$from.before(1) : sel.from;
    to = sel.$to.depth ? sel.$to.after(1) : sel.to;
    selecao = state.doc.textBetween(from, to, "\n");
  } else if (!sel.$from.depth) {
    from = to = sel.from;
  } else {
    const bloco = sel.$from.node(1);
    if (bloco.type.name === "paragraph" && !bloco.textContent.trim()) { from = sel.$from.before(1); to = sel.$from.after(1); }
    else from = to = sel.$from.after(1);
  }
  return { regiao: { from, to, original: state.doc.slice(from, to), inline }, selecao, cursor: from };
}

function trocarRegiao(editor: Editor, r: Regiao, texto: string | null, historico: boolean) {
  const antes = editor.state.doc.content.size;
  if (texto === null) {
    editor.view.dispatch(editor.state.tr.replace(r.from, r.to, r.original).setMeta("addToHistory", false).setMeta(MARCA, r));
  } else {
    const conteudo = r.inline ? { type: "text", text: texto.replace(/\s*\n\s*/g, " ") } : textoParaHtml(texto);
    editor.chain().setMeta("addToHistory", historico).setMeta(MARCA, r).insertContentAt({ from: r.from, to: r.to }, conteudo).run();
  }
  r.to += editor.state.doc.content.size - antes;
}

/** Se o Davi mexe no documento enquanto escrevem, a região anda junto (não escreve por cima). */
function seguirRegiao(editor: Editor, r: Regiao) {
  const aoMudar = ({ transaction: tr }: { transaction: import("@tiptap/pm/state").Transaction }) => {
    if (!tr.docChanged || tr.getMeta(MARCA) === r) return;   // as transações desta própria escrita
    r.from = tr.mapping.map(r.from, 1);
    r.to = Math.max(r.from, tr.mapping.map(r.to, -1));
  };
  editor.on("transaction", aoMudar);
  return () => { editor.off("transaction", aoMudar); };
}

// ---------------------------------------------------------------- roteiros do documento (gerar todos)
interface RoteiroVazio { numero: number; headline: string; link: string | null; depois: number }
const MARCA_ROTEIRO = /^\s*(?:roteiros?|headlines?)\s*#?\s*(\d{1,3})\s*[:.)\-–]?\s*(.*)$/i;
// Linhas que não contam como roteiro escrito: o link/ref da referência e títulos de apoio.
const LINHA_DE_APOIO = /^\s*(link( d[ae])? refer[eê]ncia|refer[eê]ncia|ref\b|\+\s*info|transcri[cç][aã]o|conte[uú]do not[aá]vel|por que)/i;

/** "ROTEIRO NN: headline" (ou "Headline NN") sem roteiro escrito embaixo, com o link de referência,
 *  e a posição logo depois da última linha preenchida da seção (onde o roteiro vai entrar). */
function roteirosVazios(editor: Editor): RoteiroVazio[] {
  const doc = editor.state.doc;
  const secoes: { numero: number; headline: string; blocos: { no: import("@tiptap/pm/model").Node; pos: number }[] }[] = [];
  doc.forEach((no, pos) => {
    const m = no.textContent.match(MARCA_ROTEIRO);
    if (m && no.textContent.length < 300) secoes.push({ numero: Number(m[1]), headline: m[2].trim(), blocos: [{ no, pos }] });
    else secoes[secoes.length - 1]?.blocos.push({ no, pos });
  });
  return secoes.flatMap((sec) => {
    const corpo = sec.blocos.slice(1);
    const escrito = corpo.filter((b) => b.no.textContent.trim() && !LINHA_DE_APOIO.test(b.no.textContent)).map((b) => b.no.textContent).join(" ");
    if (escrito.trim().length >= 40 || !sec.headline) return [];
    let link: string | null = null;
    for (const b of sec.blocos) {
      b.no.descendants((n) => {
        const href = n.marks.find((mk) => mk.type.name === "link")?.attrs.href as string | undefined;
        if (!link && href) link = href;
        return !link;
      });
      if (!link) link = b.no.textContent.match(/https?:\/\/\S+/)?.[0] ?? null;
    }
    const ultimo = [...sec.blocos].reverse().find((b) => b.no.textContent.trim()) ?? sec.blocos[0];
    return [{ numero: sec.numero, headline: sec.headline, link, depois: ultimo.pos + ultimo.no.nodeSize }];
  });
}

/** Transcrição do vídeo de referência: do banco de virais; se não estiver lá, transcreve no Mac. */
async function transcricaoDaReferencia(link: string): Promise<string | null> {
  const limpo = link.split("?")[0].replace(/\/$/, "");
  const { data } = await db.from("videos_referencia").select("transcricao_pt, transcricao")
    .or(`link_video.eq.${link},link_video.ilike.${limpo}%`).limit(1).maybeSingle();
  const doBanco = (data as { transcricao_pt?: string | null; transcricao?: string | null } | null);
  if (doBanco?.transcricao_pt || doBanco?.transcricao) return doBanco.transcricao_pt || doBanco.transcricao || null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const r = await invoke<{ texto?: string }>("creator_transcrever", { url: link, modo: "preciso" });
    return r.texto?.trim() || null;
  } catch {
    return null;   // sem referência: o Junior escreve só pela headline
  }
}

interface Passo { quem: string; etapa: string; texto: string }
interface Turno extends Conversa {
  id: string; erro?: string; selecao?: string | null;
  /** cada um que respondeu (Junior, depois Elias…); a resposta do turno é a do último */
  passos: Passo[]; rodando?: boolean; inserido?: boolean;
  /** documentos puxados com @ */
  citados?: Citado[];
}
interface Citado { id: string; titulo: string }
interface LinhaConversa {
  id: string; conversa: string; pedido: string; resposta: string; passos: Passo[] | null; selecao: string | null;
  citados: Citado[] | null; erro: string | null; inserido: boolean; created_at: string; titulo?: string | null;
}
/** Uma conversa na lista (como os "Recentes" do Claude). */
interface ItemConversa { id: string; titulo: string; chave: string; onde: string; quando: string; trocas: number }
const COLUNAS_CONVERSA = "id, conversa, pedido, resposta, passos, selecao, citados, erro, inserido, created_at, titulo";

/** Chamada de ferramenta escrita como texto (este chat não tem ferramentas): some da resposta. */
const semFerramentas = (t: string) => t.replace(/<(function_calls|invoke)[\s\S]*?(<\/\1>|$)/g, "").trim();
const AVISO_FERRAMENTA = "(Ele tentou usar uma ferramenta, que não existe neste chat. Pergunte de outro jeito.)";

/** HTML do documento (TipTap) em texto, um bloco por linha. */
function htmlParaTexto(html: string) {
  const limpo = html.replace(/^__NOTA_RAPIDA_V1__/, "").replace(/<\/(p|h[1-6]|li|blockquote|div)>|<br\s*\/?>/gi, "$&\n");
  const doc = new DOMParser().parseFromString(limpo, "text/html");
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}
const LARGURA_PAINEL = 400;
const LARGURA_MIN = 320;
const CHAVE_LARGURA = "docchat:largura";
const larguraMax = () => Math.max(LARGURA_MIN, Math.min(1000, Math.round(window.innerWidth * 0.65)));
const lerLargura = () => { try { const v = Number(localStorage.getItem(CHAVE_LARGURA)); return v >= LARGURA_MIN ? Math.min(v, larguraMax()) : LARGURA_PAINEL; } catch { return LARGURA_PAINEL; } };
interface Andamento { quem: string; etapa: string; fase: "pensando" | "escrevendo" | "revisando" }

/** `chave`: o documento (as revisões do Elias ficam guardadas por documento, neste Mac). */
// Perfis do roteiro (14/11, Davi): `perfil` é o perfil aberto no editor, `blocos` são os roteiros (só as headlines) dos OUTROS perfis do mesmo vídeo, que o @ oferece,
// e `pedidoCerebro` (um contador) abre o cérebro do perfil para cadastrar as informações dele.
export interface BlocoPerfil { chave: string; nome: string; headlines: { numero: number; titulo: string }[] }
export function ChatNoDocumento({ editor, clienteId, chave, perfil = null, blocos = [], pedidoCerebro = 0 }: { editor: Editor; clienteId: string | null; chave?: string | null; perfil?: { chave: string; nome: string } | null; blocos?: BlocoPerfil[]; pedidoCerebro?: number }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useRascunho(`docchat:${chave ?? "sem"}`);
  // 24/10 (Davi: "quero que fiquem salvos, a ideia é virar um super cérebro"): as conversas ficam no banco
  // (conversas_documento, só o dono vê), agrupadas por conversa; o + começa outra sem apagar a anterior.
  const chaveConversa = `docchat:conversa:${chave ?? "sem"}`;   // onde a 1ª versão guardava (neste Mac)
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [conversaId, setConversaId] = useState<string>(() => crypto.randomUUID());
  const [tituloConversa, setTituloConversa] = useState<string | null>(null);
  const conversaAtual = useRef(conversaId);
  useEffect(() => { conversaAtual.current = conversaId; }, [conversaId]);
  const paraTurno = (l: LinhaConversa): Turno => ({
    id: l.id, pedido: l.pedido, resposta: semFerramentas(l.resposta) || (l.resposta ? AVISO_FERRAMENTA : ""),
    passos: (l.passos ?? []).map((p) => ({ ...p, texto: semFerramentas(p.texto) || AVISO_FERRAMENTA })),
    selecao: l.selecao, citados: l.citados ?? [], erro: l.erro ?? undefined, inserido: l.inserido,
  });
  const mostrar = (lista: LinhaConversa[], id: string) => {
    setConversaId(id);
    setTurnos(lista.map(paraTurno));
    setTituloConversa(lista.find((l) => l.titulo)?.titulo ?? null);
  };
  const salvarTroca = async (t: Turno, conversa: string, primeira: boolean) => {
    if (!chave) return;
    const { error } = await db.from("conversas_documento").insert({
      id: t.id, conversa, chave, cliente_id: clienteId, pedido: t.pedido, resposta: t.resposta, passos: t.passos,
      selecao: t.selecao ?? null, citados: t.citados ?? [], erro: t.erro ?? null, titulo: primeira ? null : tituloConversa,
    });
    if (error) { toast.error("Não consegui salvar a conversa"); return; }
    if (primeira && t.resposta) void gerarTitulo(conversa, t.pedido, t.resposta);
  };
  /** Depois da primeira resposta, a IA dá um título curto para a conversa (como no Claude). */
  const gerarTitulo = async (conversa: string, pedido: string, resposta: string) => {
    try {
      const bruto = await escreverComClaude(crypto.randomUUID(), [
        "Dê um título curto para esta conversa: de 2 a 5 palavras, em português do Brasil, sem aspas e sem ponto final.",
        `Pedido: ${pedido.slice(0, 500)}`, `Resposta: ${resposta.slice(0, 800)}`, "Responda só com o título.",
      ].join("\n"), "haiku", () => undefined);
      const titulo = semFerramentas(bruto).split("\n")[0].replace(/^["'“”]+|["'“”.]+$/g, "").trim().slice(0, 60);
      if (!titulo) return;
      await db.from("conversas_documento").update({ titulo }).eq("conversa", conversa);
      if (conversaAtual.current === conversa) setTituloConversa(titulo);
    } catch { /* sem título: a lista mostra a primeira pergunta */ }
  };
  useEffect(() => {
    if (!aberto || !chave) return;
    let cancelado = false;
    void (async () => {
      const { data } = await db.from("conversas_documento").select(COLUNAS_CONVERSA)
        .eq("chave", chave).order("created_at", { ascending: true }).limit(1000);
      let lista = (data ?? []) as LinhaConversa[];
      // A conversa que estava guardada neste Mac (1ª versão) vai para o banco uma vez só.
      const locais = ler<(Turno & { destino?: string })[]>(chaveConversa, []).filter((t) => (!t.destino || t.destino === "chat") && t.resposta);
      if (!lista.length && locais.length) {
        const conversa = crypto.randomUUID();
        const novas = locais.map((t) => ({ id: crypto.randomUUID(), conversa, chave, cliente_id: clienteId, pedido: t.pedido, resposta: t.resposta,
          passos: (t.passos ?? []).filter((p) => p.texto), selecao: t.selecao ?? null, citados: [], erro: t.erro ?? null }));
        const { error } = await db.from("conversas_documento").insert(novas);
        if (!error) {
          try { localStorage.removeItem(chaveConversa); } catch { /* sem storage */ }
          lista = novas.map((n) => ({ ...n, inserido: false, created_at: new Date().toISOString() }));
        }
      }
      if (cancelado) return;
      // Abre na última conversa deste documento.
      const ultima = lista[lista.length - 1]?.conversa;
      if (ultima) mostrar(lista.filter((l) => l.conversa === ultima), ultima);
      else { setConversaId(crypto.randomUUID()); setTurnos([]); setTituloConversa(null); }
    })();
    return () => { cancelado = true; };
  }, [aberto, chave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lista de conversas (todas, de qualquer documento), como os "Recentes" do Claude.
  const [listaAberta, setListaAberta] = useState(false);
  const [itens, setItens] = useState<ItemConversa[] | null>(null);
  const [buscaConversa, setBuscaConversa] = useState("");
  useEffect(() => {
    if (!listaAberta) return;
    let cancelado = false;
    void (async () => {
      const { data } = await db.from("conversas_documento").select("conversa, chave, pedido, titulo, created_at")
        .order("created_at", { ascending: false }).limit(3000);
      const linhas = (data ?? []) as { conversa: string; chave: string; pedido: string; titulo: string | null; created_at: string }[];
      const porConversa = new Map<string, typeof linhas>();
      for (const l of linhas) porConversa.set(l.conversa, [...(porConversa.get(l.conversa) ?? []), l]);
      const ids = [...new Set(linhas.map((l) => l.chave).filter((c) => /^[0-9a-f-]{36}$/i.test(c)))];
      const { data: docs } = ids.length ? await db.from("documentos").select("id, titulo").in("id", ids) : { data: [] };
      const nomeDoc = new Map(((docs ?? []) as { id: string; titulo: string }[]).map((d) => [d.id, d.titulo]));
      if (cancelado) return;
      setItens([...porConversa.entries()].map(([id, ls]) => {
        const primeira = ls[ls.length - 1];   // vieram da mais nova para a mais velha
        return {
          id, titulo: ls.find((l) => l.titulo)?.titulo || primeira.pedido, chave: primeira.chave, quando: ls[0].created_at, trocas: ls.length,
          onde: primeira.chave.startsWith("video:") ? "Roteiro de vídeo" : nomeDoc.get(primeira.chave) ?? "Documento",
        };
      }));
    })();
    return () => { cancelado = true; };
  }, [listaAberta]);
  const abrirConversa = async (id: string) => {
    const { data } = await db.from("conversas_documento").select(COLUNAS_CONVERSA).eq("conversa", id).order("created_at", { ascending: true });
    mostrar((data ?? []) as LinhaConversa[], id);
    setListaAberta(false);
  };
  const novaConversa = () => { setConversaId(crypto.randomUUID()); setTurnos([]); setCitados([]); setTituloConversa(null); setListaAberta(false); };

  // @ no campo: procura um documento e o cita (o texto dele vai junto no pedido).
  const [citados, setCitados] = useState<Citado[]>([]);
  const [mencao, setMencao] = useState<{ consulta: string; inicio: number; fim: number } | null>(null);
  const [achados, setAchados] = useState<(Citado & { tipo: string | null })[]>([]);
  const [indiceAchado, setIndiceAchado] = useState(0);
  useEffect(() => {
    if (!mencao) { setAchados([]); return; }
    const t = window.setTimeout(async () => {
      let q = db.from("documentos").select("id, titulo, tipo").is("deleted_at", null).in("tipo", ["documento", "nota"])
        .order("updated_at", { ascending: false }).limit(8);
      if (mencao.consulta) q = q.ilike("titulo", `%${mencao.consulta.replace(/[%_]/g, "")}%`);
      const { data } = await q;
      setAchados((data ?? []) as (Citado & { tipo: string | null })[]);
      setIndiceAchado(0);
    }, 120);
    return () => window.clearTimeout(t);
  }, [mencao?.consulta]); // eslint-disable-line react-hooks/exhaustive-deps
  const olharMencao = (valor: string, caret: number) => {
    const antes = valor.slice(0, caret);
    const m = antes.match(/(?:^|\s)@([^\s@]{0,40})$/);
    setMencao(m ? { consulta: m[1], inicio: caret - m[1].length - 1, fim: caret } : null);
  };
  // @ também oferece os "blocos de roteiros" dos outros perfis (só as headlines vão para este perfil; os roteiros são escritos aqui com o cérebro dele).
  const blocosAchados = useMemo(() => {
    if (!mencao) return [] as BlocoPerfil[];
    const q = mencao.consulta.toLowerCase();
    return blocos.filter((b) => b.headlines.length && (!q || `roteiros ${b.nome}`.toLowerCase().includes(q)));
  }, [blocos, mencao]);
  const citar = (d: Citado) => {
    if (!mencao) return;
    const novo = `${texto.slice(0, mencao.inicio)}@${d.titulo} ${texto.slice(mencao.fim)}`;
    setTexto(novo);
    setCitados((l) => (l.some((x) => x.id === d.id) ? l : [...l, { id: d.id, titulo: d.titulo }]));
    setMencao(null);
    const pos = mencao.inicio + d.titulo.length + 2;
    requestAnimationFrame(() => { campo.current?.focus(); campo.current?.setSelectionRange(pos, pos); });
  };
  const textoDosCitados = async (lista: Citado[]) => {
    if (!lista.length) return [];
    const { data } = await db.from("documentos").select("id, titulo, conteudo").in("id", lista.map((c) => c.id));
    return ((data ?? []) as { titulo: string; conteudo: string | null }[]).map((d) => ({ titulo: d.titulo, texto: htmlParaTexto(d.conteudo ?? "") }));
  };
  // Referências dos quadros (24/10, Davi: "categorizar os cards para que, quando eu escrever os roteiros, ele puxe
  // as coisas na hora"): os cartões dos quadros nos documentos do projeto cujas etiquetas/colunas combinam com o pedido.
  const referenciasPara = async (pedido: string) => {
    if (!palavrasDoPedido(pedido).length) return [];
    let q = db.from("documentos").select("titulo, conteudo").is("deleted_at", null).ilike("conteudo", "%data-quadro-kanban%").limit(40);
    q = clienteId ? q.eq("cliente_id", clienteId) : q.is("cliente_id", null);
    const { data } = await q;
    const todos = ((data ?? []) as { titulo: string | null; conteudo: string | null }[]).flatMap((d) => cartoesDoHtml(d.conteudo ?? "", d.titulo || "Sem título"));
    return escolherReferencias(todos, pedido);
  };
  const listaConversa = useRef<HTMLDivElement>(null);
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  const [escolhidos, setEscolhidos] = useState<string[]>(() => ler("docchat:agentes", []));   // membro_id
  const [skillsOff, setSkillsOff] = useState<string[]>(() => ler("docchat:skillsOff", []));    // nome da skill
  const [para, setPara] = useState<string>(() => ler("docchat:para", ""));
  const [modelo, setModelo] = useState<string>(() => ler("docchat:modelo", "sonnet"));
  const chaveRev = `docchat:rev:${chave ?? "sem"}`;
  const [revisoes, setRevisoes] = useState<Revisao[]>(() => ler(chaveRev, []));
  useEffect(() => setRevisoes(ler(chaveRev, [])), [chaveRev]);
  const guardarRevisoes = (f: (l: Revisao[]) => Revisao[]) => setRevisoes((l) => { const n = f(l).slice(-200);   // era 10: no "gerar todos" de 15 roteiros os 5 primeiros perdiam os comentários (19/10)
    gravar(chaveRev, n); return n; });
  const campo = useRef<HTMLTextAreaElement>(null);
  const rodando = useRef<Set<string>>(new Set());   // escritas em andamento (o "gerar todos" roda 2 de cada vez)
  const parou = useRef(false);
  const { esc, membros, skills, setEsc, setMembros } = useEscritorio(clienteId, aberto);
  // 24/10: o mapa da inteligência de cada um (abre pelo ícone ao lado do nome).
  const [mapaDe, setMapaDe] = useState<Membro | null>(null);
  // 19/10 (Davi: "aqui mesmo, quero conseguir subir mais cérebros"): a mesma tela de cérebro da esteira.
  // 24/10 (Davi: "abrir um cérebro já existente e editar"): o lápis abre já no cérebro escolhido
  // (false = fechado; null = abre no primeiro).
  const [cerebrosAbertos, setCerebrosAbertos] = useState<string | null | false>(false);
  // 19/10 (Davi: "preciso conseguir mudar as configurações do Elias e dos outros, hoje só ativo ou
  // desativo"): a engrenagem de cada um abre os critérios, formatos e skills dele (os mesmos da esteira).
  const [configDe, setConfigDe] = useState<number | null>(null);
  const salvarEtapa = async (i: number, patch: Partial<Etapa>) => {
    if (!esc) return false;
    const nova = esc.esteira.map((e, k) => (k === i ? { ...e, ...patch } : e));
    const { error } = await db.from("setores").update({ esteira: nova }).eq("id", esc.id);
    if (error) { toast.error("Não consegui salvar"); return false; }
    setEsc({ ...esc, esteira: nova });
    return true;
  };
  const salvarCerebros = async (lista: CerebroEscrita[]) => {
    if (!esc) return false;
    const { error } = await db.from("setores").update({ cerebros: lista }).eq("id", esc.id);
    if (error) { toast.error("Não consegui salvar o cérebro"); return false; }
    setEsc({ ...esc, cerebros: lista });
    return true;
  };
  // 19/10 (Davi): "caso eu selecione uma palavra, preciso que ela apareça onde escrevo" — o trecho
  // selecionado no documento aparece citado no campo (e é sobre ele o pedido).
  const [selecionado, setSelecionado] = useState<string | null>(null);
  useEffect(() => {
    if (!aberto) return;
    const atualizar = () => {
      const { from, to, empty } = editor.state.selection;
      setSelecionado(empty ? null : editor.state.doc.textBetween(from, to, " ").trim() || null);
    };
    atualizar();
    editor.on("selectionUpdate", atualizar);
    return () => { editor.off("selectionUpdate", atualizar); };
  }, [aberto, editor]);

  useEffect(() => gravar("docchat:agentes", escolhidos), [escolhidos]);
  useEffect(() => gravar("docchat:skillsOff", skillsOff), [skillsOff]);
  useEffect(() => gravar("docchat:para", para), [para]);
  useEffect(() => gravar("docchat:modelo", modelo), [modelo]);

  // ⌘I abre e fecha (o itálico continua no botão da barra de ferramentas).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "i") return;
      e.preventDefault();
      e.stopPropagation();
      setAberto((a) => !a);
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, []);

  // Painel aberto: o app encolhe para o painel não ficar por cima do documento. 24/10 (Davi): a barra de guias lá em
  // cima continua inteira (o painel começa embaixo dela) e a largura se ajusta arrastando a borda esquerda.
  const [largura, setLargura] = useState(lerLargura);
  const [topo, setTopo] = useState(0);
  useEffect(() => {
    if (!aberto) return;
    requestAnimationFrame(() => campo.current?.focus());
    const medir = () => setTopo(Math.max(0, Math.round(document.querySelector("[data-barra-guias]")?.getBoundingClientRect().bottom ?? 0)));
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [aberto]);
  useEffect(() => {
    if (!aberto) return;
    // Quem encolhe é a área abaixo das guias (DashboardLayout lê --painel-direita); fora do app (janela do Atlas) o body.
    const raiz = document.documentElement;
    const temGuias = !!document.querySelector("[data-barra-guias]");
    raiz.style.setProperty("--painel-direita", `${largura}px`);
    const antes = document.body.style.paddingRight;
    if (!temGuias) document.body.style.paddingRight = `${largura}px`;
    return () => { raiz.style.removeProperty("--painel-direita"); if (!temGuias) document.body.style.paddingRight = antes; };
  }, [aberto, largura]);
  const arrastarBorda = (e: React.PointerEvent) => {
    e.preventDefault();
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    let ultima = largura;
    const mover = (ev: PointerEvent) => { ultima = Math.min(larguraMax(), Math.max(LARGURA_MIN, window.innerWidth - ev.clientX)); setLargura(ultima); };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      try { localStorage.setItem(CHAVE_LARGURA, String(ultima)); } catch { /* sem storage */ }
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };
  // A conversa desce sozinha quando chega texto novo.
  useEffect(() => {
    const el = listaConversa.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turnos, aberto]);

  // Campo cresce com o texto (até 6 linhas).
  useEffect(() => {
    const c = campo.current;
    if (!c) return;
    c.style.height = "auto";
    c.style.height = `${Math.min(c.scrollHeight, 160)}px`;
  }, [texto, aberto]);

  const etapas = useMemo(() => (esc?.esteira ?? []).map((e, i) => ({ ...e, i, membro: membros[e.membro_id] })).filter((e) => e.membro), [esc, membros]);
  const escolhidasOrdem = etapas.filter((e) => escolhidos.includes(e.membro_id));
  const agentesSkills = escolhidasOrdem.length ? escolhidasOrdem.map((e) => e.membro!.nome.trim().toLowerCase()) : null;
  const skillsVisiveis = useMemo(() => {
    const porNome = new Map<string, SkillItem>();
    for (const s of skills) if (!agentesSkills || agentesSkills.includes(s.agente)) if (!porNome.has(s.nome)) porNome.set(s.nome, s);
    return [...porNome.values()];
  }, [skills, agentesSkills?.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const skillsAtivas = skillsVisiveis.filter((s) => !skillsOff.includes(s.nome));
  const cerebro = esc?.cerebros.find((c) => c.id === para) ?? (para === "nenhum" ? null : esc?.cerebros[0] ?? null);

  const alternar = (id: string) => setEscolhidos((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const conteudoSkills = async (agente: string | null) => {
    const nomes = skillsAtivas.map((s) => s.nome);
    if (!nomes.length) return [];
    let q = db.from("inteligencia_membros").select("nome, conteudo, agente").in("nome", nomes).eq("status", "pronto");
    if (agente) q = q.eq("agente", agente);
    else q = q.in("agente", [...new Set(skillsAtivas.map((s) => s.agente))]);
    const { data } = await q;
    const vistos = new Set<string>();
    return ((data ?? []) as { nome: string; conteudo: string | null }[])
      .filter((s) => s.conteudo && !vistos.has(s.nome) && vistos.add(s.nome))
      .map((s) => ({ nome: nomeSkill(s.nome), conteudo: s.conteudo! }));
  };
  const aprendizados = async (agente: string) => {
    if (!esc) return null;
    const { data } = await db.from("inteligencia_membros").select("conteudo").eq("agente", agente).eq("tipo", "aprendizado")
      .eq("status", "pronto").or(`escopo.eq.geral,cliente_id.eq.${esc.cliente_id}`);
    return ((data ?? []) as { conteudo: string | null }[]).map((d) => d.conteudo ?? "").filter(Boolean).join("\n\n") || null;
  };

  /** Uma escrita completa (cada etapa escolhida, com a revisão por trás) numa região do documento. */
  const trabalhar = async (o: {
    regiao: Regiao; selecao: string | null; documento: string; pedido: string; proximaHeadline: number;
    fila: (typeof escolhidasOrdem[number] | null)[]; aoAndar?: (a: Andamento) => void;
    jaSeguida?: boolean;   // o "gerar todos" já acompanha a região desde o começo (seguir duas vezes andava o dobro)
    numero?: number;       // ROTEIRO NN deste texto (guardado na revisão)
  }): Promise<{ texto: string; erro?: string }> => {
    const { regiao, selecao, documento, pedido, proximaHeadline, fila } = o;
    const andar = o.aoAndar ?? setAndamento;
    // A headline em volta do cursor também conta para achar as referências (no "gerar todos" o pedido é genérico).
    const perto = documento.slice(Math.max(0, documento.indexOf("[CURSOR]") - 400), documento.indexOf("[CURSOR]") + 1);
    const referencias = await referenciasPara(`${pedido} ${selecao ?? ""} ${perto}`);
    const largar = o.jaSeguida ? () => undefined : seguirRegiao(editor, regiao);
    const blocos: { quem: string; texto: string }[] = [];
    let anterior: { quem: string; texto: string } | null = null;
    let erro: string | undefined;
    let fixado = false;
    const juntar = () => blocos.map((b) => b.texto).filter((t) => t.trim()).join("\n");
    const pintar = () => { const tudo = juntar(); trocarRegiao(editor, regiao, tudo || null, false); };
    // Volta o original sem registrar e põe o texto num passo só: ⌘Z desfaz tudo de uma vez.
    const fixar = () => {
      if (fixado) return;
      fixado = true;
      const tudo = juntar();
      trocarRegiao(editor, regiao, null, false);
      if (tudo) trocarRegiao(editor, regiao, tudo, true);
    };
    let idAtual: string | null = null;
    try {
      for (const etapa of fila) {
        if (parou.current) break;
        const m = etapa?.membro;
        const quem = m?.nome ?? "Claude";
        // Revisão de algo que já existe (o que o Junior acabou de escrever, ou parágrafos selecionados):
        // o texto de antes fica no documento e a revisão é feita por trás; no fim, entra com o On/Off.
        const revisa = !!(etapa && ehRevisao(etapa.nome) && (anterior?.texto || (selecao && !regiao.inline)));
        andar({ quem, etapa: etapa?.nome ?? "", fase: revisa ? "revisando" : "pensando" });
        const agente: AgenteEscrita | null = m && etapa ? {
          etapa: etapa.nome, nome: m.nome, funcao: m.funcao, manual: m.manual,
          aprendizados: await aprendizados(m.nome.trim().toLowerCase()), criterios: etapa.criterios, formatos: etapa.formatos,
          mapa: mapaParaTexto(lerMapa(m.mapa_inteligencia), m.nome),
        } : null;
        const prompt = montarPedido({
          escritorio: esc?.nome, agente, skills: await conteudoSkills(m ? m.nome.trim().toLowerCase() : null), cerebro,
          documento, selecao: anterior ? null : selecao, anterior,
          historico: turnos.filter((t) => !t.erro), pedido, proximaHeadline, referencias,
        });
        const id = crypto.randomUUID();
        idAtual = id;
        rodando.current.add(id);

        if (revisa) {
          const antes = anterior?.texto ?? selecao!;
          fixar();
          const { texto: final, notas } = separarNotas(await escreverComClaude(id, prompt, modelo, () => undefined));
          rodando.current.delete(id);
          if (final) {
            const trocou = trocarLinhas(editor, linhasDoTexto(antes), final, true);   // mexeu no texto enquanto ele revisava: fica o do Davi
            guardarRevisoes((l) => [...l, { ...montarRevisao(id, quem, antes, final, notas, alinhar), ativa: trocou, numero: o.numero }]);
            if (!trocou) toast.info(`${quem} terminou a revisão. Como o texto foi mexido, deixei o seu; clique em On para ver a versão de ${quem}.`);
          }
          anterior = { quem, texto: final || antes };
          continue;
        }

        const bloco = { quem, texto: "" };
        blocos.push(bloco);
        let ultimo = 0;
        const bruto = await escreverComClaude(id, prompt, modelo, (total) => {
          const { texto: t } = separarNotas(total);
          bloco.texto = t;
          if (t) andar({ quem, etapa: etapa?.nome ?? "", fase: "escrevendo" });
          if (Date.now() - ultimo > 80) { ultimo = Date.now(); pintar(); }
        });
        rodando.current.delete(id);
        bloco.texto = separarNotas(bruto).texto;
        pintar();
        anterior = { quem, texto: bloco.texto };
      }
    } catch (e) {
      erro = parou.current ? undefined : (e instanceof Error ? e.message : String(e));
    } finally {
      if (idAtual) rodando.current.delete(idAtual);
      fixar();
      largar();
    }
    return { texto: anterior?.texto ?? juntar(), erro };
  };

  const enviar = async () => {
    if (rodando.current.size || lote) return;
    if (!isDesktop()) { toast.info("O chat do documento usa o Claude do Mac: abra o documento no app Infopro Hub."); return; }
    const pedido = texto.trim();
    const fila = escolhidasOrdem.length ? escolhidasOrdem : [null];
    if (!pedido && !escolhidasOrdem.length) return;
    setTexto("");
    parou.current = false;
    const { regiao, selecao, cursor } = regiaoInicial(editor);
    const doc = editor.state.doc;
    const documento = `${doc.textBetween(0, cursor, "\n")}\n[CURSOR]\n${doc.textBetween(regiao.to, doc.content.size, "\n")}`;
    const historico = turnos.filter((t) => !t.erro && !t.rodando).map((t) => ({ pedido: t.pedido, resposta: t.resposta }));
    const idTurno = crypto.randomUUID();
    const conversa = conversaId;
    const primeira = turnos.length === 0;
    // Só os citados que ainda estão no texto (o Davi pode ter apagado o @Título).
    const citadosAgora = citados.filter((c) => pedido.includes(`@${c.titulo}`));
    setCitados([]);
    setMencao(null);
    const docsCitados = await textoDosCitados(citadosAgora);
    const referencias = await referenciasPara(pedido);
    setTurnos((l) => [...l, { id: idTurno, pedido: pedido || "(fazer a sua parte)", resposta: "", selecao, passos: [], rodando: true, citados: citadosAgora }]);
    const atualizar = (patch: Partial<Turno>) => setTurnos((l) => l.map((t) => (t.id === idTurno ? { ...t, ...patch } : t)));

    // Cada escolhido responde em sequência no chat (o Elias revisa o que o Junior acabou de entregar).
    const passos: Passo[] = [];
    let anterior: { quem: string; texto: string } | null = null;
    let erro: string | undefined;
    for (const etapa of fila) {
      if (parou.current) break;
      const m = etapa?.membro;
      const quem = m?.nome ?? "Claude";
      setAndamento({ quem, etapa: etapa?.nome ?? "", fase: "pensando" });
      const id = crypto.randomUUID();
      rodando.current.add(id);
      const passo: Passo = { quem, etapa: etapa?.nome ?? "", texto: "" };
      passos.push(passo);
      try {
        const agente: AgenteEscrita | null = m && etapa ? {
          etapa: etapa.nome, nome: m.nome, funcao: m.funcao, manual: m.manual,
          aprendizados: await aprendizados(m.nome.trim().toLowerCase()), criterios: etapa.criterios, formatos: etapa.formatos,
          mapa: mapaParaTexto(lerMapa(m.mapa_inteligencia), m.nome),
        } : null;
        const prompt = montarPedido({
          escritorio: esc?.nome, agente, skills: await conteudoSkills(m ? m.nome.trim().toLowerCase() : null), cerebro,
          documento, selecao: anterior ? null : selecao, anterior, historico, pedido, citados: docsCitados, referencias,
          agora: new Date().toLocaleString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }),
          proximaHeadline: proximoNumeroHeadline(editor.getHTML()), modo: "conversa",
        });
        const resposta = await escreverComClaude(id, prompt, modelo, (total) => {
          setAndamento({ quem, etapa: etapa?.nome ?? "", fase: "escrevendo" });
          passo.texto = total;
          atualizar({ passos: passos.map((p) => ({ ...p })), resposta: total });
        });
        // Sem ferramentas aqui: se mesmo assim ele escrever uma chamada de ferramenta, ela não aparece como resposta.
        passo.texto = semFerramentas(resposta) || AVISO_FERRAMENTA;
        anterior = { quem, texto: passo.texto };
      } catch (e) {
        erro = parou.current ? undefined : (e instanceof Error ? e.message : String(e));
        break;
      } finally {
        rodando.current.delete(id);
      }
    }
    setAndamento(null);
    const feitos = passos.filter((p) => p.texto);
    const final = { passos: feitos, resposta: feitos[feitos.length - 1]?.texto ?? "", erro, rodando: false };
    atualizar(final);
    void salvarTroca({ id: idTurno, pedido: pedido || "(fazer a sua parte)", selecao, citados: citadosAgora, ...final }, conversa, primeira);
    requestAnimationFrame(() => campo.current?.focus());
  };

  /** Resposta do chat: entra onde está o cursor (ou no lugar do que estiver selecionado). */
  const inserir = (t: Turno) => {
    // A pergunta do fim ("Aplico no roteiro completo?") é para o Davi, não entra no documento.
    const partes = t.resposta.trim().split(/\n\s*\n/);
    if (partes.length > 1 && partes[partes.length - 1].trim().endsWith("?")) partes.pop();
    const textoFinal = partes.join("\n\n").trim();
    if (!textoFinal) return;
    const { regiao } = regiaoInicial(editor);
    trocarRegiao(editor, regiao, textoFinal, true);
    setTurnos((l) => l.map((x) => (x.id === t.id ? { ...x, inserido: true } : x)));
    if (chave) void db.from("conversas_documento").update({ inserido: true }).eq("id", t.id).then(() => undefined);
    editor.commands.focus();
  };

  /** Tira do documento todo texto que veio das revisões (versão que estiver no ar) e as revisões. */
  const apagarGerados = () => {
    if (!revisoes.length || !window.confirm(`Apagar do documento os ${revisoes.length} textos gerados (Junior/Elias)? As headlines e os links ficam.`)) return;
    let apagados = 0;
    for (const r of revisoes) {
      const linhas = linhasDoTexto((revisaoAtiva(r) ? r.depois : r.antes) ?? r.linhas.map((l) => l.texto).join("\n"));
      const onde = acharTrecho(editor.state.doc, linhas, false);
      if (onde) { editor.chain().deleteRange(onde).run(); apagados++; }
    }
    guardarRevisoes(() => []);
    toast.success(`${apagados} texto(s) apagado(s). Agora é só "Gerar todos" de novo.`);
  };

  // ---------------------------------------------------------------- gerar todos os roteiros (19/10, opção 1)
  const [vazios, setVazios] = useState<RoteiroVazio[]>([]);
  const [lote, setLote] = useState<{ total: number; feitos: number; agora: string[] } | null>(null);
  useEffect(() => {
    if (!aberto) return;
    const contar = () => setVazios(roteirosVazios(editor));
    contar();
    editor.on("update", contar);
    return () => { editor.off("update", contar); };
  }, [aberto, editor]);

  const gerarTodos = async () => {
    if (rodando.current.size || lote) return;
    if (!isDesktop()) { toast.info("Gerar os roteiros usa o Claude do Mac: abra o documento no app Infopro Hub."); return; }
    const etapasRoteiro = (escolhidasOrdem.length ? escolhidasOrdem : etapas).filter((e) => !/headline/i.test(e.nome));
    if (!etapasRoteiro.length) { toast.info("Escolha quem escreve (Junior, e o Elias para revisar)."); return; }
    const alvos = roteirosVazios(editor);
    if (!alvos.length) return;
    parou.current = false;
    setLote({ total: alvos.length, feitos: 0, agora: [] });
    // Cada alvo vira uma região já agora (elas andam juntas conforme os outros escrevem).
    const tarefas = alvos.map((a) => ({ ...a, regiao: { from: a.depois, to: a.depois, original: editor.state.doc.slice(a.depois, a.depois), inline: false } as Regiao }));
    const seguirTodas = tarefas.map((t) => seguirRegiao(editor, t.regiao));
    let proxima = 0, falhas = 0;
    const mudarAgora = (f: (l: string[]) => string[]) => setLote((l) => (l ? { ...l, agora: f(l.agora) } : l));
    const trabalhador = async () => {
      while (proxima < tarefas.length && !parou.current) {
        const t = tarefas[proxima++];
        const rotulo = `Roteiro ${String(t.numero).padStart(2, "0")}`;
        mudarAgora((l) => [...l, rotulo]);
        const referencia = t.link ? await transcricaoDaReferencia(t.link) : null;
        const pedido = [
          `Escreva o roteiro completo da headline do ${rotulo}: "${t.headline}".`,
          "A headline já está no documento: NÃO escreva a headline de novo nem um título; comece direto na fala do roteiro.",
          referencia ? `Vídeo de referência (deu certo; aproveite a estrutura e o que funcionou, sem copiar):\n"""\n${referencia.slice(0, 5000)}\n"""` : "",
        ].filter(Boolean).join("\n\n");
        const doc = editor.state.doc;
        const documento = `${doc.textBetween(0, t.regiao.from, "\n")}\n[CURSOR]\n${doc.textBetween(t.regiao.from, doc.content.size, "\n")}`;
        const r = await trabalhar({ regiao: t.regiao, selecao: null, documento, pedido, proximaHeadline: t.numero, fila: etapasRoteiro,
          aoAndar: () => undefined, jaSeguida: true, numero: t.numero });
        if (r.erro) falhas++;
        mudarAgora((l) => l.filter((x) => x !== rotulo));
        setLote((l) => (l ? { ...l, feitos: l.feitos + 1 } : l));
      }
    };
    await Promise.all([trabalhador(), trabalhador()]);
    seguirTodas.forEach((f) => f());
    setLote(null);
    if (falhas) toast.error(`${falhas} roteiro(s) não saíram; rode "Gerar todos" de novo para tentar só os que faltam.`);
    else if (!parou.current) toast.success("Roteiros prontos. Confira cada um com o On/Off da revisão.");
  };

  // Puxar um bloco de roteiros de outro perfil (14/11, Davi: "aperto @, seleciono o bloco e ele refaz os roteiros para o perfil que estou"): as headlines (iguais) entram
  // aqui sem texto e o "Gerar todos" já escreve cada roteiro embaixo da sua headline, de uma vez, com o cérebro deste perfil.
  const [pendenteLote, setPendenteLote] = useState(false);
  const puxarBloco = (b: BlocoPerfil) => {
    if (!isDesktop()) { toast.info("Gerar os roteiros usa o Claude do Mac: abra o documento no app Infopro Hub."); return; }
    if (mencao) setTexto(`${texto.slice(0, mencao.inicio)}${texto.slice(mencao.fim)}`.trimStart());
    setMencao(null);
    const jaTem = editor.getText().toLowerCase();
    const novas = b.headlines.filter((h) => !jaTem.includes(h.titulo.toLowerCase().slice(0, 60)));
    if (!novas.length) { toast.info("Essas headlines já estão neste perfil."); return; }
    const cer = perfil ? acharCerebroDoPerfil(esc?.cerebros ?? [], perfil) : null;
    if (cer) setPara(cer.id);
    else toast.info("Este perfil ainda não tem cérebro cadastrado: escrevi com o cérebro escolhido. Clique no 🧠 ao lado do perfil para cadastrar.");
    const esc_ = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = novas.map((h) => `<p>Headline ${h.numero}: ${esc_(h.titulo)}</p>`).join("");
    if (editor.isEmpty) editor.commands.setContent(html); else editor.chain().focus("end").insertContent(html).run();
    toast.success(`${novas.length} headline${novas.length === 1 ? "" : "s"} de ${b.nome} puxada${novas.length === 1 ? "" : "s"}: escrevendo os roteiros embaixo de cada uma.`);
    setPendenteLote(true);   // o "Gerar todos" roda na próxima renderização, já com o cérebro do perfil escolhido
  };
  useEffect(() => {
    if (!pendenteLote) return;
    setPendenteLote(false);
    void gerarTodos();
  }, [pendenteLote]); // eslint-disable-line react-hooks/exhaustive-deps

  // O perfil aberto escolhe o cérebro dele sozinho.
  useEffect(() => {
    if (!perfil || !esc) return;
    const c = acharCerebroDoPerfil(esc.cerebros, perfil);
    if (c) setPara(c.id);
  }, [perfil?.chave, esc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 🧠 ao lado do perfil: abre (e cria, se preciso) o cérebro dele para cadastrar as informações.
  const [pendenteCerebro, setPendenteCerebro] = useState(false);
  useEffect(() => { if (pedidoCerebro) { setAberto(true); setPendenteCerebro(true); } }, [pedidoCerebro]);
  useEffect(() => {
    if (!pendenteCerebro || !esc || !perfil) return;
    setPendenteCerebro(false);
    void (async () => {
      let c = acharCerebroDoPerfil(esc.cerebros, perfil) as CerebroEscrita | null;
      if (!c) { c = novoCerebroDoPerfil(perfil) as CerebroEscrita; if (!(await salvarCerebros([...esc.cerebros, c]))) return; }
      setPara(c.id);
      setCerebrosAbertos(c.id);
    })();
  }, [pendenteCerebro, esc, perfil]); // eslint-disable-line react-hooks/exhaustive-deps

  const parar = () => {
    parou.current = true;
    for (const id of rodando.current) void pararClaude(id);
  };

  // On/Off da revisão: troca no documento o texto de antes pelo do revisor (e volta).
  const alternarRevisao = (id: string) => {
    const r = revisoes.find((x) => x.id === id);
    if (!r?.antes || !r.depois) return;
    const ativa = revisaoAtiva(r);
    if (!trocarLinhas(editor, linhasDoTexto(ativa ? r.depois : r.antes), ativa ? r.antes : r.depois)) {
      toast.error("Não achei esse texto no documento (ele foi editado depois da revisão).");
      return;
    }
    guardarRevisoes((l) => l.map((x) => (x.id === id ? { ...x, ativa: !ativa } : x)));
  };
  const revisao = (
    <RevisaoNoDocumento editor={editor} revisoes={revisoes} onAlternar={alternarRevisao}
      onDispensar={(id) => guardarRevisoes((l) => l.filter((r) => r.id !== id))} />
  );
  if (!aberto) return revisao;
  const escrevendo = !!andamento || !!lote;
  const placeholder = escolhidasOrdem.length
    ? `Pedir para ${escolhidasOrdem.map((e) => e.membro!.nome).join(" → ")}… (vazio = fazer a sua parte com o que está no documento)`
    : "Conversar com o Claude… (@ cita um documento)";

  return (
    <>
      {revisao}
      {configDe !== null && esc && esc.esteira[configDe] && (
        <div className="fixed inset-0 z-[70]" onKeyDown={(e) => e.stopPropagation()}>
          <CriteriosEtapa etapa={esc.esteira[configDe] as Parameters<typeof CriteriosEtapa>[0]["etapa"]}
            quem={membros[esc.esteira[configDe].membro_id]?.nome ?? ""} clienteId={esc.cliente_id}
            onFechar={() => setConfigDe(null)} onMudar={(patch) => salvarEtapa(configDe, patch as Partial<Etapa>)} />
        </div>
      )}
      <MapaInteligenciaView membro={mapaDe} aberto={!!mapaDe} onFechar={() => setMapaDe(null)}
        onSalvo={(mapa) => { if (mapaDe) setMembros((l) => ({ ...l, [mapaDe.id]: { ...l[mapaDe.id], mapa_inteligencia: mapa } })); }} />
      {cerebrosAbertos !== false && esc && (
        <div className="fixed inset-0 z-[70]" onKeyDown={(e) => e.stopPropagation()}>
          <CerebroEsteira inicial={esc.cerebros as Parameters<typeof CerebroEsteira>[0]["inicial"]} abrirId={cerebrosAbertos}
            onFechar={() => setCerebrosAbertos(false)}
            onSalvar={(l) => salvarCerebros(l as CerebroEscrita[])} />
        </div>
      )}
      {/* No body (portal): dentro do app, um ancestral com transform prendia o "fixed" na área da página
          e sobrava uma faixa branca à direita (24/10). */}
      {createPortal(<aside
        className="fixed bottom-0 right-0 z-50 flex flex-col border-l bg-background text-foreground shadow-2xl"
        style={{ width: largura, top: topo }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Borda esquerda: segure e arraste para os lados (dois cliques volta ao tamanho padrão). */}
        <div role="separator" aria-label="Ajustar a largura do chat" title="Arraste para mudar a largura · dois cliques: tamanho padrão"
          onPointerDown={arrastarBorda}
          onDoubleClick={() => { setLargura(LARGURA_PAINEL); try { localStorage.setItem(CHAVE_LARGURA, String(LARGURA_PAINEL)); } catch { /* sem storage */ } }}
          className="group absolute inset-y-0 -left-1.5 z-10 w-3 cursor-col-resize">
          <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors group-hover:bg-primary/50" />
        </div>
        {/* Cabeçalho: quem está no chat, nova conversa e fechar. */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{listaAberta ? "Conversas" : tituloConversa ?? turnos[0]?.pedido ?? "Nova conversa"}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {listaAberta ? "Todas as suas conversas, de qualquer documento" : `${escolhidasOrdem.length ? escolhidasOrdem.map((e) => e.membro!.nome).join(" → ") : "Claude"} · @ cita um documento`}
            </p>
          </div>
          <button type="button" onClick={() => setListaAberta((v) => !v)} disabled={escrevendo} title="Conversas"
            className={cn("rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30", listaAberta && "bg-muted text-foreground")}><History className="h-4 w-4" /></button>
          <button type="button" onClick={novaConversa} disabled={escrevendo || (!turnos.length && !listaAberta)} title="Nova conversa (a anterior fica na lista)"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={() => { setAberto(false); editor.commands.focus(); }} title="Fechar (⌘I); o que estiver escrevendo continua"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {listaAberta ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="space-y-2 border-b p-3">
              <button type="button" onClick={novaConversa}
                className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4" />Nova conversa</button>
              <label className="flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input value={buscaConversa} onChange={(e) => setBuscaConversa(e.target.value)} placeholder="Buscar conversas"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {itens === null ? <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</p> : (() => {
                const termo = buscaConversa.trim().toLowerCase();
                const filtrados = itens.filter((i) => !termo || i.titulo.toLowerCase().includes(termo) || i.onde.toLowerCase().includes(termo));
                const grupos: [string, ItemConversa[]][] = [
                  ["Neste documento", filtrados.filter((i) => i.chave === chave)],
                  ["Recentes", filtrados.filter((i) => i.chave !== chave)],
                ];
                if (!filtrados.length) return <p className="p-3 text-sm text-muted-foreground">{termo ? "Nenhuma conversa com isso." : "Nenhuma conversa ainda."}</p>;
                return grupos.filter(([, l]) => l.length).map(([rotulo, l]) => (
                  <div key={rotulo} className="mb-3">
                    <p className="px-2 py-1 text-[11px] font-medium text-muted-foreground">{rotulo}</p>
                    {l.map((i) => (
                      <button key={i.id} type="button" onClick={() => void abrirConversa(i.id)}
                        className={cn("block w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted", i.id === conversaId && "bg-muted")}>
                        <span className="block truncate text-sm">{i.titulo}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {i.chave !== chave && `${i.onde} · `}{new Date(i.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </button>
                    ))}
                  </div>
                ));
              })()}
            </div>
          </div>
        ) : (<>
        {/* A conversa. */}
        <div ref={listaConversa} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {!turnos.length && (
            <div className="space-y-2 pt-6 text-center text-sm text-muted-foreground">
              <MessageSquare className="mx-auto h-6 w-6 opacity-60" />
              <p>Peça ao Claude, ou chame o Junior, o Elias e os outros embaixo.</p>
              <p className="text-xs">A resposta fica aqui; o botão <b>Inserir no documento</b> põe onde está o cursor.</p>
            </div>
          )}
          {turnos.map((t) => (
            <div key={t.id} className="space-y-2">
              <div className="ml-8 rounded-2xl rounded-br-sm bg-muted px-3 py-2 text-sm">
                {t.selecao && <p className="mb-1 line-clamp-2 border-l-2 pl-2 text-xs italic text-muted-foreground">{t.selecao}</p>}
                {!!t.citados?.length && (
                  <p className="mb-1 flex flex-wrap gap-1">{t.citados.map((c) => <span key={c.id} className="rounded bg-primary/15 px-1.5 text-[11px] text-primary">@{c.titulo}</span>)}</p>
                )}
                <p className="whitespace-pre-wrap">{t.pedido}</p>
              </div>
              <div className="space-y-3 text-sm">
                {(t.passos.length ? t.passos : [{ quem: "Claude", etapa: "", texto: t.resposta }]).map((p, k) => (
                  <div key={k} className="space-y-1">
                    <p className="text-[11px] font-semibold text-muted-foreground">{p.quem}{p.etapa ? ` · ${p.etapa}` : ""}</p>
                    {p.texto && <p className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed">{p.texto}</p>}
                  </div>
                ))}
                {t.rodando && !t.resposta && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />pensando…</p>}
                {!t.rodando && t.resposta && (
                  <button type="button" onClick={() => inserir(t)}
                    className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted">
                    <FileText className="h-3.5 w-3.5" />{t.inserido ? "Inserir de novo" : "Inserir no documento"}
                  </button>
                )}
              </div>
              {t.erro && <p className="rounded-md bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-300">Não deu: {t.erro}</p>}
            </div>
          ))}
          {andamento && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {andamento.fase === "pensando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />}
              <span><b className="font-medium text-foreground">{andamento.quem}</b>{andamento.etapa ? ` (${andamento.etapa})` : ""} {andamento.fase === "pensando" ? "lendo critérios e skills…" : andamento.fase === "revisando" ? "revisando por trás…" : "respondendo…"}</span>
            </div>
          )}
        </div>

        {/* Rodapé: avisos, trecho selecionado, quem chamar e o campo. */}
        <div className="space-y-2 border-t p-3">
          {!lote && revisoes.length >= 2 && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="flex-1">{revisoes.length} textos gerados neste documento.</span>
              <button type="button" onClick={apagarGerados} className="rounded-md border px-2 py-0.5 hover:bg-muted">Apagar os textos gerados</button>
            </div>
          )}
          {(vazios.length >= 2 || lote) && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
              {lote ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="flex-1">Gerando roteiros: <b>{lote.feitos} de {lote.total}</b>{lote.agora.length ? ` · agora: ${lote.agora.join(", ")}` : ""}</span>
                  <button type="button" onClick={parar} className="rounded-md border px-2 py-0.5 hover:bg-muted">Parar</button>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="flex-1">{vazios.length} roteiros sem texto{cerebro ? ` · para ${cerebro.nome}` : ""}</span>
                  <button type="button" onClick={() => void gerarTodos()} className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground hover:opacity-90">
                    Gerar todos ({vazios.length})
                  </button>
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {etapas.map((e) => {
              const on = escolhidos.includes(e.membro_id);
              return (
                <span key={e.membro_id} className="flex items-center">
                  <button
                    type="button"
                    disabled={escrevendo}
                    onClick={() => alternar(e.membro_id)}
                    className={cn("flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors",
                      on ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted")}
                    title={on ? `Tirar ${e.membro!.nome}` : `Chamar ${e.membro!.nome} (${e.nome})`}
                  >
                    <span className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-semibold text-white"
                      style={{ background: e.membro!.visual?.camisa ?? "#3b6fd8" }}>
                      {e.membro!.nome.slice(0, 1)}
                    </span>
                    {e.membro!.nome}
                    {on && <Check className="h-3 w-3" />}
                  </button>
                  <button type="button" onClick={() => setConfigDe(e.i)} title={`Configurar ${e.membro!.nome} (${e.nome}): critérios, formatos e skills`}
                    className="-ml-0.5 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Settings2 className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => setMapaDe(e.membro!)} title={`Mapa da inteligência do ${e.membro!.nome}`}
                    className="-ml-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Network className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>

          {selecionado && (
            <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
              <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-2 flex-1 italic">{selecionado}</span>
            </div>
          )}

          <div className="relative rounded-2xl border bg-card shadow-sm">
            {mencao && (
              <div className="absolute inset-x-0 bottom-full mb-1 overflow-hidden rounded-xl border bg-popover shadow-lg">
                <p className="flex items-center gap-1 px-3 pt-2 text-[11px] text-muted-foreground"><AtSign className="h-3 w-3" />{blocosAchados.length ? "Puxar um bloco de roteiros ou citar um documento" : "Citar um documento"}</p>
                {blocosAchados.map((b, k) => (
                  <button key={b.chave} type="button" onMouseDown={(e) => { e.preventDefault(); puxarBloco(b); }}
                    className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm", k === indiceAchado ? "bg-muted" : "hover:bg-muted")}>
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">Roteiros do {b.nome}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{b.headlines.length} headline{b.headlines.length === 1 ? "" : "s"} → escreve aqui</span>
                  </button>
                ))}
                {achados.map((d, k0) => { const k = k0 + blocosAchados.length; return (
                  <button key={d.id} type="button" onMouseDown={(e) => { e.preventDefault(); citar(d); }}
                    className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm", k === indiceAchado ? "bg-muted" : "hover:bg-muted")}>
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{d.titulo}</span>
                    {d.tipo === "nota" && <span className="ml-auto text-[10px] text-muted-foreground">nota</span>}
                  </button>); })}
                {!achados.length && !blocosAchados.length && <p className="px-3 py-2 text-sm text-muted-foreground">Nenhum documento com esse nome.</p>}
              </div>
            )}
            {!!citados.length && (
              <div className="flex flex-wrap gap-1 px-3 pt-2">
                {citados.map((c) => (
                  <span key={c.id} className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">
                    <FileText className="h-3 w-3" />{c.titulo}
                    <button type="button" onClick={() => setCitados((l) => l.filter((x) => x.id !== c.id))} title="Tirar" className="hover:text-foreground"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={campo}
              rows={1}
              value={texto}
              onChange={(e) => { setTexto(e.target.value); olharMencao(e.target.value, e.target.selectionStart ?? e.target.value.length); }}
              onKeyDown={(e) => {
                const totalMencao = blocosAchados.length + achados.length;
                if (mencao && totalMencao && ["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(e.key)) {
                  e.preventDefault();
                  if (e.key === "ArrowDown") setIndiceAchado((i) => (i + 1) % totalMencao);
                  else if (e.key === "ArrowUp") setIndiceAchado((i) => (i - 1 + totalMencao) % totalMencao);
                  else if (indiceAchado < blocosAchados.length) puxarBloco(blocosAchados[indiceAchado]);
                  else citar(achados[indiceAchado - blocosAchados.length]);
                  return;
                }
                if (mencao && e.key === "Escape") { e.preventDefault(); setMencao(null); return; }
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar(); }
                else if (e.key === "Escape") { e.preventDefault(); if (escrevendo) parar(); else { setAberto(false); editor.commands.focus(); } }
              }}
              placeholder={placeholder}
              className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-3 pt-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" title="Skills" className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted">
                    <BookOpen className="h-3 w-3" /> {skillsAtivas.length}/{skillsVisiveis.length}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-2" align="start">
                  <div className="px-2 pb-1 text-xs text-muted-foreground">
                    {agentesSkills ? `Skills de ${escolhidasOrdem.map((e) => e.membro!.nome).join(" e ")}` : "Suas skills"} (desmarque para deixar de fora)
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {skillsVisiveis.map((sk) => {
                      const on = !skillsOff.includes(sk.nome);
                      return (
                        <label key={sk.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                          <input type="checkbox" checked={on}
                            onChange={() => setSkillsOff((l) => (on ? [...l, sk.nome] : l.filter((x) => x !== sk.nome)))} />
                          <span className="flex-1 truncate">{nomeSkill(sk.nome)}</span>
                          {sk.caracteres ? <span className="text-[10px] text-muted-foreground">{Math.round(sk.caracteres / 1000)}k</span> : null}
                        </label>
                      );
                    })}
                    {!skillsVisiveis.length && <div className="px-2 py-3 text-sm text-muted-foreground">Nenhuma skill carregada.</div>}
                  </div>
                </PopoverContent>
              </Popover>
              {esc && (
                <select value={cerebro?.id ?? "nenhum"} disabled={escrevendo}
                  onChange={(e) => { if (e.target.value === "__cerebros") setCerebrosAbertos(null); else setPara(e.target.value); }}
                  className="min-w-0 max-w-[110px] truncate rounded-full border bg-transparent px-1.5 py-0.5 text-[11px] text-muted-foreground" title="Cérebro: para quem é o texto">
                  {esc.cerebros.map((c) => <option key={c.id} value={c.id}>🧠 {c.nome}</option>)}
                  <option value="nenhum">🧠 Sem cérebro</option>
                  <option value="__cerebros">＋ Novo cérebro / editar…</option>
                </select>
              )}
              {esc && cerebro && (
                <button type="button" disabled={escrevendo} onClick={() => setCerebrosAbertos(cerebro.id)} title={`Editar o cérebro de ${cerebro.nome}`}
                  className="-ml-1 grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-40">
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              <select value={modelo} onChange={(e) => setModelo(e.target.value)} disabled={escrevendo}
                className="ml-auto rounded-full border bg-transparent px-1.5 py-0.5 text-[11px] text-muted-foreground">
                <option value="sonnet">Sonnet</option>
                <option value="opus">Opus</option>
                <option value="haiku">Haiku</option>
              </select>
              {escrevendo ? (
                <button type="button" onClick={parar} title="Parar (Esc)"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-background">
                  <Square className="h-3 w-3 fill-current" />
                </button>
              ) : (
                <button type="button" onClick={() => void enviar()} disabled={!texto.trim() && !escolhidasOrdem.length} title="Enviar (Enter)"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
        </>)}
      </aside>, document.body)}
    </>
  );
}
