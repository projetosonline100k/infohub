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

export type OrigemPilar =
  | { tipo: "manual" }
  | { tipo: "etapa"; setorId: string; etapa: string; campo: "criterios" | "formatos" }
  | { tipo: "skills"; abrir?: string }
  | { tipo: "aprendizados" }
  | { tipo: "conhecimento" };

export interface MembroMapa extends MembroResumo { manual: string | null; cliente_id: string | null }

interface Etapa { nome: string; membro_id: string; criterios?: string | string[] | null; formatos?: { nome?: string; texto?: string }[] | null }
interface ItemIntel { id: string; nome: string; conteudo: string | null; caracteres: number | null; escopo: string; tipo: string }

const campo = "w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-sm outline-none focus:border-sky-400";
const botao = "flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

export function PainelNoMapa({ membro, origem, onFechar, onMudou }: {
  membro: MembroMapa; origem: OrigemPilar; onFechar: () => void; onMudou: () => void;
}) {
  const titulo = origem.tipo === "manual" ? "Manual" : origem.tipo === "etapa" ? `${origem.campo === "criterios" ? "Critérios" : "Formatos"} · ${origem.etapa}`
    : origem.tipo === "skills" ? "Skills" : origem.tipo === "aprendizados" ? "Aprendizados" : "Documentos e conhecimento";
  return (
    <div className="absolute inset-y-0 right-0 z-10 flex w-[480px] max-w-full flex-col border-l border-white/10 bg-[#0f1625] shadow-2xl"
      onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <p className="flex-1 truncate text-sm font-semibold">{titulo} <span className="font-normal text-white/50">· {membro.nome}</span></p>
        <button type="button" onClick={onFechar} className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {origem.tipo === "manual" && <Manual membro={membro} onMudou={onMudou} />}
        {origem.tipo === "etapa" && <EditarEtapa membro={membro} origem={origem} onMudou={onMudou} />}
        {origem.tipo === "skills" && <Skills membro={membro} abrirId={origem.abrir} onMudou={onMudou} />}
        {origem.tipo === "aprendizados" && <Aprendizados membro={membro} onMudou={onMudou} />}
        {origem.tipo === "conhecimento" && (membro.cliente_id
          ? <div className="dark text-foreground"><InteligenciaMembro clienteId={membro.cliente_id} membro={membro} /></div>
          : <p className="text-sm text-white/60">Este funcionário não está num projeto.</p>)}
      </div>
    </div>
  );
}

