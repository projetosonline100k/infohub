import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Eye, Hash, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// 24/10 (Davi): "quando eu selecionar uma palavra, quero que apareça uma info embaixo: tag, nicho,
// visualização; eu que vou preencher, depois a gente vai começar a usar isso". Ao selecionar um trecho
// (uma headline), aparece embaixo um cartão para caracterizar; fica em headlines_caracterizadas, por texto
// (a mesma headline em outro documento já aparece preenchida).
const db = supabase as unknown as SupabaseClient;

interface Dados { tag: string; nicho: string; visualizacoes: string }
const VAZIO: Dados = { tag: "", nicho: "", visualizacoes: "" };

/** Tira a numeração do começo ("1:", "Headline 2:", "ROTEIRO 03 -") para a mesma headline valer em qualquer lugar. */
function textoDaHeadline(trecho: string) {
  return trecho.replace(/\s+/g, " ").replace(/^\s*(?:(?:headline|roteiro)s?\s*)?#?\s*\d{1,3}\s*[:.)\-–]\s*/i, "").trim();
}

const numero = (v: string) => {
  const n = Number(v.replace(/\D/g, ""));
  return v.trim() && Number.isFinite(n) ? n : null;
};
const formatar = (v: string) => { const n = numero(v); return n == null ? "" : n.toLocaleString("pt-BR"); };

export function CaracterizarSelecao({ editor, documentoId, clienteId }: { editor: Editor; documentoId: string | null; clienteId: string | null }) {
  const [alvo, setAlvo] = useState<{ texto: string; left: number; top: number } | null>(null);
  const [dados, setDados] = useState<Dados>(VAZIO);
  const [salvo, setSalvo] = useState<Dados>(VAZIO);
  const [tags, setTags] = useState<string[]>([]);
  const [nichos, setNichos] = useState<string[]>([]);
  const cartao = useRef<HTMLDivElement>(null);
  const focado = useRef(false);

  // Onde está a seleção (o cartão fica logo embaixo). Só trecho dentro de um parágrafo, de 3 a 300 letras.
  useEffect(() => {
    const olhar = () => {
      if (focado.current) return;
      const { from, to, empty, $from, $to } = editor.state.selection;
      const texto = empty || $from.parent !== $to.parent ? "" : textoDaHeadline(editor.state.doc.textBetween(from, to, " "));
      if (texto.length < 3 || texto.length > 300) { setAlvo(null); return; }
      const ini = editor.view.coordsAtPos(from), fim = editor.view.coordsAtPos(to);
      setAlvo({ texto, left: Math.min(ini.left, window.innerWidth - 340), top: Math.max(ini.bottom, fim.bottom) + 8 });
    };
    editor.on("selectionUpdate", olhar);
    editor.on("blur", olhar);
    const aoRolar = () => { if (!focado.current) olhar(); };
    window.addEventListener("scroll", aoRolar, true);
    window.addEventListener("resize", aoRolar);
    return () => {
      editor.off("selectionUpdate", olhar); editor.off("blur", olhar);
      window.removeEventListener("scroll", aoRolar, true); window.removeEventListener("resize", aoRolar);
    };
  }, [editor]);

  // O que já foi preenchido para esse texto (e as tags/nichos já usados, para sugerir).
  const texto = alvo?.texto ?? null;
  useEffect(() => {
    if (!texto) return;
    let cancelado = false;
    void (async () => {
      const { data } = await db.from("headlines_caracterizadas").select("tag, nicho, visualizacoes").eq("texto", texto).maybeSingle();
      if (cancelado) return;
      const d = data as { tag: string | null; nicho: string | null; visualizacoes: number | null } | null;
      const v = { tag: d?.tag ?? "", nicho: d?.nicho ?? "", visualizacoes: d?.visualizacoes != null ? d.visualizacoes.toLocaleString("pt-BR") : "" };
      setDados(v); setSalvo(v);
    })();
    return () => { cancelado = true; };
  }, [texto]);
  useEffect(() => {
    if (!texto || tags.length || nichos.length) return;
    void (async () => {
      const { data } = await db.from("headlines_caracterizadas").select("tag, nicho").order("updated_at", { ascending: false }).limit(300);
      const lista = (data ?? []) as { tag: string | null; nicho: string | null }[];
      setTags([...new Set(lista.map((l) => l.tag?.trim()).filter(Boolean) as string[])]);
      setNichos([...new Set(lista.map((l) => l.nicho?.trim()).filter(Boolean) as string[])]);
    })();
  }, [texto, tags.length, nichos.length]);

  const mudou = dados.tag.trim() !== salvo.tag.trim() || dados.nicho.trim() !== salvo.nicho.trim() || numero(dados.visualizacoes) !== numero(salvo.visualizacoes);
  const salvar = async () => {
    if (!texto || !mudou) return;
    const { error } = await db.from("headlines_caracterizadas").upsert({
      texto, tag: dados.tag.trim() || null, nicho: dados.nicho.trim() || null, visualizacoes: numero(dados.visualizacoes),
      documento_id: documentoId, cliente_id: clienteId, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,texto" });
    if (error) return;
    setSalvo(dados);
    if (dados.tag.trim() && !tags.includes(dados.tag.trim())) setTags((l) => [dados.tag.trim(), ...l]);
    if (dados.nicho.trim() && !nichos.includes(dados.nicho.trim())) setNichos((l) => [dados.nicho.trim(), ...l]);
  };

  if (!alvo) return null;
  const campo = (chave: keyof Dados, Icone: typeof Tag, rotulo: string, lista?: string[]) => (
    <label className="flex items-center gap-2">
      <Icone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="w-[86px] shrink-0 text-[11px] text-muted-foreground">{rotulo}</span>
      <input
        value={dados[chave]}
        list={lista ? `lista-${chave}` : undefined}
        inputMode={chave === "visualizacoes" ? "numeric" : undefined}
        onChange={(e) => setDados((d) => ({ ...d, [chave]: e.target.value }))}
        onBlur={(e) => {
          if (chave === "visualizacoes") setDados((d) => ({ ...d, visualizacoes: formatar(e.target.value) }));
          void salvar();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Escape") { focado.current = false; setAlvo(null); editor.commands.focus(); }
        }}
        placeholder={chave === "visualizacoes" ? "ex.: 1.200.000" : "preencher"}
        className="min-w-0 flex-1 rounded border bg-transparent px-2 py-1 text-xs outline-none focus:border-primary"
      />
      {lista && <datalist id={`lista-${chave}`}>{lista.map((x) => <option key={x} value={x} />)}</datalist>}
    </label>
  );

  return createPortal(
    <div
      ref={cartao}
      className="fixed z-40 w-[320px] space-y-1.5 rounded-xl border bg-popover p-2.5 text-popover-foreground shadow-xl"
      style={{ left: alvo.left, top: alvo.top }}
      onMouseDown={(e) => e.stopPropagation()}
      onFocus={() => { focado.current = true; }}
      onBlur={(e) => { if (!cartao.current?.contains(e.relatedTarget as Node)) focado.current = false; }}
    >
      <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
        <span className="truncate">“{alvo.texto}”</span>
        {(mudou || salvo.tag || salvo.nicho || salvo.visualizacoes) && (
          <span className={cn("ml-auto flex shrink-0 items-center gap-0.5", mudou ? "text-amber-500" : "text-emerald-500")}>
            {mudou ? "não salvo" : <><Check className="h-3 w-3" />salvo</>}
          </span>
        )}
      </p>
      {campo("tag", Tag, "Tag", tags)}
      {campo("nicho", Hash, "Nicho", nichos)}
      {campo("visualizacoes", Eye, "Visualizações")}
    </div>,
    document.body,
  );
}
