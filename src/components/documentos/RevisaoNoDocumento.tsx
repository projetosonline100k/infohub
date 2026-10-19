import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { diferencaPalavras, mudou } from "@/lib/conteudo/trechos";
import { linhasDoTexto, textoParaHtml, type Revisao } from "@/lib/conteudo/escritaAgentes";

// 19/10, depois (Davi): "gerar as duas versões e eu ativo ou desativo (On/Off) em cima do texto
// gerado: On = a revisão do Elias com as partes em vermelho e os comentários; Off = só o roteiro do
// Junior". O On/Off troca o texto no documento (um passo do ⌘Z) e liga as marcas.
// Revisão do Elias dentro do documento (19/10/2026, Davi: "igual ao olhinho: eu ativo, aí mostra
// onde ele retirou, o que removeu e por quê; e na lateral direita os comentários do Elias, igual na
// primeira versão" — a do MapaPeca). O texto final fica limpo no documento; com o olho ligado,
// o que saiu aparece riscado em vermelho, o que entrou em verde, e cada comentário fica à direita,
// ligado por uma linha ao trecho. As linhas são achadas pelo texto, então vale também depois de
// reabrir o documento (as revisões ficam guardadas neste Mac).

const CHAVE = new PluginKey<DecorationSet>("revisaoElias");
const LARGURA_NOTAS = 240;
const MOSTRAR_MARCAS = false;   // riscado (saiu) e verde (entrou) dentro do texto
const MIN_NOTAS = 170;
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

interface Bloco { pos: number; tamanho: number; texto: string }

/** Ativa = o texto do revisor está no documento (revisões antigas, sem a versão de antes, contam como ativas). */
export const revisaoAtiva = (r: Revisao) => r.ativa !== false;

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

const palavrasDe = (t: string) => norm(t).toLowerCase().split(" ").filter(Boolean);

/** Onde está no documento o texto destas linhas, pelas palavras (não pelo formato: título ou texto,
 *  linhas quebradas ou juntadas dão no mesmo). `exato` = todas as palavras iguais; senão basta o
 *  começo e o fim baterem (o meio pode ter sido mexido). null = não achou. */
export function acharTrecho(doc: PMNode, linhas: string[], exato: boolean): { from: number; to: number } | null {
  const alvo = palavrasDe(linhas.join(" "));
  if (!alvo.length) return null;
  const blocos = blocosDe(doc).filter((b) => norm(b.texto));
  const W: string[] = [], dono: number[] = [], inicioBloco = new Set<number>(), fimBloco = new Set<number>();
  blocos.forEach((b, k) => {
    const ps = palavrasDe(b.texto);
    inicioBloco.add(W.length);
    ps.forEach((p) => { W.push(p); dono.push(k); });
    fimBloco.add(W.length - 1);
  });
  const n = Math.min(6, alvo.length);
  const bate = (de: number, pedaco: string[]) => pedaco.every((p, k) => W[de + k] === p);
  const faixa = (p: number, q: number) => {
    const b0 = blocos[dono[p]], b1 = blocos[dono[q]];
    const a = doc.resolve(b0.pos + 1), b = doc.resolve(b1.pos + 1);
    return { from: a.depth ? a.before(1) : b0.pos, to: b.depth ? b.after(1) : b1.pos + b1.tamanho };
  };
  for (const p of inicioBloco) {
    if (!bate(p, alvo.slice(0, n))) continue;
    if (bate(p, alvo) && fimBloco.has(p + alvo.length - 1)) return faixa(p, p + alvo.length - 1);
    if (exato) continue;
    // Começo e fim batendo, com tamanho parecido (o meio pode ter sido editado).
    for (let q = p + Math.floor(alvo.length * 0.5); q < Math.min(W.length, p + alvo.length * 2); q++) {
      if (fimBloco.has(q) && bate(q - n + 1, alvo.slice(-n))) return faixa(p, q);
    }
  }
  return null;
}

