import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Slice } from "@tiptap/pm/model";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowUp, BookOpen, Check, Loader2, Quote, Sparkles, Square, X } from "lucide-react";
import { RevisaoNoDocumento, acharTrecho, revisaoAtiva, trocarLinhas } from "./RevisaoNoDocumento";
import { CerebroEsteira } from "@/components/empresa/KanbanEsteira";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { isDesktop } from "@/lib/platform";
import { proximoNumeroHeadline } from "@/lib/conteudo/blocoReferencia";
import { alinhar } from "@/lib/conteudo/trechos";
import {
  ehRevisao, linhasDoTexto, montarPedido, montarRevisao, separarNotas, textoParaHtml,
  type AgenteEscrita, type CerebroEscrita, type Conversa, type FormatoEscrita, type Revisao,
} from "@/lib/conteudo/escritaAgentes";

// ⌘I no documento (19/10/2026, Davi): "ativa o modo chat; onde estiver o cursor é lá que começa a
// escrever, tipo o Claude; embaixo aparece a parte para conversar; além das skills aparecem o Leo
// (headline), o Junior (roteiros) e o Elias (revisão); selecionando Junior e Elias é um trabalho
// só". Cada um usa o mesmo contexto da esteira do escritório (critérios, formatos, skills, cérebro).
// O Claude roda no Mac (comando claude_escrever, src-tauri/src/escrita.rs) e o texto entra ao vivo.
const db = supabase as unknown as SupabaseClient;

interface Etapa { nome: string; membro_id: string; criterios?: string | string[]; formatos?: FormatoEscrita[] }
interface Membro { id: string; nome: string; funcao: string | null; manual: string | null; visual: { pele?: string; camisa?: string } | null }
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
      const { data: ms } = await db.from("membros").select("id, nome, funcao, manual, visual").in("id", ids);
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
  return { esc, membros, skills, setEsc };
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

interface Turno extends Conversa { erro?: string }
interface Andamento { quem: string; etapa: string; fase: "pensando" | "escrevendo" | "revisando" }