function Manual({ membro, onMudou }: { membro: MembroMapa; onMudou: () => void }) {
  const [texto, setTexto] = useState(membro.manual ?? "");
  const [salvando, setSalvando] = useState(false);
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
      <p className="text-xs text-white/55">Como o {membro.nome} trabalha. Uma regra por linha fica melhor no mapa.</p>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={16} className={cn(campo, "resize-y leading-relaxed")} />
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
  const indice = esteira?.findIndex((e) => e.membro_id === membro.id && e.nome === origem.etapa) ?? -1;
  useEffect(() => {
    void db.from("setores").select("esteira").eq("id", origem.setorId).maybeSingle().then(({ data }) => {
      const lista = ((data as { esteira?: Etapa[] } | null)?.esteira ?? []) as Etapa[];
      setEsteira(lista);
      const e = lista.find((x) => x.membro_id === membro.id && x.nome === origem.etapa);
      const c = e?.criterios;
      setCriterios(Array.isArray(c) ? c.map(String) : (c ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean));
      setFormatos((e?.formatos ?? []).map((f) => ({ nome: f.nome ?? "", texto: f.texto ?? "" })));
    });
  }, [origem.setorId, origem.etapa, membro.id]);
  if (!esteira) return <Loader2 className="h-4 w-4 animate-spin text-white/50" />;
  if (indice < 0) return <p className="text-sm text-white/60">Não achei essa etapa na esteira.</p>;
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
          <p className="text-xs text-white/55">O que o {membro.nome} confere, um por um, antes de entregar.</p>
          {criterios.map((c, k) => (
            <div key={k} className="flex items-start gap-2">
              <span className="mt-1.5 w-5 text-right text-xs text-white/40">{k + 1}.</span>
              <textarea value={c} rows={2} onChange={(e) => setCriterios((l) => l.map((x, j) => (j === k ? e.target.value : x)))} className={cn(campo, "resize-y")} />
              <button type="button" onClick={() => setCriterios((l) => l.filter((_, j) => j !== k))} className="mt-1 text-white/40 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setCriterios((l) => [...l, ""])} className={cn(botao, "border border-dashed border-white/25 text-white/70 hover:text-white")}><Plus className="h-3.5 w-3.5" />Critério</button>
        </>
      ) : (
        <>
          <p className="text-xs text-white/55">Estruturas de referência: ele escolhe a que mais combina e segue.</p>
          {formatos.map((f, k) => (
            <div key={k} className="space-y-1.5 rounded-lg border border-white/10 p-2.5">
              <div className="flex items-center gap-2">
                <input value={f.nome} placeholder={`Formato ${k + 1}`} onChange={(e) => setFormatos((l) => l.map((x, j) => (j === k ? { ...x, nome: e.target.value } : x)))} className={campo} />
                <button type="button" onClick={() => setFormatos((l) => l.filter((_, j) => j !== k))} className="text-white/40 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
              </div>
              <textarea value={f.texto} rows={6} placeholder="O formato (estrutura, exemplo)" onChange={(e) => setFormatos((l) => l.map((x, j) => (j === k ? { ...x, texto: e.target.value } : x)))} className={cn(campo, "resize-y")} />
            </div>
          ))}
          <button type="button" onClick={() => setFormatos((l) => [...l, { nome: "", texto: "" }])} className={cn(botao, "border border-dashed border-white/25 text-white/70 hover:text-white")}><Plus className="h-3.5 w-3.5" />Formato</button>
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

function Skills({ membro, abrirId, onMudou }: { membro: MembroMapa; abrirId?: string; onMudou: () => void }) {
  const { itens, carregar } = useItens(membro, ehSkill);
  const [aberta, setAberta] = useState<{ id: string | null; nome: string; conteudo: string; escopo: string } | null>(null);
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
      <button type="button" onClick={() => setAberta(null)} className="flex items-center gap-1 text-xs text-white/60 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" />Todas as skills</button>
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
        <button type="button" onClick={() => arquivo.current?.click()} className={cn(botao, "border border-white/15 hover:bg-white/10")}><Upload className="h-3.5 w-3.5" />Subir .md / .txt</button>
        <input ref={arquivo} type="file" accept=".md,.txt,.markdown,text/plain,text/markdown" className="hidden" onChange={(e) => void doArquivo(e.target.files?.[0])} />
      </div>
      {itens === null ? <Loader2 className="h-4 w-4 animate-spin text-white/50" /> : !itens.length ? <p className="text-sm text-white/60">Nenhuma skill ainda.</p> : itens.map((s) => (
        <button key={s.id} type="button" onClick={() => setAberta({ id: s.id, nome: nomeSkill(s.nome), conteudo: s.conteudo ?? "", escopo: s.escopo })}
          className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-left hover:bg-white/5">
          <FileText className="h-4 w-4 shrink-0 text-sky-300" />
          <span className="flex-1 truncate text-sm">{nomeSkill(s.nome)}</span>
          <span className="text-[11px] text-white/45">{s.escopo === "geral" ? "geral" : "projeto"}{s.caracteres ? ` · ${Math.round(s.caracteres / 1000)}k` : ""}</span>
        </button>
      ))}
    </div>
  );
}

function Aprendizados({ membro, onMudou }: { membro: MembroMapa; onMudou: () => void }) {
  const { itens, carregar } = useItens(membro, (i) => i.tipo === "aprendizado");
  const apagar = async (id: string) => {
    if (!window.confirm("Apagar este aprendizado?")) return;
    const { error } = await db.from("inteligencia_membros").delete().eq("id", id);
    if (error) { toast.error("Não consegui apagar"); return; }
    void carregar(); onMudou();
  };
  if (itens === null) return <Loader2 className="h-4 w-4 animate-spin text-white/50" />;
  if (!itens.length) return <p className="text-sm text-white/60">Nenhum aprendizado ainda. Eles aparecem quando você corrige o {membro.nome} e ele anota.</p>;
  return (
    <div className="space-y-3">
      {itens.map((a) => (
        <div key={a.id} className="rounded-lg border border-white/10 p-3">
          <div className="mb-1 flex items-center gap-2">
            <p className="flex-1 truncate text-sm font-semibold">{a.nome}</p>
            <button type="button" onClick={() => void apagar(a.id)} className="text-white/40 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
          </div>
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/70">{a.conteudo}</p>
        </div>
      ))}
    </div>
  );
}
