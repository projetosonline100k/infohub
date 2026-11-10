import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, Handle, MarkerType, Position, applyNodeChanges, type Edge, type Node, type NodeChange, type NodeProps, type ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import { GitFork, List, ListChecks, Mail, MessageSquare, Phone, Trash2, Trophy, Type, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTULO_TIPO, pontuacaoMaxima, type ConfigChatbot, type TipoEtapa } from "@/lib/chatbot/chatbot";

// Fluxo do chatbot (10/11/2026, Davi: "me mostrar um fluxo igual o do quiz"): as etapas descem em zigue-zague, e no
// fim a pontuação separa quem se qualificou de quem não. Clicar num bloco escolhe a etapa (editor e prévia seguem).
interface Dados { apagar?: () => void; titulo: string; sub: string; selecionado: boolean; cor: string; Icone: LucideIcon; vazio?: boolean; extra?: string }
const CORES: Record<string, { borda: string; icone: string; ponto: string }> = {
  ciano: { borda: "border-cyan-400/60", icone: "border-cyan-300 text-cyan-200", ponto: "#22d3ee" },
  roxo: { borda: "border-violet-400/60", icone: "border-violet-300 text-violet-200", ponto: "#a78bfa" },
  verde: { borda: "border-emerald-400/60", icone: "border-emerald-300 text-emerald-200", ponto: "#34d399" },
  rosa: { borda: "border-pink-400/60", icone: "border-pink-300 text-pink-200", ponto: "#f472b6" },
  amarelo: { borda: "border-amber-400/60", icone: "border-amber-300 text-amber-200", ponto: "#fbbf24" },
};
const ICONE: Record<TipoEtapa, LucideIcon> = { nenhum: MessageSquare, texto: Type, whatsapp: Phone, email: Mail, escolha: ListChecks, lista: List };

function Bloco({ data }: NodeProps<Dados>) {
  const c = CORES[data.cor];
  const { Icone } = data;
  return (
    <div className={cn("relative flex w-[250px] cursor-pointer items-center gap-3 rounded-[28px] border bg-[#0b1220] py-2.5 pl-2.5 pr-4 text-white transition-shadow", c.borda,
      data.selecionado && "!border-cyan-300 shadow-[0_0_0_2px_rgba(103,232,249,0.45),0_0_26px_rgba(34,211,238,0.4)]")}>
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0" style={{ background: c.ponto }} />
      <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 bg-white/5", c.icone)}><Icone className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-tight">{data.titulo || "(sem mensagem)"}</span>
        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-white/55">{data.sub}</span>
      </span>
      {data.apagar && data.selecionado && (
        <button type="button" title="Apagar esta etapa (Delete)" onClick={(e) => { e.stopPropagation(); data.apagar!(); }}
          className="nodrag absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-rose-400/60 bg-[#0b1220] text-rose-300 shadow-lg hover:bg-rose-500 hover:text-white"><Trash2 className="h-3.5 w-3.5" /></button>
      )}
      {data.extra && <span className="shrink-0 self-start rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">{data.extra}</span>}
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0" style={{ background: c.ponto }} />
    </div>
  );
}
const tipos = { bloco: Bloco };
const limpa = (s: string) => s.replace(/\*\*/g, "").replace(/\{(\w+)\}/g, "…");
const PASSO = 120;

