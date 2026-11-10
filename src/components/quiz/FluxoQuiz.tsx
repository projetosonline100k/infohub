import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background, Controls, Handle, MarkerType, Position, applyNodeChanges, type ReactFlowInstance,
  type Edge, type Node, type NodeChange, type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { Clock, Contact, Home, ListChecks, Scissors, Tag, Trash2, Trophy, Plus, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EstruturaQuiz, Lamina } from "@/lib/quiz/quiz";
import type { FaltaQuiz } from "@/lib/quiz/faltas";
import { faltasDaLamina } from "./EditorQuiz";

// Fluxo do quiz (03/11, Davi: "um Figma/Framer para quizzes"): o quiz inteiro como blocos ligados por setas. Em
// três segundos responde onde a tela está, para onde leva e, com o celular ao lado, como ela aparece. A ordem real
// continua a do quiz; mover um bloco só muda o desenho, guardado neste Mac.

type Dados = { variante?: { pid: string; idx: number; nome: string }; variavel?: string; usa?: string; apagar?: () => void; lamina?: Lamina; numero?: number; rotulo: string; subtitulo: string; pend: number; selecionado: boolean; cor: string; Icone: LucideIcon };

const CORES: Record<string, { borda: string; icone: string; ponto: string }> = {
  cinza: { borda: "border-cyan-400/60", icone: "border-cyan-300 text-cyan-200", ponto: "#22d3ee" },
  ciano: { borda: "border-violet-400/60", icone: "border-violet-300 text-violet-200", ponto: "#a78bfa" },
  roxo: { borda: "border-pink-400/60", icone: "border-pink-300 text-pink-200", ponto: "#f472b6" },
  laranja: { borda: "border-orange-400/60", icone: "border-orange-300 text-orange-200", ponto: "#fb923c" },
  amarelo: { borda: "border-amber-400/60", icone: "border-amber-300 text-amber-200", ponto: "#fbbf24" },
};

