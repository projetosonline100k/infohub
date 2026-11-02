import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background, Controls, Handle, MarkerType, MiniMap, Position, applyNodeChanges,
  type Edge, type Node, type NodeChange, type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { AlertTriangle, CheckCircle2, Clock, Contact, Home, ListChecks, Tag, Trophy, Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstruturaQuiz, Lamina } from "@/lib/quiz/quiz";
import type { FaltaQuiz } from "@/lib/quiz/faltas";
import { faltasDaLamina } from "./EditorQuiz";

// Fluxo do quiz (03/11, Davi: "um Figma/Framer para quizzes"): o quiz inteiro como blocos ligados por setas. Em
// três segundos responde onde a tela está, para onde leva e, com o celular ao lado, como ela aparece. A ordem real
// continua a do quiz; mover um bloco só muda o desenho, guardado neste Mac.

type Dados = { lamina?: Lamina; numero?: number; rotulo: string; subtitulo: string; pend: number; selecionado: boolean; cor: string; Icone: LucideIcon };

const CORES: Record<string, { borda: string; fundo: string; texto: string }> = {
  cinza: { borda: "border-zinc-500/50", fundo: "bg-zinc-500/10", texto: "text-zinc-300" },
  ciano: { borda: "border-sky-500/50", fundo: "bg-sky-500/10", texto: "text-sky-300" },
  roxo: { borda: "border-violet-500/50", fundo: "bg-violet-500/10", texto: "text-violet-300" },
  laranja: { borda: "border-orange-500/50", fundo: "bg-orange-500/10", texto: "text-orange-300" },
  amarelo: { borda: "border-amber-500/50", fundo: "bg-amber-500/10", texto: "text-amber-300" },
};