export function FluxoChatbot({ config, selecionada, onEscolher, onApagar }: { config: ConfigChatbot; selecionada: string; onEscolher: (id: string) => void; onApagar?: (id: string) => void }) {
  const montar = useCallback((): Node<Dados>[] => {
    const n = config.etapas.length;
    const lista: Node<Dados>[] = config.etapas.map((e, i) => ({
      id: e.id, type: "bloco", position: { x: i % 2 ? 70 : 0, y: i * PASSO },
      data: {
        titulo: limpa(e.mensagens[e.mensagens.length - 1] ?? e.rotulo ?? ""), sub: e.tipo === "nenhum" ? "Só mensagem" : `${ROTULO_TIPO[e.tipo]} · ${e.chave}`,
        selecionado: e.id === selecionada, cor: e.tipo === "nenhum" ? "amarelo" : e.opcoes?.some((o) => o.pontos) ? "roxo" : "ciano", Icone: ICONE[e.tipo],
        apagar: onApagar && config.etapas.length > 1 ? () => onApagar(e.id) : undefined,
        extra: e.opcoes?.length ? `até ${Math.max(0, ...e.opcoes.map((o) => o.pontos ?? 0))} pts` : undefined,
      },
    }));
    lista.push({
      id: "decisao", type: "bloco", position: { x: 35, y: n * PASSO },
      data: { titulo: `Pontuação ≥ ${config.pontuacao.minimo}?`, sub: `máximo ${pontuacaoMaxima(config)} pontos`, selecionado: false, cor: "amarelo", Icone: GitFork },
    });
    lista.push(
      { id: "final-qualificado", type: "bloco", position: { x: -150, y: (n + 1) * PASSO + 20 }, data: { titulo: "Alto potencial", sub: limpa(config.desfechos.qualificado.mensagens[0] ?? ""), selecionado: selecionada === "final-qualificado", cor: "verde", Icone: Trophy } },
      { id: "final-nao_qualificado", type: "bloco", position: { x: 230, y: (n + 1) * PASSO + 20 }, data: { titulo: "Não qualificado", sub: limpa(config.desfechos.nao_qualificado.mensagens[0] ?? ""), selecionado: selecionada === "final-nao_qualificado", cor: "rosa", Icone: XCircle } },
    );
    return lista;
  }, [config, selecionada, onApagar]);

  const [nodes, setNodes] = useState<Node<Dados>[]>(montar);
  useEffect(() => setNodes((atuais) => montar().map((x) => {
    const v = atuais.find((a) => a.id === x.id);
    return v ? { ...v, data: x.data, position: x.position } : x;
  })), [montar]);
  const onNodesChange = useCallback((ch: NodeChange[]) => setNodes((n) => applyNodeChanges(ch, n)), []);

  const edges = useMemo<Edge[]>(() => {
    const e = config.etapas;
    const seta = { type: MarkerType.ArrowClosed };
    const l: Edge[] = e.slice(1).map((x, i) => ({ id: `e${i}`, source: e[i].id, target: x.id, style: { stroke: i % 2 ? "#a78bfa" : "#22d3ee", strokeWidth: 2 } }));
    if (e.length) l.push({ id: "e-dec", source: e[e.length - 1].id, target: "decisao", style: { stroke: "#fbbf24", strokeWidth: 2 } });
    const rot = { fontSize: 10, fill: "#e5e7eb" };
    l.push(
      { id: "d-q", source: "decisao", target: "final-qualificado", type: "smoothstep", label: `≥ ${config.pontuacao.minimo}`, labelStyle: rot, labelBgStyle: { fill: "#0b1220" }, markerEnd: { ...seta, color: "#34d399" }, style: { stroke: "#34d399", strokeWidth: 2 } },
      { id: "d-n", source: "decisao", target: "final-nao_qualificado", type: "smoothstep", label: `< ${config.pontuacao.minimo}`, labelStyle: rot, labelBgStyle: { fill: "#0b1220" }, markerEnd: { ...seta, color: "#f472b6" }, style: { stroke: "#f472b6", strokeWidth: 2 } },
    );
    return l;
  }, [config]);

  const instancia = useRef<ReactFlowInstance | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const irPara = useCallback((id: string, animar: boolean) => {
    const n = instancia.current?.getNode(id);
    // Cabe a largura do zigue-zague (320) na caixa; centro fixo no meio dele, só a altura acompanha o bloco.
    const zoom = Math.min(0.85, (caixa.current?.clientWidth ?? 340) / 340);
    if (n) instancia.current?.setCenter(n.id.startsWith("final-") ? n.position.x + 125 : 160, n.position.y + 60, { zoom, duration: animar ? 300 : 0 });
  }, []);
  useEffect(() => { irPara(selecionada, true); }, [selecionada, irPara]);
  // Delete/Backspace apaga a etapa escolhida quando o mouse está sobre o fluxo (e não se está digitando).
  const sobre = useRef(false);
  const apagarRef = useRef({ onApagar, selecionada, total: config.etapas.length, ehEtapa: config.etapas.some((e) => e.id === selecionada) });
  apagarRef.current = { onApagar, selecionada, total: config.etapas.length, ehEtapa: config.etapas.some((e) => e.id === selecionada) };
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      const a = apagarRef.current;
      if (!sobre.current || !a.onApagar || !a.ehEtapa || a.total < 2 || (ev.key !== "Delete" && ev.key !== "Backspace")) return;
      const alvo = ev.target instanceof HTMLElement ? ev.target : null;
      if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
      ev.preventDefault();
      a.onApagar(a.selecionada);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);
  useEffect(() => {   // pinça no trackpad do app do Mac
    const el = caixa.current;
    if (!el) return;
    let base = 1;
    const inicio = (ev: Event) => { ev.preventDefault(); base = instancia.current?.getZoom() ?? 1; };
    const muda = (ev: Event) => { ev.preventDefault(); instancia.current?.zoomTo(Math.min(1.6, Math.max(0.2, base * (ev as Event & { scale: number }).scale))); };
    el.addEventListener("gesturestart", inicio); el.addEventListener("gesturechange", muda);
    return () => { el.removeEventListener("gesturestart", inicio); el.removeEventListener("gesturechange", muda); };
  }, []);

  return (
    <div ref={caixa} onMouseEnter={() => { sobre.current = true; }} onMouseLeave={() => { sobre.current = false; }} className="dark relative h-full min-h-0 w-full overflow-hidden rounded-xl bg-[radial-gradient(circle_at_50%_0%,#101c33,#080d17_70%)]">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={tipos} onNodesChange={onNodesChange} minZoom={0.2} maxZoom={1.6}
        onInit={(i) => { instancia.current = i; setTimeout(() => irPara(selecionada, false), 50); }}
        panOnScroll zoomOnScroll={false} zoomOnPinch nodesConnectable={false} proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => { if (n.id !== "decisao") onEscolher(n.id); }}>
        <Background color="#ffffff10" gap={26} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
