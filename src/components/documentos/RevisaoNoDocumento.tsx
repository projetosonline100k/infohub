import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Eye, EyeOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { diferencaPalavras, mudou } from "@/lib/conteudo/trechos";
import type { Revisao } from "@/lib/conteudo/escritaAgentes";

// Revisão do Elias dentro do documento (19/10/2026, Davi: "igual ao olhinho: eu ativo, aí mostra
// onde ele retirou, o que removeu e por quê; e na lateral direita os comentários do Elias, igual na
// primeira versão" — a do MapaPeca). O texto final fica limpo no documento; com o olho ligado,
// o que saiu aparece riscado em vermelho, o que entrou em verde, e cada comentário fica à direita,
// ligado por uma linha ao trecho. As linhas são achadas pelo texto, então vale também depois de
// reabrir o documento (as revisões ficam guardadas neste Mac).

const CHAVE = new PluginKey<DecorationSet>("revisaoElias");
const LARGURA_NOTAS = 240;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

interface Bloco { pos: number; tamanho: number; texto: string }

function blocosDe(doc: PMNode): Bloco[] {
  const out: Bloco[] = [];
  doc.descendants((n, pos) => {
    if (n.isTextblock) { out.push({ pos, tamanho: n.nodeSize, texto: n.textContent }); return false; }
    return true;
  });
  return out;
}

/** Bloco do documento de cada linha da revisão (null = a linha não está mais lá). */
function localizar(rev: Revisao, blocos: Bloco[]): (Bloco | null)[] {
  let inicio = -1;
  for (let k = 0; k < Math.min(3, rev.linhas.length) && inicio < 0; k++) {
    const i = blocos.findIndex((b) => norm(b.texto) === norm(rev.linhas[k].texto));
    if (i >= 0) inicio = Math.max(0, i - k);
  }
  if (inicio < 0) return rev.linhas.map(() => null);
  let j = inicio;
  return rev.linhas.map((l) => {
    for (let t = j; t < Math.min(blocos.length, j + 4); t++) {
      if (norm(blocos[t].texto) === norm(l.texto)) { j = t + 1; return blocos[t]; }
    }
    return null;
  });
}

const widget = (classe: string, texto: string) => () => {
  const s = document.createElement("span");
  s.className = classe;
  s.textContent = texto;
  return s;
};

function decoracoes(doc: PMNode, revisoes: Revisao[]): DecorationSet {
  const blocos = blocosDe(doc);
  const marcas: Decoration[] = [];
  for (const rev of revisoes) {
    const achados = localizar(rev, blocos);
    rev.linhas.forEach((l, k) => {
      const b = achados[k];
      if (!b) return;
      const ini = b.pos + 1;
      if (l.original === null) { if (b.texto) marcas.push(Decoration.inline(ini, ini + b.texto.length, { class: "rev-entrou" })); return; }
      if (!mudou(l.original, l.texto) || b.texto !== l.texto) return;
      let off = 0;
      for (const d of diferencaPalavras(l.original, l.texto)) {
        if (d.tipo === "saiu") { marcas.push(Decoration.widget(ini + off, widget("rev-saiu", d.texto), { side: -1, key: `${rev.id}-${k}-${off}-${d.texto}` })); continue; }
        if (d.tipo === "entrou" && d.texto.trim()) marcas.push(Decoration.inline(ini + off, ini + off + d.texto.length, { class: "rev-entrou" }));
        off += d.texto.length;
      }
    });
    for (const r of rev.removidas) {
      const antes = r.depoisDe >= 0 ? achados[r.depoisDe] : null;
      const primeiro = achados.find(Boolean);
      const pos = antes ? antes.pos + antes.tamanho - 1 : primeiro ? primeiro.pos + 1 : null;
      if (pos !== null) marcas.push(Decoration.widget(pos, widget("rev-linha-saiu", r.texto), { side: antes ? 1 : -1, key: `${rev.id}-x-${r.texto}` }));
    }
  }
  return DecorationSet.create(doc, marcas);
}

interface Alvo { chave: string; quem: string; nota: string; y: number; meio: number; xFim: number }