/** Troca no documento o texto destas linhas pelo texto `novo` (um passo do ⌘Z). false = não achou. */
export function trocarLinhas(editor: Editor, linhas: string[], novo: string, exato = false): boolean {
  if (!novo.trim()) return false;
  const onde = acharTrecho(editor.state.doc, linhas, exato);
  return !!onde && editor.chain().insertContentAt(onde, textoParaHtml(novo)).run();
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
interface Chave { id: string; quem: string; y: number; ativa: boolean; podeTrocar: boolean }

export function RevisaoNoDocumento({ editor, revisoes, onAlternar, onDispensar }: {
  editor: Editor; revisoes: Revisao[]; onAlternar: (id: string) => void; onDispensar: (id: string) => void;
}) {
  const ativas = revisoes.filter(revisaoAtiva);
  const estado = useRef(ativas);
  estado.current = ativas;
  const [alvos, setAlvos] = useState<Alvo[]>([]);
  const [topos, setTopos] = useState<number[]>([]);
  const [chaves, setChaves] = useState<Chave[]>([]);
  // Coluna dos comentários: na margem à direita do texto, sem estreitar o texto (19/10, Davi:
  // "quando ativo o Elias muda o layout; não quero que altere, me dificulta a leitura").
  const [coluna, setColuna] = useState({ x: 0, largura: LARGURA_NOTAS });
  const cartoes = useRef<(HTMLDivElement | null)[]>([]);
  const caixa = editor.view.dom.parentElement as HTMLElement | null;

  // Decorações do ProseMirror (riscado/verde) das revisões ligadas, refeitas a cada mudança do documento.
  useEffect(() => {
    const plugin = new Plugin({
      key: CHAVE,
      // 19/10, depois (Davi: "se fica tudo corrigido é difícil ler, preciso rolar; quero o roteiro intacto
      // com as mudanças do Elias e só os comentários na lateral"): sem riscado/verde no texto; o On/Off
      // continua trocando pela versão do Junior. (decoracoes() fica para se ele quiser as marcas de volta.)
      props: { decorations: (st) => (MOSTRAR_MARCAS && estado.current.length ? decoracoes(st.doc, estado.current) : null) },
    });
    editor.registerPlugin(plugin);
    return () => { if (!editor.isDestroyed) editor.unregisterPlugin(CHAVE); };
  }, [editor]);

  // Onde fica cada comentário (na altura do trecho, na coluna da direita) e o On/Off (em cima do texto).
  const recalcular = useCallback(() => {
    if (!caixa || editor.isDestroyed) return;
    const base = caixa.getBoundingClientRect();
    let rolagem = caixa.parentElement;
    while (rolagem && !/(auto|scroll)/.test(getComputedStyle(rolagem).overflowY)) rolagem = rolagem.parentElement;
    const limite = (rolagem ?? document.documentElement).getBoundingClientRect().right - 20;   // até a barra de rolagem
    const x = caixa.clientWidth + 20;
    setColuna({ x, largura: Math.max(MIN_NOTAS, Math.min(LARGURA_NOTAS, limite - base.left - x)) });
    const blocos = blocosDe(editor.state.doc);
    const lista: Alvo[] = [];
    const botoes: Chave[] = [];
    for (const rev of revisoes) {
      const ativa = revisaoAtiva(rev);
      const versao: Revisao = ativa ? rev : { ...rev, linhas: linhasDoTexto(rev.antes ?? "").map((texto) => ({ texto, original: texto, nota: null })) };
      const achados = localizar(versao, blocos);
      let primeiro = true;
      versao.linhas.forEach((l, k) => {
        const b = achados[k];
        if (!b) return;
        const dom = editor.view.nodeDOM(b.pos) as HTMLElement | null;
        const r = dom?.getBoundingClientRect?.();
        if (!r) return;
        if (primeiro) { primeiro = false; botoes.push({ id: rev.id, quem: rev.quem, y: r.top - base.top, ativa, podeTrocar: !!(rev.antes && rev.depois) }); }
        if (ativa && l.nota) lista.push({ chave: `${rev.id}-${k}`, quem: rev.quem, nota: l.nota, y: r.top - base.top, meio: r.top - base.top + Math.min(r.height, 28) / 2, xFim: r.right - base.left });
      });
    }
    setAlvos(lista);
    setChaves(botoes);
  }, [caixa, editor, revisoes]);

  // Atualiza as decorações e a coluna quando muda alguma revisão.
  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(CHAVE, true).setMeta("addToHistory", false));
    if (caixa) caixa.style.position = "relative";
    requestAnimationFrame(recalcular);
  }, [editor, caixa, revisoes, recalcular]);

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
    let fim = 0;
    setTopos(alvos.map((a, i) => {
      const y = Math.max(a.y, fim);
      fim = y + (cartoes.current[i]?.offsetHeight ?? 60) + 8;
      return y;
    }));
  }, [alvos]);

  if (!caixa || !chaves.length) return null;
  const xColuna = coluna.x;

  return createPortal(
    <>
      {chaves.map((c) => (
        <div key={c.id} className="absolute z-10 flex items-center gap-1" contentEditable={false}
          style={{ top: Math.max(0, c.y - 34), right: 0 }}>
          <span className="text-xs text-muted-foreground">Revisão de {c.quem}</span>
          <div className="flex overflow-hidden rounded-full border bg-card text-xs shadow-sm">
            <button type="button" disabled={!c.podeTrocar || c.ativa} onClick={() => onAlternar(c.id)}
              title={`Mostrar a revisão de ${c.quem}: o que tirou (vermelho), o que entrou (verde) e os comentários`}
              className={cn("px-2.5 py-1", c.ativa ? "bg-sky-500 text-white" : "text-muted-foreground hover:bg-muted")}>On</button>
            <button type="button" disabled={!c.podeTrocar || !c.ativa} onClick={() => onAlternar(c.id)}
              title="Voltar para o texto antes da revisão"
              className={cn("px-2.5 py-1", !c.ativa ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted")}>Off</button>
          </div>
          <button type="button" onClick={() => onDispensar(c.id)} title="Ficar com o texto como está e tirar as marcas"
            className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {alvos.length > 0 && (
        <>
          <svg className="pointer-events-none absolute left-0 top-0 h-full w-full overflow-visible" aria-hidden>
            {alvos.map((a, i) => {
              const y2 = (topos[i] ?? a.y) + 14;
              const x1 = Math.min(a.xFim, caixa.clientWidth) + 6, x2 = xColuna - 2;
              return <path key={a.chave} d={`M ${x1} ${a.meio} C ${x1 + 30} ${a.meio}, ${x2 - 30} ${y2}, ${x2} ${y2}`}
                fill="none" className="stroke-sky-500/50" strokeWidth={1.5} />;
            })}
          </svg>
          {alvos.map((a, i) => (
            <div key={a.chave} ref={(el) => { cartoes.current[i] = el; }} contentEditable={false}
              className="absolute rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-foreground"
              style={{ top: topos[i] ?? a.y, left: xColuna, width: coluna.largura }}>
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
