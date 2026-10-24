import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, Check, FileText, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InteligenciaMembro } from "./InteligenciaMembro";
import type { MembroResumo } from "@/lib/empresa/visaoGeral";
import { cn } from "@/lib/utils";

// Painel que abre ao clicar num pilar do mapa da inteligência (24/10, Davi: "clico e consigo editar,
// subir docs, ver as skills, abrir as skills; tem que ser funcional"). Cada tipo de pilar edita a fonte de
// verdade dele: membros.manual, setores.esteira (critérios/formatos da etapa), inteligencia_membros
// (skills, aprendizados, documentos).
const db = supabase as unknown as SupabaseClient;

/** `foco`: o item clicado no mapa (índice) ou "novo" (o "+" do pilar), para o painel já abrir nele. */
type Foco = { foco?: number | "novo" };
export type OrigemPilar =
  | ({ tipo: "manual" } & Foco)
  | ({ tipo: "etapa"; setorId: string; etapa: string; campo: "criterios" | "formatos" } & Foco)
  | ({ tipo: "skills"; abrir?: string } & Foco)
  | ({ tipo: "aprendizados" } & Foco)
  | ({ tipo: "conhecimento" } & Foco);

export interface MembroMapa extends MembroResumo { manual: string | null; cliente_id: string | null }

interface Etapa { nome: string; membro_id: string; criterios?: string | string[] | null; formatos?: { nome?: string; texto?: string }[] | null }
interface ItemIntel { id: string; nome: string; conteudo: string | null; caracteres: number | null; escopo: string; tipo: string }

// O item clicado no mapa aparece no meio do painel só ao abrir (ref de callback roda a cada tecla).
const rolados = new WeakSet<Element>();
const rolarUmaVez = (el: Element) => { if (!rolados.has(el)) { rolados.add(el); el.scrollIntoView({ block: "center" }); } };

const campo = "w-full rounded-md border border-foreground/15 bg-foreground/5 px-2 py-1.5 text-sm outline-none focus:border-sky-400";
const botao = "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

export function PainelNoMapa({ membro, origem, onFechar, onMudou }: {
  membro: MembroMapa; origem: OrigemPilar; onFechar: () => void; onMudou: () => void;
}) {
  const titulo = origem.tipo === "manual" ? "Manual" : origem.tipo === "etapa" ? `${origem.campo === "criterios" ? "Critérios" : "Formatos"} · ${origem.etapa}`
    : origem.tipo === "skills" ? "Skills" : origem.tipo === "aprendizados" ? "Aprendizados" : "Documentos e conhecimento";
  return (
    <div className="absolute inset-y-0 right-0 z-10 flex w-[480px] max-w-full flex-col border-l border-foreground/10 bg-card shadow-2xl"
      onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 border-b border-foreground/10 px-4 py-3">
        <p className="flex-1 truncate text-sm font-semibold">{titulo} <span className="font-normal text-foreground/50">· {membro.nome}</span></p>
        <button type="button" onClick={onFechar} className="rounded-md p-1 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {origem.tipo === "manual" && <Manual membro={membro} foco={origem.foco} onMudou={onMudou} />}
        {origem.tipo === "etapa" && <EditarEtapa membro={membro} origem={origem} onMudou={onMudou} />}
        {origem.tipo === "skills" && <Skills membro={membro} abrirId={origem.abrir} nova={origem.foco === "novo"} onMudou={onMudou} />}
        {origem.tipo === "aprendizados" && <Aprendizados membro={membro} foco={origem.foco} onMudou={onMudou} />}
        {origem.tipo === "conhecimento" && (membro.cliente_id
          ? <Conhecimento membro={membro as MembroMapa & { cliente_id: string }} conectar={origem.foco === "novo"} onMudou={onMudou} />
          : <p className="text-sm text-foreground/60">Este funcionário não está num projeto.</p>)}
      </div>
    </div>
  );
}

