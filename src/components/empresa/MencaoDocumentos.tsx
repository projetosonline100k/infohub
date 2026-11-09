import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AtSign, FileText, StickyNote, Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NOTA_PREFIX } from "@/hooks/useAssistantDocumentos";
import { cn } from "@/lib/utils";

// @ nos chats (09/11, Davi: "sempre que eu clicar em @, mostre as opções"): lista documentos, notas e desenhos
// (busca pelo título). O escolhido vira "@Título" no texto e, ao enviar, "📎 Para ler: …" no fim da mensagem, que
// quem responde abre pelo id. Usado em todos os chats de funcionário.
export interface DocMencao { id: string; titulo: string; tipo: string | null; nota: boolean }

export function useMencaoDocumentos(texto: string, setTexto: (t: string) => void) {
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const [mencao, setMencao] = useState<{ inicio: number; busca: string } | null>(null);
  const [idx, setIdx] = useState(0);
  const [sugestoes, setSugestoes] = useState<DocMencao[] | null>(null);
  const [anexos, setAnexos] = useState<DocMencao[]>([]);
  const termo = mencao?.busca;
  useEffect(() => {
    if (termo === undefined) { setSugestoes(null); return; }
    let vivo = true;
    const t = window.setTimeout(async () => {
      let q = supabase.from("documentos").select("id, titulo, tipo, conteudo").is("deleted_at", null).order("updated_at", { ascending: false }).limit(8);
      if (termo.trim()) q = q.ilike("titulo", `%${termo.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      const { data } = await q;
      if (!vivo) return;
      setSugestoes(((data ?? []) as { id: string; titulo: string | null; tipo: string | null; conteudo: string | null }[])
        .filter((d) => d.titulo?.trim()).map((d) => ({ id: d.id, titulo: d.titulo!, tipo: d.tipo, nota: !!d.conteudo?.startsWith(NOTA_PREFIX) })));
      setIdx(0);
    }, 150);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [termo]);

  const aoDigitar = (valor: string, cursor: number) => {
    setTexto(valor);
    const m = valor.slice(0, cursor).match(/(^|\s)@([^\n@]{0,40})$/);
    setMencao(m ? { inicio: cursor - m[2].length - 1, busca: m[2] } : null);
  };
  const escolher = (d: DocMencao) => {
    if (!mencao) return;
    const inserido = `@${d.titulo} `;
    setTexto(texto.slice(0, mencao.inicio) + inserido + texto.slice(mencao.inicio + 1 + mencao.busca.length));
    setAnexos((a) => (a.some((x) => x.id === d.id) ? a : [...a, d]));
    setMencao(null);
    const pos = mencao.inicio + inserido.length;
    requestAnimationFrame(() => { campoRef.current?.focus(); campoRef.current?.setSelectionRange(pos, pos); });
  };
  /** Texto + linhas "📎 Para ler" dos documentos citados com @. */
  const comAnexos = (digitado: string) => {
    const usados = anexos.filter((a) => digitado.includes(`@${a.titulo}`));
    return usados.length ? `${digitado}\n\n${usados.map((a) => `📎 Para ler: "${a.titulo}" (documento ${a.id})`).join("\n")}` : digitado;
  };
  const limpar = () => { setAnexos([]); setMencao(null); };
  /** true se a tecla foi usada pela lista (setas, Enter/Tab escolhem, Esc fecha). */
  const tecla = (e: KeyboardEvent): boolean => {
    if (!mencao) return false;
    if (e.key === "Escape") { e.preventDefault(); setMencao(null); return true; }
    if (!sugestoes?.length) return false;
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => (i + 1) % sugestoes.length); return true; }
    if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => (i - 1 + sugestoes.length) % sugestoes.length); return true; }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); escolher(sugestoes[idx] ?? sugestoes[0]); return true; }
    return false;
  };
  const lista = mencao ? (
    <ListaMencao busca={mencao.busca} sugestoes={sugestoes} idx={idx} onEscolher={escolher} />
  ) : null;
  return { campoRef, aoDigitar, comAnexos, limpar, tecla, lista };
}

function ListaMencao({ busca, sugestoes, idx, onEscolher }: { busca: string; sugestoes: DocMencao[] | null; idx: number; onEscolher: (d: DocMencao) => void }) {
  return (
    <div className="absolute bottom-full left-2 right-2 z-20 mb-1 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
      <p className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground"><AtSign className="h-3 w-3" />Documento, nota ou desenho para ler</p>
      {sugestoes === null ? <p className="px-2 py-2 text-xs text-muted-foreground">Buscando…</p>
        : sugestoes.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">Nada com “{busca}”.</p>
        : sugestoes.map((d, i) => {
          const Icone = d.nota ? StickyNote : d.tipo === "mapa" ? Workflow : FileText;
          return (
            <button key={d.id} type="button" onMouseDown={(e) => { e.preventDefault(); onEscolher(d); }}
              className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", i === idx ? "bg-accent" : "hover:bg-muted")}>
              <Icone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{d.titulo}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{d.nota ? "Nota" : d.tipo === "mapa" ? "Desenho" : "Doc"}</span>
            </button>
          );
        })}
    </div>
  );
}
