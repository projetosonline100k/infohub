import { memo, useEffect, useMemo } from "react";
import ReactFlow, { Background, Controls, Handle, MarkerType, MiniMap, Position, useNodesState, type Edge, type Node, type NodeProps } from "reactflow";
import "reactflow/dist/style.css";
import { cn } from "@/lib/utils";
import { diferencaPalavras, lerTrechos, mudou } from "@/lib/conteudo/trechos";
import { CabecaBoneco } from "./BonecoMesa";

// A peça da esteira como mapa mental (pedido do Davi, 17/10/2026: "em vez de ver o documento de
// cada etapa, quero ver em formato de mapa mental, conectado e funcional"). Ideia → Headline (Leo)
// → Roteiro em trechos (Junior, com o porquê) → Revisão (Elias, com o que mudou). Clicar num nó
// abre a conversa com quem fez, já falando daquele trecho.
export interface EtapaMapa { nome: string; membro_id: string }
export interface PecaMapa { id: string; titulo: string; textos: Record<string, unknown>; etapa: number }

type Dados = {
  tipo: "ideia" | "titulo" | "trecho" | "cabeca";
  texto: string; nota?: string | null; cor: "ambar" | "verde" | "azul" | "cinza";
  quem?: string; ehIa?: boolean; diff?: ReturnType<typeof diferencaPalavras> | null; alterado?: boolean; n?: number;
};

const COR: Record<Dados["cor"], string> = {
  ambar: "border-amber-400/70 bg-amber-950/60",
  verde: "border-emerald-400/70 bg-emerald-950/60",
  azul: "border-sky-400/70 bg-sky-950/50",
  cinza: "border-zinc-600 bg-zinc-900",
};

const No = memo(function No({ data, selected }: NodeProps<Dados>) {
  return (
    <div className={cn("w-[270px] cursor-pointer rounded-xl border-2 px-3 py-2 text-zinc-100 shadow-lg transition-shadow", COR[data.cor],
      selected && "ring-2 ring-white/60", data.tipo === "cabeca" && "w-[230px]")}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-zinc-500" />
      {data.tipo === "cabeca" ? (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-7 w-7 overflow-hidden rounded-full bg-zinc-800"><CabecaBoneco nome={data.quem ?? "?"} ehIa className="h-full w-full" /></span>
          {data.texto}
        </p>
      ) : (
        <>
          {data.quem && <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{data.n ? `${data.quem} · trecho ${data.n}` : data.quem}</p>}
          <p className={cn("whitespace-pre-line text-[12.5px] leading-snug", data.tipo === "titulo" && "text-[14px] font-semibold")}>
            {data.diff ? data.diff.map((d, i) => (
              <span key={i} className={cn(d.tipo === "saiu" && "text-rose-300 line-through", d.tipo === "entrou" && "rounded bg-emerald-500/25 text-emerald-200")}>{d.texto}</span>
            )) : data.texto}
          </p>
          {data.nota && (
            <p className="mt-1.5 flex gap-1.5 border-t border-white/10 pt-1.5 text-[11px] leading-snug text-zinc-300">
              <span className={cn("mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border-2", data.cor === "azul" ? "border-sky-400" : "border-emerald-400")} />{data.nota}
            </p>
          )}
          {data.alterado && !data.nota && <p className="mt-1 text-[10px] text-zinc-500">mudou (sem nota)</p>}
        </>
      )}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-zinc-500" />
    </div>
  );
});
const TIPOS = { no: No };

const LARGURA = 330, ALTURA_TRECHO = 150;