function Bloco({ data }: NodeProps<Dados>) {
  const c = CORES[data.cor];
  const { Icone } = data;
  const ponta = "!h-3.5 !w-3.5 !border-2 !border-[#0b1220]";
  return (
    <div className={cn("relative flex w-[250px] cursor-pointer items-center gap-3 rounded-[28px] border bg-[#0b1220] py-2.5 pl-2.5 pr-4 text-white transition-shadow", c.borda,
      data.selecionado && "!border-cyan-300 shadow-[0_0_0_2px_rgba(103,232,249,0.45),0_0_26px_rgba(34,211,238,0.4)]")}>
      <Handle type="target" position={Position.Top} className={ponta} style={{ background: c.ponto }} />
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 bg-white/5", c.icone)}><Icone className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-tight">{data.subtitulo}</span>
        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-white/55">{data.rotulo}</span>
        {data.variavel && <span title="Esta resposta muda o que aparece depois" className="mt-1 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-200">◆ variável: {data.variavel}</span>}
        {data.usa && <span title="As imagens desta pergunta mudam conforme a resposta" className="mt-1 inline-flex items-center gap-1 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-200">◆ foto muda com {data.usa}</span>}
      </span>
      {data.apagar && data.selecionado && (
        <button type="button" title="Apagar esta lâmina (Delete)" onClick={(e) => { e.stopPropagation(); data.apagar!(); }}
          className="nodrag absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-rose-400/60 bg-[#0b1220] text-rose-300 shadow-lg hover:bg-rose-500 hover:text-white"><Trash2 className="h-3.5 w-3.5" /></button>
      )}
      <span title={data.pend ? `${data.pend} ${data.pend === 1 ? "pendência" : "pendências"}` : "Pronta"}
        className={cn("h-2.5 w-2.5 shrink-0 self-start rounded-full", data.pend ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]")} />
      <Handle type="source" position={Position.Bottom} className={ponta} style={{ background: c.ponto }} />
    </div>
  );
}
const tiposDeBloco = { bloco: Bloco };

const VISUAL: Record<Lamina["tipo"], { cor: string; Icone: LucideIcon; nome: string }> = {
  intro: { cor: "cinza", Icone: Home, nome: "Abertura" }, pergunta: { cor: "ciano", Icone: ListChecks, nome: "Pergunta" },
  tela: { cor: "amarelo", Icone: Clock, nome: "Respiro" }, captura: { cor: "cinza", Icone: Contact, nome: "Contato" }, fim: { cor: "roxo", Icone: Trophy, nome: "Perfil" },
};
// Fluxo de cima para baixo (09/11, Davi: "um mapa mental no sentido para baixo"): uma tela embaixo da outra; os perfis
// abrem em leque no fim e a oferta vem depois deles.
const PASSO_Y = 120, LARGURA_PERFIL = 260;

export function FluxoQuiz({ quizId, estrutura, laminas, faltas, selecionada, varianteSel, onEscolher, onAdicionar, onExcluir, onReordenar }: {
  quizId: string; estrutura: EstruturaQuiz; laminas: Lamina[]; faltas: FaltaQuiz[]; selecionada: string;
  /** Caminho escolhido (ex.: gênero Mulher) quando a tela tem variações por resposta. */
  varianteSel?: { pid: string; idx: number } | null;
  onEscolher: (chave: string, variante?: { pid: string; idx: number; nome: string }) => void; onAdicionar: () => void; onExcluir?: (l: Lamina) => void;
  /** Davi, 10/11: clicar na linha corta ela; o próximo bloco clicado passa a vir logo depois do bloco de cima da linha. */
  onReordenar?: (origem: Lamina, depoisDe: Lamina) => void;
}) {
  // Linha cortada: guarda o bloco de cima dela (o novo bloco entra logo depois dele). Esc ou clique no fundo cancela.
  // Várias linhas podem ficar cortadas ao mesmo tempo (Davi, 10/11); elas só voltam ao cancelar ou quando um bloco é ligado.
  const [cortes, setCortes] = useState<Lamina[]>([]);
  useEffect(() => {
    if (!cortes.length) return;
    const esc = (ev: KeyboardEvent) => { if (ev.key === "Escape") setCortes([]); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [cortes.length]);
  const chaveMapa = `quiz:fluxo-v:${quizId}`;
  const [movidos, setMovidos] = useState<Record<string, { x: number; y: number }>>(() => {
    try { return JSON.parse(localStorage.getItem(chaveMapa) || "{}"); } catch { return {}; }
  });
  // Só se apaga o que dá para tirar sem quebrar o quiz: pergunta (sobrando pelo menos uma), tela de respiro e o pedido de contato.
  const podeApagar = useCallback((l: Lamina) => l.tipo === "tela" || l.tipo === "captura" || (l.tipo === "pergunta" && estrutura.perguntas.length > 1), [estrutura.perguntas.length]);
  // Variáveis (Davi, 10/11): "já que as fotos mudam conforme o gênero, a variável tem que aparecer no mapa". Se as opções de
  // uma pergunta têm `imagens` ligadas a outra pergunta, a de origem mostra "variável" e a que depende mostra "foto muda com …".
  const variaveis = useMemo(() => {
    const origem = new Map<string, string>(), usa = new Map<string, string>();
    estrutura.perguntas.forEach((q, i) => {
      q.opcoes.forEach((o) => Object.keys(o.imagens ?? {}).forEach((k) => {
        const pid = k.split("=")[0], j = estrutura.perguntas.findIndex((x) => x.id === pid);
        if (j < 0) return;
        const nome = pid === "genero" ? "gênero" : `P${j + 1}`;
        origem.set(pid, nome); usa.set(q.id, `${nome} (P${j + 1})`);
      }));
      void i;
    });
    return { origem, usa };
  }, [estrutura.perguntas]);
  // Caminhos (Davi, 10/11: "deveriam ser dois caminhos diferentes"): se as imagens de uma pergunta dependem da resposta de outra,
  // o mapa a desenha como uma tela por resposta (Homem / Mulher / Outro), ligadas à pergunta de origem.
  const variantes = useMemo(() => {
    const m = new Map<string, { pid: string; nomes: string[] }>();
    laminas.forEach((l) => {
      if (l.tipo !== "pergunta") return;
      const q = estrutura.perguntas[l.indice!];
      const chave = q?.opcoes.flatMap((o) => Object.keys(o.imagens ?? {}))[0];
      const origem = chave ? estrutura.perguntas.find((x) => x.id === chave.split("=")[0]) : undefined;
      if (origem && origem.opcoes.length > 1) m.set(l.chave, { pid: origem.id, nomes: origem.opcoes.map((o) => o.texto) });
    });
    return m;
  }, [laminas, estrutura.perguntas]);
  const montar = useCallback((): Node<Dados>[] => {
    const antes = laminas.filter((l) => l.tipo !== "fim");
    const fins = laminas.filter((l) => l.tipo === "fim");
    let pergunta = 0;
    const lista: Node<Dados>[] = antes.flatMap((l, i): Node<Dados>[] => {
      const v = VISUAL[l.tipo];
      if (l.tipo === "pergunta") pergunta++;
      const base: Dados = {
        lamina: l, numero: laminas.indexOf(l) + 1, rotulo: l.rotulo.replace(/^P\d+\.\s*/, ""), subtitulo: l.tipo === "pergunta" ? `Pergunta ${pergunta}` : v.nome,
        pend: faltasDaLamina(l, estrutura, faltas).length, selecionado: l.chave === selecionada, cor: v.cor, Icone: v.Icone,
        variavel: l.tipo === "pergunta" ? variaveis.origem.get(estrutura.perguntas[l.indice!]?.id) : undefined,
        usa: l.tipo === "pergunta" ? variaveis.usa.get(estrutura.perguntas[l.indice!]?.id) : undefined,
        apagar: onExcluir && podeApagar(l) ? () => onExcluir(l) : undefined,
      };
      const vi = variantes.get(l.chave), nomes = vi?.nomes;
      if (!nomes) return [{ id: l.chave, type: "bloco", position: movidos[l.chave] ?? { x: i % 2 ? 70 : 0, y: i * PASSO_Y }, data: base }];
      return nomes.map((nome, k) => {
        const id = `${l.chave}~${k}`;
        return { id, type: "bloco", position: movidos[id] ?? { x: (k - (nomes.length - 1) / 2) * 270 + (i % 2 ? 70 : 0), y: i * PASSO_Y },
          data: { ...base, subtitulo: `${base.subtitulo} · ${nome}`, usa: `foto de ${nome}`, apagar: k === 0 ? base.apagar : undefined,
            variante: { pid: vi!.pid, idx: k, nome }, selecionado: l.chave === selecionada && (varianteSel ? varianteSel.idx === k : k === 0) } };
      });
    });
    const yFim = antes.length * PASSO_Y;
    fins.forEach((l, i) => {
      const x = (i - (fins.length - 1) / 2) * LARGURA_PERFIL;
      const fimUnico = fins.length === 1;
      lista.push({
        id: l.chave, type: "bloco", position: movidos[l.chave] ?? { x, y: yFim },
        data: { lamina: l, numero: laminas.indexOf(l) + 1, rotulo: l.rotulo.replace(/^Resultado:\s*/, ""), subtitulo: estrutura.sem_resultado ? "Oferta" : fimUnico ? "Resultado" : `Perfil ${i + 1}`,
          pend: faltasDaLamina(l, estrutura, faltas).length, selecionado: l.chave === selecionada, cor: "roxo", Icone: Trophy },
      });
    });
    if (estrutura.oferta && fins[0] && !estrutura.sem_resultado) {
      lista.push({
        id: "oferta", type: "bloco", position: movidos.oferta ?? { x: 0, y: yFim + PASSO_Y + 20 }, selectable: true,
        data: { lamina: fins[0], rotulo: estrutura.oferta.titulo || estrutura.oferta.produto || "Oferta", subtitulo: "Oferta",
          pend: faltas.filter((f) => f.caminho.startsWith("oferta")).length, selecionado: false, cor: "laranja", Icone: Tag },
      });
    }
    return lista;
  }, [laminas, estrutura, faltas, selecionada, movidos, onExcluir, podeApagar, variaveis, variantes, varianteSel]);

  const [nodes, setNodes] = useState<Node<Dados>[]>(montar);
  // Atualiza por cima dos blocos que já existem: recriá-los perderia o tamanho medido, e as setas sumiriam.
  useEffect(() => setNodes((atuais) => montar().map((n) => {
    const v = atuais.find((x) => x.id === n.id);
    return v ? { ...v, data: n.data, position: movidos[n.id] ? v.position : n.position } : n;
  })), [montar, movidos]);
  // Em vez de encolher o quiz inteiro (31 telas viram risco), a vista acompanha a tela escolhida.
  const instancia = useRef<ReactFlowInstance | null>(null);
  const irPara = useCallback((chave: string, animar: boolean) => {
    const n = instancia.current?.getNode(chave) ?? instancia.current?.getNode(`${chave}~1`) ?? instancia.current?.getNode(`${chave}~0`);
    if (!n) return;
    instancia.current?.setCenter(n.position.x + 125, n.position.y + 60, { zoom: 0.9, duration: animar ? 300 : 0 });
  }, []);
  useEffect(() => { irPara(selecionada, true); }, [selecionada, irPara]);
  // Pinça no trackpad: o WebKit (app do Mac) manda eventos "gesture*" em vez de roda+ctrl, que o React Flow não
  // entende; aqui a pinça vira zoom no mapa (e não da página inteira).
  const caixa = useRef<HTMLDivElement>(null);
  // Delete/Backspace apaga a lâmina escolhida quando o mouse está sobre o fluxo (e não se está digitando).
  const sobre = useRef(false);
  const apagarRef = useRef<() => void>(() => undefined);
  apagarRef.current = () => { const l = laminas.find((x) => x.chave === selecionada); if (l && onExcluir && podeApagar(l)) onExcluir(l); };
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (!sobre.current || (ev.key !== "Delete" && ev.key !== "Backspace")) return;
      const alvo = ev.target instanceof HTMLElement ? ev.target : null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      ev.preventDefault();
      apagarRef.current();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    let base = 1;
    type Gesto = Event & { scale: number; clientX?: number; clientY?: number };
    const inicio = (e: Event) => { e.preventDefault(); base = instancia.current?.getZoom() ?? 1; };
    const muda = (e: Event) => {
      e.preventDefault();
      const g = e as Gesto;
      instancia.current?.zoomTo(Math.min(1.6, Math.max(0.2, base * g.scale)));
    };
    el.addEventListener("gesturestart", inicio);
    el.addEventListener("gesturechange", muda);
    return () => { el.removeEventListener("gesturestart", inicio); el.removeEventListener("gesturechange", muda); };
  }, []);
  const onNodesChange = useCallback((ch: NodeChange[]) => setNodes((n) => applyNodeChanges(ch, n)), []);

  const edges = useMemo<Edge[]>(() => {
    const antes = laminas.filter((l) => l.tipo !== "fim");
    const fins = laminas.filter((l) => l.tipo === "fim");
    const seta = { type: MarkerType.ArrowClosed, color: "#7dd3fc" };   // só nos perfis/oferta
    // Linha cortada some do mapa (só volta se o corte for cancelado ou depois que um bloco for encaixado).
    const ids = (l: Lamina) => (variantes.get(l.chave)?.nomes.map((_, k) => `${l.chave}~${k}`) ?? [l.chave]);
    const lista: Edge[] = antes.slice(1).flatMap((l, i): Edge[] => {
      const origem = antes[i], de = ids(origem), para = ids(l);
      if (de.length === 1 && para.length === 1) {
        if (cortes.some((c) => c.chave === origem.chave)) return [];
        return [{ id: `e${i}`, source: origem.chave, target: l.chave, interactionWidth: 30, className: onReordenar ? "cursor-pointer" : undefined,
          style: { stroke: i % 2 ? "#a78bfa" : "#22d3ee", strokeWidth: 2 } }];
      }
      // caminhos por resposta: abre em leque (um por resposta) e volta a se juntar na tela seguinte
      const nomes = variantes.get(l.chave)?.nomes;
      const pares: [string, string, string | undefined][] = de.length > 1 && para.length > 1 ? de.map((s, k) => [s, para[k], undefined]) : de.length > 1 ? de.map((s) => [s, para[0], undefined]) : para.map((t, k) => [de[0], t, nomes?.[k]]);
      return pares.map(([source, target, nome], k) => ({
        id: `v${i}-${k}`, source, target, type: "smoothstep", label: nome, labelStyle: { fill: "#f5d0fe", fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: "#0d131c" },
        style: { stroke: "#e879f9", strokeWidth: 2 },
      }));
    });
    const ultimo = antes[antes.length - 1];
    const porPerfil = (id?: string) => estrutura.perguntas.reduce((s, q) => s + q.opcoes.filter((o) => o.perfil === id).length, 0);
    fins.forEach((l) => {
      const n = l.perfil ? porPerfil(l.perfil) : 0;
      if (ultimo) lista.push({
        id: `p${l.chave}`, source: ultimo.chave, target: l.chave, type: "smoothstep", label: n ? `${n} respostas` : undefined,
        labelStyle: { fill: "#ddd6fe", fontSize: 10 }, labelBgStyle: { fill: "#0d131c" }, markerEnd: { ...seta, color: "#a78bfa" }, style: { stroke: "#a78bfa", strokeWidth: 2 },
      });
      if (estrutura.oferta && !estrutura.sem_resultado) lista.push({ id: `o${l.chave}`, source: l.chave, target: "oferta", type: "smoothstep", markerEnd: { ...seta, color: "#fb923c" }, style: { stroke: "#fb923c", strokeWidth: 2 } });
    });
    return lista;
  }, [laminas, estrutura, cortes, onReordenar, variantes]);

  return (
    <div ref={caixa} onMouseEnter={() => { sobre.current = true; }} onMouseLeave={() => { sobre.current = false; }} className="dark relative h-full min-h-0 w-full overflow-hidden rounded-xl bg-[radial-gradient(circle_at_50%_0%,#101c33,#080d17_70%)]">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={tiposDeBloco} onNodesChange={onNodesChange} onInit={(i) => { instancia.current = i; setTimeout(() => irPara(selecionada, false), 50); }} minZoom={0.2} maxZoom={1.6}
        panOnScroll zoomOnScroll={false} zoomOnPinch nodesConnectable={!!onReordenar} proOptions={{ hideAttribution: true }}
        onEdgeClick={(_, ed) => {
          if (!onReordenar || !/^e\d+$/.test(ed.id)) return;
          const de = laminas.find((x) => x.chave === ed.source);
          if (!de || de.tipo === "captura") { toast.error("Depois do pedido de contato não dá para encaixar outro bloco"); return; }
          setCortes((c) => (c.some((x) => x.chave === de.chave) ? c : [...c, de]));
        }}
        onPaneClick={() => setCortes([])}
        onConnect={(c) => {
          // Arrastar do ponto de baixo de um bloco até o ponto de cima de outro: o de destino passa a vir logo depois do de origem.
          const de = laminas.find((x) => x.chave === c.source), para = laminas.find((x) => x.chave === c.target);
          if (!onReordenar || !de || !para) return;
          if (de.tipo === "captura" || de.tipo === "fim" || (para.tipo !== "pergunta" && para.tipo !== "tela")) { toast.error("Só dá para ligar perguntas e telas de respiro depois de outro bloco"); return; }
          if (de.chave === para.chave) return;
          onReordenar(para, de); setCortes([]);
        }}
        onNodeClick={(_, n) => {
          const l = (n.data as Dados).lamina;
          if (!l) return;
          if (cortes.length && onReordenar && n.id !== "oferta") {
            if (cortes.length > 1) { toast("Com várias linhas cortadas, arraste do ponto de baixo de um bloco até o ponto de cima do bloco que deve vir depois"); return; }
            const corte = cortes[0];
            if (l.tipo !== "pergunta" && l.tipo !== "tela") { toast.error("Só dá para mover perguntas e telas de respiro"); return; }
            if (l.chave === corte.chave) { toast.error("Esse bloco já é o de cima da linha"); return; }
            onReordenar(l, corte); setCortes([]); return;
          }
          onEscolher(l.chave, (n.data as Dados).variante);
        }}
        onNodeDragStop={(_, n) => {
          const novo = { ...movidos, [n.id]: n.position };
          setMovidos(novo);
          try { localStorage.setItem(chaveMapa, JSON.stringify(novo)); } catch { /* sem armazenamento */ }
        }}>
        <Background color="#ffffff10" gap={26} />
        <Controls showInteractive={false} />
      </ReactFlow>
      {cortes.length > 0 && (
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-rose-400/50 bg-[#0d131c] px-4 py-2 text-xs text-rose-100 shadow-lg">
          <Scissors className="h-3.5 w-3.5 text-rose-300" />
          {cortes.length === 1
            ? `Linha cortada depois de “${cortes[0].rotulo.replace(/^P\d+\.\s*/, "").slice(0, 26)}”. Clique no bloco que entra ali, ou corte outras linhas.`
            : `${cortes.length} linhas cortadas. Arraste do ponto de baixo de um bloco até o ponto de cima de outro para ligar.`}
          <button type="button" onClick={() => setCortes([])} title="Cancelar tudo (Esc)" className="ml-1 rounded-full p-0.5 hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      <button type="button" onClick={onAdicionar} className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0d131c] px-4 py-2 text-xs font-medium text-white hover:bg-white/10">
        <Plus className="h-3.5 w-3.5" />Adicionar nó
      </button>
    </div>
  );
}
