import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { ArrowLeft, Bold, FileText, Heading2, Italic, Link2, List, Loader2, Pause, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmar } from "@/components/DialogosGlobais";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TituloRecolhivel } from "@/lib/tiptapTituloRecolhivel";
import { HeadlineTitulo } from "@/lib/tiptapHeadlineTitulo";
import { cn } from "@/lib/utils";

const db = supabase as unknown as SupabaseClient;

export type Secao = "creator" | "materiais";
export const SECOES: Record<Secao, { nome: string; item: string; vazio: string }> = {
  creator: { nome: "Creator", item: "Bloco", vazio: "Crie o Bloco 1, abra e escreva o documento (headlines, roteiros, orientações). Cada bloco aparece na guia Creator do embaixador." },
  materiais: { nome: "Materiais", item: "Material", vazio: "Crie o primeiro material e escreva o documento dele. Ele aparece na guia Materiais do embaixador." },
};

const extensoes = (placeholder?: string) => [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  TituloRecolhivel,
  HeadlineTitulo,
  ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
];
const classeDoc = "prose prose-base max-w-none dark:prose-invert document-editor focus:outline-none";

/** Documento só para ler (área do embaixador). */
export function LeitorBloco({ html }: { html: string }) {
  const editor = useEditor({ extensions: extensoes(), content: html, editable: false }, [html]);
  return <EditorContent editor={editor} className={classeDoc} />;
}