export function MapaPeca({ peca, etapas, nomeDe, onFalar }: {
  peca: PecaMapa; etapas: EtapaMapa[]; nomeDe: (id: string) => string;
  /** Clicou num nó: conversa com quem fez, já sobre aquele trecho. */
  onFalar: (membroId: string, texto: string) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const ns: Node<Dados>[] = [];
    const es: Edge[] = [];
    const textos = peca.textos ?? {};
    const trechos = (textos._trechos as Record<string, unknown> | undefined) ?? {};
    const liga = (de: string, para: string, cor = "#71717a", animado = false) =>
      es.push({ id: `${de}-${para}`, source: de, target: para, animated: animado, style: { stroke: cor, strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: cor } });

    // Coluna 0: a ideia (quando a headline veio de um pedido) e a headline.
    const ideia = typeof textos.Ideia === "string" ? textos.Ideia : null;
    let x = 0;
    if (ideia) {
      ns.push({ id: "ideia", type: "no", position: { x, y: 0 }, data: { tipo: "ideia", texto: ideia, cor: "cinza", quem: "Ideia / pedido" } });
      x += LARGURA;
    }
    const e0 = etapas[0];
    ns.push({ id: "titulo", type: "no", position: { x, y: 0 }, data: { tipo: "titulo", texto: peca.titulo, cor: "ambar", quem: e0 ? `${nomeDe(e0.membro_id)} · ${e0.nome}` : "Headline" } });
    if (ideia) liga("ideia", "titulo");
    x += LARGURA;

    // Colunas seguintes: cada etapa com trechos (Roteiro, Revisão…) ou o texto corrido dela.
    let anterior: string[] = ["titulo"];
    let base: ReturnType<typeof lerTrechos> = [];
    etapas.slice(1).forEach((e, idx) => {
      const lista = lerTrechos(trechos[e.nome]);
      const corrido = typeof textos[e.nome] === "string" ? (textos[e.nome] as string) : null;
      if (!lista.length && !corrido) return;
      const quem = nomeDe(e.membro_id);
      const cab = `cab-${idx}`;
      ns.push({ id: cab, type: "no", position: { x, y: -90 }, data: { tipo: "cabeca", texto: `${quem} · ${e.nome}`, quem, cor: "cinza" } });
      const ids: string[] = [];
      const itens = lista.length ? lista : [{ texto: corrido!, nota: null }];
      itens.forEach((t, k) => {
        const id = `e${idx}-t${k}`;
        const original = idx > 0 ? base[k]?.texto : undefined;
        const alterado = original !== undefined && mudou(original, t.texto);
        ns.push({
          id, type: "no", position: { x, y: k * ALTURA_TRECHO },
          data: {
            tipo: "trecho", texto: t.texto, nota: t.nota, quem, n: lista.length ? k + 1 : undefined, alterado,
            diff: alterado ? diferencaPalavras(original!, t.texto) : null,
            cor: idx === 0 ? (t.nota ? "verde" : "cinza") : (alterado || t.nota ? "azul" : "cinza"),
          },
        });
        ids.push(id);
        // Roteiro sai da headline; a revisão de cada trecho sai do trecho correspondente.
        if (idx === 0) liga("titulo", id);
        else liga(anterior[Math.min(k, anterior.length - 1)], id, alterado ? "#38bdf8" : "#71717a", alterado);
      });
      if (idx === 0) base = lista;
      anterior = ids;
      x += LARGURA + 40;
    });
    return { nodes: ns, edges: es };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nomeDe muda a cada render; o conteúdo da peça é o que importa
  }, [JSON.stringify(peca.textos), peca.titulo, JSON.stringify(etapas)]);
  // Os blocos podem ser arrastados; quando a peça muda (ele reescreveu), o mapa se refaz.
  const [nos, setNos, mudarNos] = useNodesState(nodes);
  useEffect(() => setNos(nodes), [nodes, setNos]);

  // Clicar num nó: conversa com quem fez aquele nó.
  const quemDoNo = (id: string): string | null => {
    if (id === "titulo" || id === "ideia") return etapas[0]?.membro_id ?? null;
    const m = id.match(/^(?:e|cab-)(\d+)/);
    return m ? etapas[Number(m[1]) + 1]?.membro_id ?? null : null;
  };

  return (
    <div className="h-full w-full overflow-hidden rounded-xl border bg-zinc-950">
      <ReactFlow nodes={nos} onNodesChange={mudarNos} edges={edges} nodeTypes={TIPOS} fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.2} maxZoom={1.6}
        nodesConnectable={false} proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => {
          const quem = quemDoNo(n.id);
          if (!quem) return;
          const d = n.data as Dados;
          onFalar(quem, d.n ? `Sobre o trecho ${d.n} de "${peca.titulo}" ("${d.texto.slice(0, 80)}${d.texto.length > 80 ? "…" : ""}"): ` : `Sobre "${peca.titulo}": `);
        }}>
        <Background color="#27272a" gap={20} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(n) => ({ ambar: "#f59e0b", verde: "#10b981", azul: "#0ea5e9", cinza: "#52525b" }[(n.data as Dados).cor])} maskColor="rgba(0,0,0,0.6)" />
      </ReactFlow>
    </div>
  );
}