function Manual({ membro, foco, onMudou }: { membro: MembroMapa; foco?: number | "novo"; onMudou: () => void }) {
  const [texto, setTexto] = useState(() => (foco === "novo" && membro.manual?.trim() ? `${membro.manual.replace(/\s+$/, "")}\n` : membro.manual ?? ""));
  const [salvando, setSalvando] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  // Abre já na linha clicada no mapa (a k-ésima linha com texto), ou no fim para escrever uma nova.
  useEffect(() => {
    const el = area.current;
    if (!el || foco === undefined) return;
    el.focus();
    if (foco === "novo") { el.setSelectionRange(el.value.length, el.value.length); el.scrollTop = el.scrollHeight; return; }
    let inicio = 0, achou = -1;
    for (const linha of el.value.split("\n")) {
      if (linha.trim() && ++achou === foco) { el.setSelectionRange(inicio, inicio + linha.length); break; }
      inicio += linha.length + 1;
    }
    el.scrollTop = Math.max(0, (el.value.slice(0, inicio).split("\n").length - 3) * 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const salvar = async () => {
    setSalvando(true);
    const { error } = await db.from("membros").update({ manual: texto.trim() || null }).eq("id", membro.id);
    setSalvando(false);
    if (error) { toast.error("Não consegui salvar o manual"); return; }
    toast.success("Manual salvo");
    onMudou();
  };
  return (
    <div className="space-y-3">
      <p className="text-xs text-foreground/55">Como o {membro.nome} trabalha. Uma regra por linha fica melhor no mapa.</p>
      <textarea ref={area} value={texto} onChange={(e) => setTexto(e.target.value)} rows={16} className={cn(campo, "resize-y leading-relaxed")} />
      <button type="button" onClick={() => void salvar()} disabled={salvando || texto === (membro.manual ?? "")} className={cn(botao, "bg-sky-600 hover:bg-sky-500")}>
        {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Salvar manual
      </button>
    </div>
  );
}

function EditarEtapa({ membro, origem, onMudou }: { membro: MembroMapa; origem: Extract<OrigemPilar, { tipo: "etapa" }>; onMudou: () => void }) {
  const [esteira, setEsteira] = useState<Etapa[] | null>(null);
  const [criterios, setCriterios] = useState<string[]>([]);
  const [formatos, setFormatos] = useState<{ nome: string; texto: string }[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [focado, setFocado] = useState<number | null>(null);
  const indice = esteira?.findIndex((e) => e.membro_id === membro.id && e.nome === origem.etapa) ?? -1;
  useEffect(() => {
    void db.from("setores").select("esteira").eq("id", origem.setorId).maybeSingle().then(({ data }) => {
      const lista = ((data as { esteira?: Etapa[] } | null)?.esteira ?? []) as Etapa[];
      setEsteira(lista);
      const e = lista.find((x) => x.membro_id === membro.id && x.nome === origem.etapa);
      const c = e?.criterios;
      const crit = Array.isArray(c) ? c.map(String) : (c ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
      const forms = (e?.formatos ?? []).map((f) => ({ nome: f.nome ?? "", texto: f.texto ?? "" }));
      // O "+" do mapa já abre com um item vazio no fim; clicar num item abre focado nele.
      if (origem.foco === "novo") { if (origem.campo === "criterios") crit.push(""); else forms.push({ nome: "", texto: "" }); }
      setCriterios(crit);
      setFormatos(forms);
      const n = origem.campo === "criterios" ? crit.length : forms.length;
      setFocado(origem.foco === "novo" ? n - 1 : typeof origem.foco === "number" ? origem.foco : null);
    });
  }, [origem.setorId, origem.etapa, origem.campo, origem.foco, membro.id]);
  if (!esteira) return <Loader2 className="h-4 w-4 animate-spin text-foreground/50" />;
  if (indice < 0) return <p className="text-sm text-foreground/60">Não achei essa etapa na esteira.</p>;
  const salvar = async () => {
    setSalvando(true);
    const nova = esteira.map((e, k) => (k !== indice ? e : origem.campo === "criterios"
      ? { ...e, criterios: criterios.map((c) => c.trim()).filter(Boolean) }
      : { ...e, formatos: formatos.filter((f) => f.nome.trim() || f.texto.trim()) }));
    const { error } = await db.from("setores").update({ esteira: nova }).eq("id", origem.setorId);
    setSalvando(false);
    if (error) { toast.error("Não consegui salvar"); return; }
    setEsteira(nova);
    toast.success("Salvo");
    onMudou();
  };
  return (
    <div className="space-y-3">
      {origem.campo === "criterios" ? (
        <>
          <p className="text-xs text-foreground/55">O que o {membro.nome} confere, um por um, antes de entregar.</p>
          {criterios.map((c, k) => (
            <div key={k} className="flex items-start gap-2">
              <span className="mt-1.5 w-5 text-right text-xs text-foreground/40">{k + 1}.</span>
              <textarea value={c} rows={2} autoFocus={focado === k} ref={(el) => { if (el && focado === k) rolarUmaVez(el); }}
                onChange={(e) => setCriterios((l) => l.map((x, j) => (j === k ? e.target.value : x)))} className={cn(campo, "resize-y", focado === k && "border-sky-400")} placeholder="Novo critério" />
              <button type="button" onClick={() => setCriterios((l) => l.filter((_, j) => j !== k))} className="mt-1 text-foreground/40 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setCriterios((l) => [...l, ""])} className={cn(botao, "border border-dashed border-foreground/25 text-foreground/70 hover:text-foreground")}><Plus className="h-3.5 w-3.5" />Critério</button>
        </>
      ) : (
        <>
          <p className="text-xs text-foreground/55">Estruturas de referência: ele escolhe a que mais combina e segue.</p>
          {formatos.map((f, k) => (
            <div key={k} className={cn("space-y-1.5 rounded-lg border p-2.5", focado === k ? "border-sky-400" : "border-foreground/10")}
              ref={(el) => { if (el && focado === k) rolarUmaVez(el); }}>
              <div className="flex items-center gap-2">
                <input value={f.nome} placeholder={`Formato ${k + 1}`} autoFocus={focado === k} onChange={(e) => setFormatos((l) => l.map((x, j) => (j === k ? { ...x, nome: e.target.value } : x)))} className={campo} />
                <button type="button" onClick={() => setFormatos((l) => l.filter((_, j) => j !== k))} className="text-foreground/40 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
              </div>
              <textarea value={f.texto} rows={6} placeholder="O formato (estrutura, exemplo)" onChange={(e) => setFormatos((l) => l.map((x, j) => (j === k ? { ...x, texto: e.target.value } : x)))} className={cn(campo, "resize-y")} />
            </div>
          ))}
          <button type="button" onClick={() => setFormatos((l) => [...l, { nome: "", texto: "" }])} className={cn(botao, "border border-dashed border-foreground/25 text-foreground/70 hover:text-foreground")}><Plus className="h-3.5 w-3.5" />Formato</button>
        </>
      )}
      <div><button type="button" onClick={() => void salvar()} disabled={salvando} className={cn(botao, "bg-sky-600 hover:bg-sky-500")}>
        {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Salvar
      </button></div>
    </div>
  );
}

function useItens(membro: MembroMapa, filtro: (i: ItemIntel) => boolean) {
  const [itens, setItens] = useState<ItemIntel[] | null>(null);
  const filtroRef = useRef(filtro);
  const carregar = useCallback(async () => {
    const { data } = await db.from("inteligencia_membros").select("id, nome, conteudo, caracteres, escopo, tipo")
      .eq("agente", membro.nome.trim().toLowerCase())
      .or(`escopo.eq.geral${membro.cliente_id ? `,cliente_id.eq.${membro.cliente_id}` : ""}`).order("nome");
    setItens(((data ?? []) as ItemIntel[]).filter(filtroRef.current));
  }, [membro.nome, membro.cliente_id]);
  useEffect(() => { void carregar(); }, [carregar]);
  return { itens, carregar };
}

const ehSkill = (i: ItemIntel) => i.nome.startsWith("Skill:");
const nomeSkill = (n: string) => n.replace(/^Skill:\s*/, "");

function Skills({ membro, abrirId, nova, onMudou }: { membro: MembroMapa; abrirId?: string; nova?: boolean; onMudou: () => void }) {
  const { itens, carregar } = useItens(membro, ehSkill);
  const [aberta, setAberta] = useState<{ id: string | null; nome: string; conteudo: string; escopo: string } | null>(
    nova ? { id: null, nome: "", conteudo: "", escopo: "geral" } : null);
  const [salvando, setSalvando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!abrirId || !itens) return;
    const s = itens.find((i) => i.id === abrirId);
    if (s) setAberta({ id: s.id, nome: nomeSkill(s.nome), conteudo: s.conteudo ?? "", escopo: s.escopo });
  }, [abrirId, itens]);
  const salvar = async () => {
    if (!aberta || !aberta.nome.trim()) return;
    setSalvando(true);
    const linha = { nome: `Skill: ${aberta.nome.trim()}`, conteudo: aberta.conteudo, caracteres: aberta.conteudo.length, status: "pronto", escopo: aberta.escopo };
    const { error } = aberta.id
      ? await db.from("inteligencia_membros").update(linha).eq("id", aberta.id)
      : await db.from("inteligencia_membros").insert({ ...linha, tipo: "texto", cliente_id: membro.cliente_id, membro_id: membro.id, agente: membro.nome.trim().toLowerCase() });
    setSalvando(false);
    if (error) { toast.error("Não consegui salvar a skill"); return; }
    toast.success("Skill salva");
    setAberta(null);
    void carregar(); onMudou();
  };
  const apagar = async (id: string, nome: string) => {
    if (!window.confirm(`Apagar a skill "${nome}" do ${membro.nome}?`)) return;
    const { error } = await db.from("inteligencia_membros").delete().eq("id", id);
    if (error) { toast.error("Não consegui apagar"); return; }
    setAberta(null); void carregar(); onMudou();
  };
  const doArquivo = async (f: File | undefined) => {
    if (!f) return;
    setAberta({ id: null, nome: f.name.replace(/\.(md|txt|markdown)$/i, ""), conteudo: await f.text(), escopo: "geral" });
    if (arquivo.current) arquivo.current.value = "";
  };

  if (aberta) return (
    <div className="space-y-3">
      <button type="button" onClick={() => setAberta(null)} className="flex items-center gap-1 text-xs text-foreground/60 hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Todas as skills</button>
      <input value={aberta.nome} onChange={(e) => setAberta({ ...aberta, nome: e.target.value })} placeholder="Nome da skill" className={cn(campo, "font-semibold")} />
      <select value={aberta.escopo} onChange={(e) => setAberta({ ...aberta, escopo: e.target.value })} className={campo}>
        <option value="geral">Geral do funcionário (todo projeto)</option>
        <option value="projeto">Só deste projeto</option>
      </select>
      <textarea value={aberta.conteudo} onChange={(e) => setAberta({ ...aberta, conteudo: e.target.value })} rows={22}
        className={cn(campo, "resize-y font-mono text-[12px] leading-relaxed")} placeholder="O método, passo a passo" />
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void salvar()} disabled={salvando || !aberta.nome.trim()} className={cn(botao, "bg-sky-600 hover:bg-sky-500")}>
          {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Salvar skill
        </button>
        {aberta.id && <button type="button" onClick={() => void apagar(aberta.id!, aberta.nome)} className={cn(botao, "ml-auto text-rose-300 hover:bg-rose-500/10")}><Trash2 className="h-3.5 w-3.5" />Apagar</button>}
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button type="button" onClick={() => setAberta({ id: null, nome: "", conteudo: "", escopo: "geral" })} className={cn(botao, "bg-sky-600 hover:bg-sky-500")}><Plus className="h-3.5 w-3.5" />Nova skill</button>
        <button type="button" onClick={() => arquivo.current?.click()} className={cn(botao, "border border-foreground/15 hover:bg-foreground/10")}><Upload className="h-3.5 w-3.5" />Subir .md / .txt</button>
        <input ref={arquivo} type="file" accept=".md,.txt,.markdown,text/plain,text/markdown" className="hidden" onChange={(e) => void doArquivo(e.target.files?.[0])} />
      </div>
      {itens === null ? <Loader2 className="h-4 w-4 animate-spin text-foreground/50" /> : !itens.length ? <p className="text-sm text-foreground/60">Nenhuma skill ainda.</p> : itens.map((s) => (
        <button key={s.id} type="button" onClick={() => setAberta({ id: s.id, nome: nomeSkill(s.nome), conteudo: s.conteudo ?? "", escopo: s.escopo })}
          className="flex w-full items-center gap-2 rounded-lg border border-foreground/10 px-3 py-2 text-left hover:bg-foreground/5">
          <FileText className="h-4 w-4 shrink-0 text-sky-300" />
          <span className="flex-1 truncate text-sm">{nomeSkill(s.nome)}</span>
          <span className="text-[11px] text-foreground/45">{s.escopo === "geral" ? "geral" : "projeto"}{s.caracteres ? ` · ${Math.round(s.caracteres / 1000)}k` : ""}</span>
        </button>
      ))}
    </div>
  );
}

// Aprendizados (24/10: "editar cada item, + para criar"): cada linha "- (dd/mm) regra" vira um campo; o "+" acrescenta
// uma linha no registro do projeto (o mesmo que scripts/inteligencia/aprender.py usa).
const NOME_APRENDIZADOS = "Aprendizados com o Davi";
const semMarca = (l: string) => l.replace(/^[-•*\s]+/, "").replace(/^\(\d{2}\/\d{2}\)\s*/, "").trim();
const dataDe = (l: string) => l.match(/^[-•*\s]*\((\d{2}\/\d{2})\)/)?.[1];

function Aprendizados({ membro, foco, onMudou }: { membro: MembroMapa; foco?: number | "novo"; onMudou: () => void }) {
  const { itens, carregar } = useItens(membro, (i) => i.tipo === "aprendizado");
  const [linhas, setLinhas] = useState<Record<string, { data?: string; texto: string }[]>>({});
  const [novo, setNovo] = useState(foco === "novo" ? "" : null as string | null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!itens) return;
    setLinhas(Object.fromEntries(itens.map((a) => [a.id, (a.conteudo ?? "").split(/\n+/).filter((l) => l.trim()).map((l) => ({ data: dataDe(l), texto: semMarca(l) }))])));
  }, [itens]);
  const montar = (ls: { data?: string; texto: string }[]) => ls.filter((l) => l.texto.trim()).map((l) => `- ${l.data ? `(${l.data}) ` : ""}${l.texto.trim()}`).join("\n");
  const hoje = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`; };
  const salvar = async () => {
    if (!itens) return;
    setSalvando(true);
    try {
      for (const a of itens) {
        const texto = montar(linhas[a.id] ?? []);
        if (texto !== (a.conteudo ?? "").trim()) {
          const { error } = await db.from("inteligencia_membros").update({ conteudo: texto, caracteres: texto.length }).eq("id", a.id);
          if (error) throw error;
        }
      }
      if (novo?.trim()) {
        const linha = `- (${hoje()}) ${novo.trim()}`;
        const doProjeto = itens.find((a) => a.escopo === "projeto") ?? itens[0];
        const { error } = doProjeto
          ? await db.from("inteligencia_membros").update({ conteudo: [montar(linhas[doProjeto.id] ?? []), linha].filter(Boolean).join("\n") }).eq("id", doProjeto.id)
          : await db.from("inteligencia_membros").insert({ cliente_id: membro.cliente_id, membro_id: membro.id, agente: membro.nome.trim().toLowerCase(),
              escopo: "projeto", tipo: "aprendizado", nome: NOME_APRENDIZADOS, observacao: "Anotado no mapa da inteligência.", conteudo: linha, caracteres: linha.length, status: "pronto" });
        if (error) throw error;
        setNovo(null);
      }
      toast.success("Aprendizados salvos");
      void carregar(); onMudou();
    } catch {
      toast.error("Não consegui salvar os aprendizados");
    } finally {
      setSalvando(false);
    }
  };
  if (itens === null) return <Loader2 className="h-4 w-4 animate-spin text-foreground/50" />;
  let n = -1;
  return (
    <div className="space-y-3">
      <p className="text-xs text-foreground/55">Regras que o {membro.nome} segue sempre (aparecem no topo do que ele lê). Uma por campo.</p>
      {itens.map((a) => (
        <div key={a.id} className="space-y-2">
          {itens.length > 1 && <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/45">{a.nome} · {a.escopo === "geral" ? "geral" : "projeto"}</p>}
          {(linhas[a.id] ?? []).map((l, k) => {
            n += 1;
            const focado = foco === n;
            return (
              <div key={k} className="flex items-start gap-2">
                <span className="mt-2 w-10 shrink-0 text-right text-[10px] text-foreground/40">{l.data ?? ""}</span>
                <textarea value={l.texto} rows={2} autoFocus={focado} ref={(el) => { if (el && focado) rolarUmaVez(el); }}
                  onChange={(e) => setLinhas((m) => ({ ...m, [a.id]: m[a.id].map((x, j) => (j === k ? { ...x, texto: e.target.value } : x)) }))}
                  className={cn(campo, "resize-y", focado && "border-sky-400")} />
                <button type="button" title="Tirar" onClick={() => setLinhas((m) => ({ ...m, [a.id]: m[a.id].filter((_, j) => j !== k) }))}
                  className="mt-1.5 text-foreground/40 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
      ))}
      {novo !== null ? (
        <div className="flex items-start gap-2">
          <span className="mt-2 w-10 shrink-0 text-right text-[10px] text-sky-300">novo</span>
          <textarea value={novo} rows={2} autoFocus onChange={(e) => setNovo(e.target.value)} placeholder="Ex.: Headline sempre com número no começo"
            className={cn(campo, "resize-y border-sky-400")} />
        </div>
      ) : (
        <button type="button" onClick={() => setNovo("")} className={cn(botao, "border border-dashed border-foreground/25 text-foreground/70 hover:text-foreground")}><Plus className="h-3.5 w-3.5" />Aprendizado</button>
      )}
      <div><button type="button" onClick={() => void salvar()} disabled={salvando} className={cn(botao, "bg-sky-600 hover:bg-sky-500")}>
        {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Salvar
      </button></div>
    </div>
  );
}

// Documentos (24/10, Davi: "conectar algum documento"): além de subir arquivo/link (InteligenciaMembro), dá para
// ligar um documento do app (roteiros, headlines…): o texto dele entra como conhecimento do funcionário.
const textoDoHtml = (html: string | null) => {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html.replace(/<\/(p|h\d|li|blockquote)>/gi, "</$1>\n").replace(/<br\s*\/?>/gi, "\n"), "text/html");
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
};

function Conhecimento({ membro, conectar, onMudou }: { membro: MembroMapa & { cliente_id: string }; conectar?: boolean; onMudou: () => void }) {
  const [aberto, setAberto] = useState(!!conectar);
  const [busca, setBusca] = useState("");
  const [docs, setDocs] = useState<{ id: string; titulo: string; cliente_id: string | null; updated_at: string }[] | null>(null);
  const [ligando, setLigando] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  // De qual projeto vêm os documentos (24/10, Davi: "preciso conseguir selecionar o projeto"): começa no do
  // funcionário; "todos" busca em todos; "sem" são os documentos fora de projeto.
  const [projeto, setProjeto] = useState<string>(membro.cliente_id);
  const [projetos, setProjetos] = useState<{ id: string; nome_especialista: string }[]>([]);
  useEffect(() => {
    if (!aberto || projetos.length) return;
    void db.from("clientes").select("id, nome_especialista").eq("arquivado", false).order("nome_especialista")
      .then(({ data }) => setProjetos((data ?? []) as typeof projetos));
  }, [aberto, projetos.length]);
  useEffect(() => {
    if (!aberto) return;
    const t = window.setTimeout(() => {
      // Desenhos (tipo "mapa") não têm texto para virar conhecimento: ficam fora da lista.
      let q = db.from("documentos").select("id, titulo, cliente_id, updated_at").is("deleted_at", null).neq("tipo", "mapa")
        .order("updated_at", { ascending: false }).limit(40);
      if (busca.trim()) q = q.ilike("titulo", `%${busca.trim()}%`);
      if (projeto === "sem") q = q.is("cliente_id", null);
      else if (projeto !== "todos") q = q.eq("cliente_id", projeto);
      void q.then(({ data }) => setDocs((data ?? []) as typeof docs));
    }, 200);
    return () => window.clearTimeout(t);
  }, [aberto, busca, projeto]);
  const nomeProjeto = (id: string | null) => (id ? projetos.find((p) => p.id === id)?.nome_especialista ?? "" : "sem projeto");
  const ligar = async (d: { id: string; titulo: string }) => {
    setLigando(d.id);
    const { data } = await db.from("documentos").select("conteudo").eq("id", d.id).maybeSingle();
    const conteudo = (data as { conteudo: string | null } | null)?.conteudo ?? null;
    const texto = conteudo?.startsWith("__") ? "" : textoDoHtml(conteudo);
    if (!texto) { setLigando(null); toast.error("Esse documento está vazio (ou é um desenho)"); return; }
    const { error } = await db.from("inteligencia_membros").insert({
      cliente_id: membro.cliente_id, membro_id: membro.id, agente: membro.nome.trim().toLowerCase(), escopo: "projeto", tipo: "texto",
      nome: `Documento: ${d.titulo || "Sem título"}`, observacao: `Conectado do documento ${d.id} (cópia do texto de ${new Date().toLocaleDateString("pt-BR")}).`,
      conteudo: texto, caracteres: texto.length, status: "pronto",
    });
    setLigando(null);
    if (error) { toast.error("Não consegui conectar o documento"); return; }
    toast.success(`"${d.titulo}" conectado ao ${membro.nome}`);
    setAberto(false); setBusca("");
    setVersao((v) => v + 1);
    onMudou();
  };
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-foreground/10 p-3">
        <button type="button" onClick={() => setAberto((a) => !a)} className="flex w-full items-center gap-2 text-left text-sm font-semibold">
          <FileText className="h-4 w-4 text-sky-300" />Conectar documento do app
          <Plus className={cn("ml-auto h-4 w-4 transition-transform", aberto && "rotate-45")} />
        </button>
        {aberto && (
          <div className="mt-3 space-y-2">
            <select value={projeto} onChange={(e) => setProjeto(e.target.value)} className={campo} aria-label="Projeto dos documentos">
              <option value={membro.cliente_id}>Projeto do {membro.nome}{nomeProjeto(membro.cliente_id) ? ` (${nomeProjeto(membro.cliente_id)})` : ""}</option>
              <option value="todos">Todos os projetos</option>
              <option value="sem">Sem projeto</option>
              {projetos.filter((p) => p.id !== membro.cliente_id).map((p) => <option key={p.id} value={p.id}>{p.nome_especialista}</option>)}
            </select>
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar documento pelo nome" className={campo} />
            {docs === null ? <Loader2 className="h-4 w-4 animate-spin text-foreground/50" /> : !docs.length ? <p className="text-xs text-foreground/50">Nenhum documento.</p> : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {docs.map((d) => (
                  <button key={d.id} type="button" disabled={!!ligando} onClick={() => void ligar(d)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-foreground/10 disabled:opacity-50">
                    {ligando === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-foreground/50" />}
                    <span className="min-w-0 flex-1 truncate">{d.titulo || "Sem título"}</span>
                    {projeto === "todos" && <span className="max-w-[90px] shrink-0 truncate text-[10.5px] text-foreground/50">{nomeProjeto(d.cliente_id)}</span>}
                    <span className="text-[11px] text-foreground/40">{new Date(d.updated_at).toLocaleDateString("pt-BR")}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[11px] text-foreground/45">O texto do documento vira conhecimento do {membro.nome} (uma cópia de hoje; se o documento mudar, conecte de novo).</p>
          </div>
        )}
      </div>
      <div className="text-foreground"><InteligenciaMembro key={versao} clienteId={membro.cliente_id} membro={membro} /></div>
    </div>
  );
}