function Barra({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  const B = ({ ativo, onClick, children, titulo }: { ativo?: boolean; onClick: () => void; children: React.ReactNode; titulo: string }) => (
    <button type="button" title={titulo} onClick={onClick} className={cn("grid h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white", ativo && "bg-violet-600 text-white")}>{children}</button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-3 py-2">
      <B titulo="Título" ativo={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></B>
      <B titulo="Negrito" ativo={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></B>
      <B titulo="Itálico" ativo={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></B>
      <B titulo="Lista" ativo={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></B>
      <B titulo="Link" ativo={editor.isActive("link")} onClick={() => { const atual = editor.getAttributes("link").href as string | undefined; const url = window.prompt("Endereço do link (vazio remove)", atual ?? "https://"); if (url === null) return; if (!url.trim()) editor.chain().focus().unsetLink().run(); else editor.chain().focus().setLink({ href: url.trim() }).run(); }}><Link2 className="h-4 w-4" /></B>
      <span className="ml-2 text-xs text-white/40">Dica: uma linha “Headline 1” vira título que dá para recolher.</span>
    </div>
  );
}

interface Bloco { id: string; titulo: string; conteudo: string; ativo: boolean; ordem: number; embaixador_id: string | null }

function Documento({ bloco, embaixadores, onVoltar, onMudou }: { bloco: Bloco; embaixadores: { id: string; nome: string }[]; onVoltar: () => void; onMudou: () => void }) {
  const [titulo, setTitulo] = useState(bloco.titulo);
  const [para, setPara] = useState(bloco.embaixador_id ?? "");
  const [estado, setEstado] = useState<"salvo" | "salvando">("salvo");
  const tituloRef = useRef(titulo); tituloRef.current = titulo;
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const html = useRef(bloco.conteudo);

  const salvar = useCallback(async () => {
    setEstado("salvando");
    const { error } = await db.from("embaixador_blocos").update({ titulo: tituloRef.current.trim() || bloco.titulo, conteudo: html.current }).eq("id", bloco.id);
    if (error) toast.error(error.message.includes("check") ? "Documento grande demais." : error.message);
    setEstado("salvo");
  }, [bloco.id, bloco.titulo]);
  const agendar = useCallback(() => { clearTimeout(timer.current); setEstado("salvando"); timer.current = setTimeout(() => void salvar(), 800); }, [salvar]);
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void salvar().then(onMudou); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const editor = useEditor({ extensions: extensoes("Escreva aqui: headlines, roteiros, orientações…"), content: bloco.conteudo, onUpdate: ({ editor: e }) => { html.current = e.getHTML(); agendar(); } });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="text-white/80 hover:bg-white/10 hover:text-white" onClick={onVoltar}><ArrowLeft className="mr-1.5 h-4 w-4" />Voltar</Button>
        <Input className="h-10 max-w-sm border-white/10 bg-white/5 text-base font-semibold text-white" value={titulo} maxLength={120} onChange={(e) => { setTitulo(e.target.value); agendar(); }} />
        <label className="flex items-center gap-2 text-xs text-white/60">Para
          <select className="h-9 rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white" value={para} onChange={(e) => { setPara(e.target.value); void db.from("embaixador_blocos").update({ embaixador_id: e.target.value || null }).eq("id", bloco.id); }}>
            <option className="text-black" value="">Todos os embaixadores</option>{embaixadores.map((x) => <option className="text-black" key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </label>
        <span className="ml-auto text-xs text-white/50">{estado === "salvando" ? "Salvando…" : "Salvo"}</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
        <Barra editor={editor} />
        <div className="min-h-[420px] px-6 py-6 md:px-10"><EditorContent editor={editor} className={classeDoc} /></div>
      </div>
    </div>
  );
}

/** Guia do administrador: lista de blocos da seção; clicar abre o documento para escrever. */
export function BlocosAdmin({ clienteId, secao, embaixadores }: { clienteId: string; secao: Secao; embaixadores: { id: string; nome: string }[] }) {
  const cfg = SECOES[secao];
  const [lista, setLista] = useState<Bloco[] | null>(null);
  const [aberto, setAberto] = useState<Bloco | null>(null);
  const carregar = useCallback(async () => {
    const { data } = await db.from("embaixador_blocos").select("id, titulo, conteudo, ativo, ordem, embaixador_id").eq("cliente_id", clienteId).eq("secao", secao).order("ordem").order("criado_em");
    setLista((data ?? []) as Bloco[]);
  }, [clienteId, secao]);
  useEffect(() => { setAberto(null); setLista(null); void carregar(); }, [carregar]);

  async function novo() {
    const n = (lista?.length ?? 0) + 1;
    const { data, error } = await db.from("embaixador_blocos").insert({ cliente_id: clienteId, secao, titulo: `${cfg.item} ${n}`, ordem: n }).select("id, titulo, conteudo, ativo, ordem, embaixador_id").single();
    if (error || !data) { toast.error(error?.message ?? "Não consegui criar"); return; }
    await carregar(); setAberto(data as Bloco);
  }
  async function remover(b: Bloco) {
    if (!(await confirmar(`Apagar "${b.titulo}"?`, { descricao: "O documento some para os embaixadores e não dá para recuperar.", botao: "Apagar" }))) return;
    await db.from("embaixador_blocos").delete().eq("id", b.id); void carregar();
  }

  if (aberto) return <Documento key={aberto.id} bloco={aberto} embaixadores={embaixadores} onVoltar={() => { setAberto(null); void carregar(); }} onMudou={() => void carregar()} />;
  if (!lista) return <div className="p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>;
  const quem = (b: Bloco) => (b.embaixador_id ? embaixadores.find((x) => x.id === b.embaixador_id)?.nome ?? "—" : "Todos");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-white/60">{lista.length ? `Clique em um ${cfg.item.toLowerCase()} para abrir o documento e escrever. Ele aparece na guia ${cfg.nome} do embaixador.` : cfg.vazio}</p>
        <Button className="rounded-xl bg-violet-600 hover:bg-violet-700" onClick={() => void novo()}><Plus className="mr-1.5 h-4 w-4" />Novo {cfg.item.toLowerCase()}</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((b) => (
          <div key={b.id} className={cn("group relative rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-violet-400/50", !b.ativo && "opacity-60")}>
            <button className="block w-full text-left" onClick={() => setAberto(b)}>
              <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-violet-500/20 text-violet-300"><FileText className="h-5 w-5" /></span>
              <div className="font-semibold">{b.titulo}</div>
              <div className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs text-white/50">{b.conteudo.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || "Documento vazio"}</div>
              <div className="mt-2 text-xs text-white/40">Para: {quem(b)}</div>
            </button>
            <div className="absolute right-2 top-2 flex opacity-0 transition group-hover:opacity-100">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:bg-white/10" title={b.ativo ? "Esconder do embaixador" : "Mostrar"} onClick={() => void db.from("embaixador_blocos").update({ ativo: !b.ativo }).eq("id", b.id).then(carregar)}>{b.ativo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-white/70 hover:bg-white/10" title="Apagar" onClick={() => void remover(b)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