export function RevisaoNoDocumento({ editor, revisoes, onDispensar }: {
  editor: Editor; revisoes: Revisao[]; onDispensar: (id: string) => void;
}) {
  const [visivel, setVisivel] = useState(() => { try { return localStorage.getItem("docchat:olho") !== "nao"; } catch { return true; } });
  const estado = useRef({ revisoes, visivel });
  estado.current = { revisoes, visivel };
  const [alvos, setAlvos] = useState<Alvo[]>([]);
  const [topos, setTopos] = useState<number[]>([]);
  const [botao, setBotao] = useState<{ y: number; id: string; quem: string } | null>(null);
  const cartoes = useRef<(HTMLDivElement | null)[]>([]);
  const caixa = editor.view.dom.parentElement as HTMLElement | null;

  // Decorações do ProseMirror (riscado/verde), refeitas a cada mudança do documento.
  useEffect(() => {
    const plugin = new Plugin({
      key: CHAVE,
      props: {
        decorations: (st) => (estado.current.visivel && estado.current.revisoes.length ? decoracoes(st.doc, estado.current.revisoes) : null),
      },
    });
    editor.registerPlugin(plugin);
    return () => { if (!editor.isDestroyed) editor.unregisterPlugin(CHAVE); };
  }, [editor]);

  const alternar = () => setVisivel((v) => { try { localStorage.setItem("docchat:olho", v ? "nao" : "sim"); } catch { /* sem storage */ } return !v; });

  // Onde fica cada comentário: na altura do trecho, na coluna da direita.
  const recalcular = useCallback(() => {
    if (!caixa || editor.isDestroyed) return;
    const base = caixa.getBoundingClientRect();
    const blocos = blocosDe(editor.state.doc);
    const lista: Alvo[] = [];
    let primeiro: { y: number; id: string; quem: string } | null = null;
    for (const rev of revisoes) {
      const achados = localizar(rev, blocos);
      rev.linhas.forEach((l, k) => {
        const b = achados[k];
        if (!b) return;
        const dom = editor.view.nodeDOM(b.pos) as HTMLElement | null;
        const r = dom?.getBoundingClientRect?.();
        if (!r) return;
        if (rev === revisoes[revisoes.length - 1] && !primeiro) primeiro = { y: r.top - base.top, id: rev.id, quem: rev.quem };
        if (l.nota) lista.push({ chave: `${rev.id}-${k}`, quem: rev.quem, nota: l.nota, y: r.top - base.top, meio: r.top - base.top + Math.min(r.height, 28) / 2, xFim: r.right - base.left });
      });
    }
    setAlvos(lista);
    setBotao(primeiro);
  }, [caixa, editor, revisoes]);

  // Atualiza as decorações e a coluna quando muda a revisão ou o olho.
  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(CHAVE, true).setMeta("addToHistory", false));
    if (caixa) {
      caixa.style.position = "relative";
      caixa.style.paddingRight = visivel && revisoes.some((r) => r.linhas.some((l) => l.nota)) ? `${LARGURA_NOTAS + 24}px` : "";
    }
    requestAnimationFrame(recalcular);
  }, [editor, caixa, visivel, revisoes, recalcular]);
  useEffect(() => () => { if (caixa) caixa.style.paddingRight = ""; }, [caixa]);

  useEffect(() => {
    const aoMudar = () => requestAnimationFrame(recalcular);
    editor.on("update", aoMudar);
    window.addEventListener("resize", aoMudar);
    const ro = caixa ? new ResizeObserver(aoMudar) : null;
    if (caixa && ro) ro.observe(caixa);
    return () => { editor.off("update", aoMudar); window.removeEventListener("resize", aoMudar); ro?.disconnect(); };
  }, [editor, caixa, recalcular]);

  // Empilha os comentários sem sobrepor (mede a altura de cada um depois de desenhar).
  useLayoutEffect(() => {
    let fim = botao ? botao.y + 36 : 0;
    setTopos(alvos.map((a, i) => {
      const y = Math.max(a.y, fim);
      fim = y + (cartoes.current[i]?.offsetHeight ?? 60) + 8;
      return y;
    }));
  }, [alvos, botao]);

  if (!caixa || !revisoes.length || !botao) return null;
  const mostrarNotas = visivel && alvos.length > 0;
  const xColuna = caixa.clientWidth - LARGURA_NOTAS;

  return createPortal(
    <>
      <div className="absolute z-10 flex items-center gap-1" contentEditable={false}
        style={mostrarNotas ? { top: botao.y, left: xColuna } : { top: botao.y, right: -52 }}>
        <button type="button" onClick={alternar}
          title={visivel ? "Esconder o que o Elias mudou (texto limpo)" : `Mostrar o que ${botao.quem} tirou, trocou e por quê`}
          className={cn("flex h-8 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs shadow-sm",
            visivel ? "text-foreground" : "text-muted-foreground")}>
          {visivel ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          {mostrarNotas && <span>Revisão de {botao.quem}</span>}
        </button>
        {mostrarNotas && (
          <button type="button" onClick={() => onDispensar(botao.id)} title="Dispensar as marcas desta revisão"
            className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {mostrarNotas && (
        <>
          <svg className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible" aria-hidden>
            {alvos.map((a, i) => {
              const y2 = (topos[i] ?? a.y) + 14;
              const x1 = Math.min(a.xFim, xColuna - 40) + 6, x2 = xColuna - 2;
              return <path key={a.chave} d={`M ${x1} ${a.meio} C ${x1 + 30} ${a.meio}, ${x2 - 30} ${y2}, ${x2} ${y2}`}
                fill="none" className="stroke-sky-500/50" strokeWidth={1.5} />;
            })}
          </svg>
          {alvos.map((a, i) => (
            <div key={a.chave} ref={(el) => { cartoes.current[i] = el; }} contentEditable={false}
              className="absolute rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-foreground"
              style={{ top: topos[i] ?? a.y, left: xColuna, width: LARGURA_NOTAS }}>
              <div className="mb-0.5 font-semibold text-sky-600 dark:text-sky-400">{a.quem}</div>
              <div className="whitespace-pre-wrap">{a.nota}</div>
            </div>
          ))}
        </>
      )}
    </>,
    caixa,
  );
}