function Bloco({ data }: NodeProps<Dados>) {
  const c = CORES[data.cor];
  const { Icone } = data;
  return (
    <div className={cn("w-[190px] cursor-pointer rounded-2xl border bg-[#0d131c] p-3 text-white shadow-lg transition-shadow", c.borda,
      data.selecionado && "!border-cyan-300 shadow-[0_0_0_2px_rgba(103,232,249,0.5),0_0_24px_rgba(34,211,238,0.35)]")}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-white/30" />
      <div className="flex items-center gap-1.5">
        <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", c.fundo, c.texto)}><Icone className="h-3 w-3" />{data.subtitulo}</span>
        {data.numero != null && <span className="ml-auto text-[10px] tabular-nums text-white/40">{data.numero}</span>}
      </div>
      <p className="mt-2 line-clamp-3 min-h-[3.2em] text-[13px] font-medium leading-snug">{data.rotulo}</p>
      <div className="mt-2 flex items-center justify-end">
        {data.pend
          ? <span className="flex items-center gap-1 text-[11px] font-medium text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />{data.pend} {data.pend === 1 ? "pendência" : "pendências"}</span>
          : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-white/30" />
    </div>
  );
}
const tiposDeBloco = { bloco: Bloco };

const VISUAL: Record<Lamina["tipo"], { cor: string; Icone: LucideIcon; nome: string }> = {
  intro: { cor: "cinza", Icone: Home, nome: "Abertura" }, pergunta: { cor: "ciano", Icone: ListChecks, nome: "Pergunta" },
  tela: { cor: "amarelo", Icone: Clock, nome: "Respiro" }, captura: { cor: "cinza", Icone: Contact, nome: "Contato" }, fim: { cor: "roxo", Icone: Trophy, nome: "Perfil" },
};
const PASSO_X = 250, ALTURA_PERFIL = 170, MEIO_Y = 260;

export function FluxoQuiz({ quizId, estrutura, laminas, faltas, selecionada, onEscolher, onAdicionar }: {
  quizId: string; estrutura: EstruturaQuiz; laminas: Lamina[]; faltas: FaltaQuiz[]; selecionada: string;
  onEscolher: (chave: string) => void; onAdicionar: () => void;
}) {
  const chaveMapa = `quiz:fluxo:${quizId}`;
  const [movidos, setMovidos] = useState<Record<string, { x: number; y: number }>>(() => {
    try { return JSON.parse(localStorage.getItem(chaveMapa) || "{}"); } catch { return {}; }
  });
  const montar = useCallback((): Node<Dados>[] => {
    const antes = laminas.filter((l) => l.tipo !== "fim");
    const fins = laminas.filter((l) => l.tipo === "fim");
    let pergunta = 0;
    const lista: Node<Dados>[] = antes.map((l, i) => {
      const v = VISUAL[l.tipo];
      if (l.tipo === "pergunta") pergunta++;
      return {
        id: l.chave, type: "bloco", position: movidos[l.chave] ?? { x: i * PASSO_X, y: MEIO_Y },
        data: { lamina: l, numero: laminas.indexOf(l) + 1, rotulo: l.rotulo.replace(/^P\d+\.\s*/, ""), subtitulo: l.tipo === "pergunta" ? `Pergunta ${pergunta}` : v.nome,
          pend: faltasDaLamina(l, estrutura, faltas).length, selecionado: l.chave === selecionada, cor: v.cor, Icone: v.Icone },
      };
    });
    const xFim = antes.length * PASSO_X;
    fins.forEach((l, i) => {
      const y = MEIO_Y + (i - (fins.length - 1) / 2) * ALTURA_PERFIL;
      const fimUnico = fins.length === 1;
      lista.push({
        id: l.chave, type: "bloco", position: movidos[l.chave] ?? { x: xFim, y },
        data: { lamina: l, numero: laminas.indexOf(l) + 1, rotulo: l.rotulo.replace(/^Resultado:\s*/, ""), subtitulo: fimUnico ? "Resultado" : `Perfil ${i + 1}`,
          pend: faltasDaLamina(l, estrutura, faltas).length, selecionado: l.chave === selecionada, cor: "roxo", Icone: Trophy },
      });
    });
    if (estrutura.oferta && fins[0]) {
      lista.push({
        id: "oferta", type: "bloco", position: movidos.oferta ?? { x: xFim + PASSO_X + 40, y: MEIO_Y }, selectable: true,
        data: { lamina: fins[0], rotulo: estrutura.oferta.titulo || estrutura.oferta.produto || "Oferta", subtitulo: "Oferta",
          pend: faltas.filter((f) => f.caminho.startsWith("oferta")).length, selecionado: false, cor: "laranja", Icone: Tag },
      });
    }
    return lista;
  }, [laminas, estrutura, faltas, selecionada, movidos]);

  const [nodes, setNodes] = useState<Node<Dados>[]>(montar);
  // Atualiza por cima dos blocos que já existem: recriá-los perderia o tamanho medido, e as setas sumiriam.
  useEffect(() => setNodes((atuais) => montar().map((n) => {
    const v = atuais.find((x) => x.id === n.id);
    return v ? { ...v, data: n.data, position: movidos[n.id] ? v.position : n.position } : n;
  })), [montar, movidos]);
  const onNodesChange = useCallback((ch: NodeChange[]) => setNodes((n) => applyNodeChanges(ch, n)), []);

  const edges = useMemo<Edge[]>(() => {
    const antes = laminas.filter((l) => l.tipo !== "fim");
    const fins = laminas.filter((l) => l.tipo === "fim");
    const seta = { type: MarkerType.ArrowClosed, color: "#7dd3fc" };
    const lista: Edge[] = antes.slice(1).map((l, i) => ({ id: `e${i}`, source: antes[i].chave, target: l.chave, markerEnd: seta, style: { stroke: "#7dd3fc", strokeWidth: 2 } }));
    const ultimo = antes[antes.length - 1];
    const porPerfil = (id?: string) => estrutura.perguntas.reduce((s, q) => s + q.opcoes.filter((o) => o.perfil === id).length, 0);
    fins.forEach((l) => {
      const n = l.perfil ? porPerfil(l.perfil) : 0;
      if (ultimo) lista.push({
        id: `p${l.chave}`, source: ultimo.chave, target: l.chave, type: "smoothstep", label: n ? `${n} respostas` : undefined,
        labelStyle: { fill: "#ddd6fe", fontSize: 10 }, labelBgStyle: { fill: "#0d131c" }, markerEnd: { ...seta, color: "#a78bfa" }, style: { stroke: "#a78bfa", strokeWidth: 2 },
      });
      if (estrutura.oferta) lista.push({ id: `o${l.chave}`, source: l.chave, target: "oferta", type: "smoothstep", markerEnd: { ...seta, color: "#fb923c" }, style: { stroke: "#fb923c", strokeWidth: 2 } });
    });
    return lista;
  }, [laminas, estrutura]);

  return (
    <div className="dark relative h-full min-h-0 w-full overflow-hidden rounded-lg bg-[#090e15]">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={tiposDeBloco} onNodesChange={onNodesChange} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.2} maxZoom={1.6}
        nodesConnectable={false} proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => { const l = (n.data as Dados).lamina; if (l) onEscolher(l.chave); }}
        onNodeDragStop={(_, n) => {
          const novo = { ...movidos, [n.id]: n.position };
          setMovidos(novo);
          try { localStorage.setItem(chaveMapa, JSON.stringify(novo)); } catch { /* sem armazenamento */ }
        }}>
        <Background color="#ffffff14" gap={22} />
        <MiniMap pannable zoomable className="!bg-[#0d131c]" maskColor="rgba(0,0,0,0.5)" nodeColor={(n) => ({ ciano: "#38bdf8", roxo: "#a78bfa", laranja: "#fb923c", amarelo: "#fbbf24" } as Record<string, string>)[(n.data as Dados).cor] ?? "#71717a"} />
        <Controls showInteractive={false} />
      </ReactFlow>
      <button type="button" onClick={onAdicionar} className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0d131c] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10">
        <Plus className="h-3.5 w-3.5" />Adicionar pergunta
      </button>
    </div>
  );
}