/** `chave`: o documento (as revisões do Elias ficam guardadas por documento, neste Mac). */
export function ChatNoDocumento({ editor, clienteId, chave }: { editor: Editor; clienteId: string | null; chave?: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [andamento, setAndamento] = useState<Andamento | null>(null);
  const [escolhidos, setEscolhidos] = useState<string[]>(() => ler("docchat:agentes", []));   // membro_id
  const [skillsOff, setSkillsOff] = useState<string[]>(() => ler("docchat:skillsOff", []));    // nome da skill
  const [para, setPara] = useState<string>(() => ler("docchat:para", ""));
  const [modelo, setModelo] = useState<string>(() => ler("docchat:modelo", "sonnet"));
  const [posicao, setPosicao] = useState<{ left: number; width: number; bottom: number } | null>(null);
  const chaveRev = `docchat:rev:${chave ?? "sem"}`;
  const [revisoes, setRevisoes] = useState<Revisao[]>(() => ler(chaveRev, []));
  useEffect(() => setRevisoes(ler(chaveRev, [])), [chaveRev]);
  const guardarRevisoes = (f: (l: Revisao[]) => Revisao[]) => setRevisoes((l) => { const n = f(l).slice(-200);   // era 10: no "gerar todos" de 15 roteiros os 5 primeiros perdiam os comentários (19/10)
    gravar(chaveRev, n); return n; });
  const campo = useRef<HTMLTextAreaElement>(null);
  const rodando = useRef<Set<string>>(new Set());   // escritas em andamento (o "gerar todos" roda 2 de cada vez)
  const parou = useRef(false);
  const { esc, membros, skills, setEsc } = useEscritorio(clienteId, aberto);
  // 19/10 (Davi: "aqui mesmo, quero conseguir subir mais cérebros"): a mesma tela de cérebro da esteira.
  const [cerebrosAbertos, setCerebrosAbertos] = useState(false);
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

  // A barra ocupa o rodapé da coluna do documento (a área que rola), com fundo próprio.
  const medir = useCallback(() => {
    let el = editor.view.dom.parentElement;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    const r = (el ?? editor.view.dom).getBoundingClientRect();
    setPosicao({ left: r.left, width: r.width, bottom: Math.max(0, window.innerHeight - r.bottom) });
  }, [editor]);

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

  useEffect(() => {
    if (!aberto) return;
    medir();
    requestAnimationFrame(() => campo.current?.focus());
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [aberto, medir]);

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
        } : null;
        const prompt = montarPedido({
          escritorio: esc?.nome, agente, skills: await conteudoSkills(m ? m.nome.trim().toLowerCase() : null), cerebro,
          documento, selecao: anterior ? null : selecao, anterior,
          historico: turnos.filter((t) => !t.erro), pedido, proximaHeadline,
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
    if (!isDesktop()) { toast.info("O modo chat escreve com o Claude do Mac: abra o documento no app Infopro Hub."); return; }
    const pedido = texto.trim();
    const fila = escolhidasOrdem.length ? escolhidasOrdem : [null];
    if (!pedido && !escolhidasOrdem.length) return;
    setTexto("");
    parou.current = false;
    const { regiao, selecao, cursor } = regiaoInicial(editor);
    const doc = editor.state.doc;
    const documento = `${doc.textBetween(0, cursor, "\n")}\n[CURSOR]\n${doc.textBetween(regiao.to, doc.content.size, "\n")}`;
    const { texto: resposta, erro } = await trabalhar({ regiao, selecao, documento, pedido, proximaHeadline: proximoNumeroHeadline(editor.getHTML()), fila });
    if (erro) toast.error(`Não deu para escrever: ${erro}`);
    setAndamento(null);
    setTurnos((l) => [...l, { pedido: pedido || "(fazer a sua parte)", resposta, erro }].slice(-12));
    requestAnimationFrame(() => campo.current?.focus());
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
    : "Pedir ao Claude… ele escreve onde está o cursor";

  return (
    <>
      {revisao}
      {cerebrosAbertos && esc && (
        <div className="fixed inset-0 z-[70]" onKeyDown={(e) => e.stopPropagation()}>
          <CerebroEsteira inicial={esc.cerebros as Parameters<typeof CerebroEsteira>[0]["inicial"]}
            onFechar={() => setCerebrosAbertos(false)}
            onSalvar={(l) => salvarCerebros(l as CerebroEscrita[])} />
        </div>
      )}
      <div style={{ height: 160 }} aria-hidden />
      <div
        className="fixed z-50 border-t bg-background px-4 pb-3 pt-2"
        style={posicao ? { left: posicao.left, width: posicao.width, bottom: posicao.bottom } : { left: 0, right: 0, bottom: 0 }}
        onKeyDown={(e) => e.stopPropagation()}
      >
       <div className="mx-auto max-w-[780px] rounded-2xl border bg-card shadow-lg">
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3">
          {etapas.map((e) => {
            const on = escolhidos.includes(e.membro_id);
            return (
              <button
                key={e.membro_id}
                type="button"
                disabled={escrevendo}
                onClick={() => alternar(e.membro_id)}
                className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  on ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-muted")}
                title={on ? `Tirar ${e.membro!.nome}` : `Chamar ${e.membro!.nome} (${e.nome})`}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold text-white"
                  style={{ background: e.membro!.visual?.camisa ?? "#3b6fd8" }}>
                  {e.membro!.nome.slice(0, 1)}
                </span>
                {e.membro!.nome} <span className="opacity-60">· {e.nome}</span>
                {on && <Check className="h-3 w-3" />}
              </button>
            );
          })}

          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted">
                <BookOpen className="h-3.5 w-3.5" /> Skills {skillsAtivas.length}/{skillsVisiveis.length}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2" align="start">
              <div className="px-2 pb-1 text-xs text-muted-foreground">
                {agentesSkills ? `Skills de ${escolhidasOrdem.map((e) => e.membro!.nome).join(" e ")}` : "Suas skills"} (desmarque para deixar de fora)
              </div>
              <div className="max-h-72 overflow-y-auto">
                {skillsVisiveis.map((s) => {
                  const on = !skillsOff.includes(s.nome);
                  return (
                    <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                      <input type="checkbox" checked={on}
                        onChange={() => setSkillsOff((l) => (on ? [...l, s.nome] : l.filter((x) => x !== s.nome)))} />
                      <span className="flex-1 truncate">{nomeSkill(s.nome)}</span>
                      {s.caracteres ? <span className="text-[10px] text-muted-foreground">{Math.round(s.caracteres / 1000)}k</span> : null}
                    </label>
                  );
                })}
                {!skillsVisiveis.length && <div className="px-2 py-3 text-sm text-muted-foreground">Nenhuma skill carregada.</div>}
              </div>
            </PopoverContent>
          </Popover>

          {esc && (
            <select value={cerebro?.id ?? "nenhum"} disabled={escrevendo}
              onChange={(e) => { if (e.target.value === "__cerebros") setCerebrosAbertos(true); else setPara(e.target.value); }}
              className="rounded-full border bg-transparent px-2 py-1 text-xs text-muted-foreground" title="Cérebro: para quem é o texto">
              {esc.cerebros.map((c) => <option key={c.id} value={c.id}>🧠 Para: {c.nome}</option>)}
              <option value="nenhum">🧠 Sem cérebro</option>
              <option value="__cerebros">＋ Novo cérebro / editar…</option>
            </select>
          )}

          <select value={modelo} onChange={(e) => setModelo(e.target.value)} disabled={escrevendo}
            className="ml-auto rounded-full border bg-transparent px-2 py-1 text-xs text-muted-foreground">
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="haiku">Haiku (rápido)</option>
          </select>
          <button type="button" onClick={() => { setAberto(false); editor.commands.focus(); }}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted" title="Fechar (⌘I); o que estiver escrevendo continua">
            <X className="h-4 w-4" />
          </button>
        </div>

        {!lote && revisoes.length >= 2 && (
          <div className="mx-3 mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="flex-1">{revisoes.length} textos gerados neste documento.</span>
            <button type="button" onClick={apagarGerados} className="rounded-md border px-2 py-0.5 hover:bg-muted">Apagar os textos gerados</button>
          </div>
        )}
        {(vazios.length >= 2 || lote) && (
          <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
            {lote ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="flex-1">Gerando roteiros: <b>{lote.feitos} de {lote.total}</b> prontos{lote.agora.length ? ` · agora: ${lote.agora.join(", ")}` : ""}</span>
                <button type="button" onClick={parar} className="rounded-md border px-2 py-0.5 hover:bg-muted">Parar</button>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="flex-1">{vazios.length} roteiros ainda sem texto neste documento{cerebro ? ` · para ${cerebro.nome}` : ""}</span>
                <button type="button" onClick={() => void gerarTodos()} className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground hover:opacity-90">
                  Gerar todos ({vazios.length})
                </button>
              </>
            )}
          </div>
        )}
        {selecionado && (
          <div className="mx-3 mt-2 flex items-start gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-2 flex-1 italic">{selecionado}</span>
          </div>
        )}
        <div className="flex items-end gap-2 p-3">
          <textarea
            ref={campo}
            rows={1}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar(); }
              else if (e.key === "Escape") { e.preventDefault(); if (escrevendo) parar(); else { setAberto(false); editor.commands.focus(); } }
            }}
            placeholder={placeholder}
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          {escrevendo ? (
            <button type="button" onClick={parar} title="Parar (Esc)"
              className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background">
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button type="button" onClick={() => void enviar()} disabled={!texto.trim() && !escolhidasOrdem.length} title="Enviar (Enter)"
              className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-40">
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>

        {andamento && (
          <div className="flex items-center gap-2 border-t px-4 py-2 text-xs text-muted-foreground">
            {andamento.fase === "pensando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />}
            <span>
              <span className="font-medium text-foreground">{andamento.quem}</span>
              {andamento.etapa ? ` (${andamento.etapa})` : ""} {andamento.fase === "pensando" ? "lendo critérios e skills…" : andamento.fase === "revisando" ? "revisando por trás (pode continuar mexendo; no fim entra o On/Off)…" : "escrevendo no documento…"}
            </span>
            {escolhidasOrdem.length > 1 && (
              <span className="ml-auto">{escolhidasOrdem.map((e) => e.membro!.nome).join(" → ")}</span>
            )}
          </div>
        )}
       </div>
      </div>
    </>
  );
}
