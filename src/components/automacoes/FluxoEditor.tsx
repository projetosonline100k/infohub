import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background, Controls, Handle, MarkerType, Position, applyNodeChanges, type Connection, type Edge, type Node, type NodeChange, type NodeProps, type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { AlertTriangle, Clock, GitBranch, Link2, Loader2, MessageCircle, Plus, Power, Trash2, X, Zap, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { GATILHOS } from "@/lib/automacoes/instagram";
import { cn } from "@/lib/utils";
import {
  LIMITE_TITULO_BOTAO, MAX_BOTOES_LINK, MAX_RESPOSTAS, grafoVazio, problemasDoFluxo, saidasDoNo,
  type Botao, type GrafoFluxo, type NoFluxo, type TipoNo,
} from "../../../supabase/functions/_shared/fluxo";
import type { FluxoInstagram, NumerosDoNo } from "@/hooks/useInstagramFluxos";

// Editor de fluxo de mensagens do Instagram (13/11/2026, Davi: "automações igual ao dash do ManyChat").
// Blocos ligados por setas, da esquerda para a direita: início → mensagem (com botões) → esperar → condição → fim.
// Cada saída de um bloco (botão de resposta, "sim/não", "depois do tempo") tem o seu ponto de ligação.

type Dados = { no: NoFluxo; selecionado: boolean; problemas: string[]; numeros?: NumerosDoNo };
const VISUAL: Record<TipoNo, { nome: string; Icone: LucideIcon; cor: string }> = {
  inicio: { nome: "Gatilho", Icone: Zap, cor: "border-amber-300/70 bg-amber-300/10 text-amber-100" },
  mensagem: { nome: "Mensagem", Icone: MessageCircle, cor: "border-cyan-300/60 bg-cyan-300/10 text-cyan-100" },
  esperar: { nome: "Esperar", Icone: Clock, cor: "border-violet-300/60 bg-violet-300/10 text-violet-100" },
  condicao: { nome: "Condição", Icone: GitBranch, cor: "border-emerald-300/60 bg-emerald-300/10 text-emerald-100" },
  fim: { nome: "Fim", Icone: Power, cor: "border-rose-300/60 bg-rose-300/10 text-rose-100" },
};

const resumo = (no: NoFluxo) => {
  if (no.tipo === "mensagem") return (no.dados.texto ?? "").trim() || "Toque para escrever a mensagem";
  if (no.tipo === "esperar") { const m = no.dados.minutos ?? 0; return m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`; }
  if (no.tipo === "condicao") return no.dados.condicao === "texto_contem" ? `Resposta contém “${no.dados.palavra ?? ""}”` : "A pessoa respondeu?";
  if (no.tipo === "inicio") return "Quando a palavra chegar";
  return "O fluxo termina aqui";
};

function BlocoFluxo({ data }: NodeProps<Dados>) {
  const { no } = data;
  const v = VISUAL[no.tipo];
  const saidas = saidasDoNo(no);
  const botoes = no.tipo === "mensagem" ? (no.dados.botoes ?? []) : [];
  return (
    <div className={cn("relative w-[280px] rounded-2xl border bg-[#0b1220] text-white shadow-lg transition-shadow", data.selecionado ? "border-cyan-300 shadow-[0_0_0_2px_rgba(103,232,249,0.45),0_0_26px_rgba(34,211,238,0.35)]" : "border-white/15")}>
      {no.tipo !== "inicio" && <Handle type="target" position={Position.Left} className="!h-3.5 !w-3.5 !border-2 !border-[#0b1220] !bg-cyan-300" />}
      <div className={cn("flex items-center gap-2 rounded-t-2xl border-b px-3 py-2 text-xs font-semibold", v.cor)}><v.Icone className="h-4 w-4" />{v.nome}
        {data.problemas.length > 0 && <span title={data.problemas.join("\n")} className="ml-auto text-amber-300"><AlertTriangle className="h-4 w-4" /></span>}
        {data.numeros && no.tipo === "mensagem" && <span className="ml-auto text-[10px] font-normal text-white/60" title="Enviadas · respostas">{data.numeros.enviadas} env · {data.numeros.respostas} resp</span>}
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <p className={cn("line-clamp-4 whitespace-pre-wrap text-[13px] leading-snug", no.tipo === "mensagem" && !(no.dados.texto ?? "").trim() && "text-white/40")}>{resumo(no)}</p>
        {botoes.length > 0 && no.tipo === "mensagem" && (
          <div className="space-y-1">{botoes.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">{b.tipo === "link" && <Link2 className="h-3 w-3 shrink-0 text-cyan-300" />}<span className="truncate">{b.titulo || "Botão"}</span></span>
              {b.tipo === "resposta" && <span className="relative h-0 w-0"><Handle id={b.id} type="source" position={Position.Right} className="!right-[-20px] !h-3.5 !w-3.5 !border-2 !border-[#0b1220] !bg-cyan-300" /></span>}
            </div>))}
          </div>)}
      </div>
      {/* saídas que não são botões da própria mensagem (próximo, sim/não, outra resposta) */}
      {saidas.filter((s) => !botoes.some((b) => b.id === s.id)).map((s) => (
        <div key={s.id} className="relative flex items-center justify-end border-t border-white/10 px-3 py-1.5 text-[11px] text-white/60">
          {s.rotulo || "Depois"}
          <Handle id={s.id} type="source" position={Position.Right} className="!h-3.5 !w-3.5 !border-2 !border-[#0b1220] !bg-fuchsia-300" />
        </div>))}
    </div>
  );
}
const tipos = { bloco: BlocoFluxo };
const novoId = () => `n${Math.random().toString(36).slice(2, 8)}`;

export function FluxoEditor({ aberto, fluxo, contaNome, numeros, onFechar, onSalvar }: {
  aberto: boolean; fluxo: FluxoInstagram | null; contaNome: string; numeros: Record<string, NumerosDoNo>;
  onFechar: () => void; onSalvar: (f: Omit<FluxoInstagram, "id" | "ig_user_id" | "disparos" | "user_id">, id?: string) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [gatilhos, setGatilhos] = useState<string[]>(["comentario"]);
  const [palavras, setPalavras] = useState("");
  const [exata, setExata] = useState(false);
  const [respostas, setRespostas] = useState("");
  const [grafo, setGrafo] = useState<GrafoFluxo>(grafoVazio());
  const [sel, setSel] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const instancia = useRef<ReactFlowInstance | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setNome(fluxo?.nome ?? "Novo fluxo"); setAtivo(fluxo?.ativo ?? false);
    setGatilhos(fluxo?.gatilhos ?? ["comentario"]); setPalavras((fluxo?.palavras_chave ?? []).join(", "));
    setExata(fluxo?.correspondencia === "exata"); setRespostas((fluxo?.respostas_comentario ?? []).join("\n"));
    setGrafo(fluxo?.grafo?.nos?.length ? fluxo.grafo : grafoVazio()); setSel(null);
  }, [aberto, fluxo]);

  const problemas = useMemo(() => problemasDoFluxo(grafo), [grafo]);
  const porNo = useMemo(() => { const m = new Map<string, string[]>(); for (const p of problemas) if (p.no) m.set(p.no, [...(m.get(p.no) ?? []), p.texto]); return m; }, [problemas]);
  const palavrasLista = useMemo(() => palavras.split(/[,\n]/).map((p) => p.trim()).filter(Boolean), [palavras]);

  const nodes = useMemo<Node<Dados>[]>(() => grafo.nos.map((n) => ({
    id: n.id, type: "bloco", position: { x: n.x, y: n.y }, draggable: true, deletable: n.tipo !== "inicio",
    data: { no: n, selecionado: n.id === sel, problemas: porNo.get(n.id) ?? [], numeros: numeros[n.id] },
  })), [grafo.nos, sel, porNo, numeros]);
  const edges = useMemo<Edge[]>(() => grafo.ligacoes.map((l) => ({
    id: `${l.de}:${l.saida}`, source: l.de, sourceHandle: l.saida, target: l.para, type: "smoothstep", interactionWidth: 24,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#67e8f9" }, style: { stroke: "#67e8f9", strokeWidth: 2 },
  })), [grafo.ligacoes]);

  const mudarNo = (id: string, f: (n: NoFluxo) => NoFluxo) => setGrafo((g) => ({ ...g, nos: g.nos.map((n) => (n.id === id ? f(n) : n)) }));
  const onNodesChange = useCallback((ch: NodeChange[]) => {
    setGrafo((g) => {
      const mov = ch.filter((c) => c.type === "position" && c.position) as (NodeChange & { id: string; position: { x: number; y: number } })[];
      if (!mov.length) return g;
      return { ...g, nos: g.nos.map((n) => { const m = mov.find((c) => c.id === n.id); return m ? { ...n, x: m.position.x, y: m.position.y } : n; }) };
    });
    void applyNodeChanges;
  }, []);
  const ligar = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    setGrafo((g) => ({ ...g, ligacoes: [...g.ligacoes.filter((l) => !(l.de === c.source && l.saida === (c.sourceHandle ?? "proximo"))), { de: c.source!, saida: c.sourceHandle ?? "proximo", para: c.target! }] }));
  }, []);
  const apagarNos = (ids: string[]) => {
    const ok = ids.filter((i) => i !== "inicio"); if (!ok.length) return;
    setGrafo((g) => ({ nos: g.nos.filter((n) => !ok.includes(n.id)), ligacoes: g.ligacoes.filter((l) => !ok.includes(l.de) && !ok.includes(l.para)) }));
    setSel(null);
  };

  const adicionar = (tipo: Exclude<TipoNo, "inicio">) => {
    const id = novoId();
    const base = grafo.nos.find((n) => n.id === sel) ?? grafo.nos.find((n) => n.id === "inicio")!;
    const dados = tipo === "mensagem" ? { texto: "" } : tipo === "esperar" ? { minutos: 10 } : tipo === "condicao" ? { condicao: "respondeu" as const } : {};
    const novo: NoFluxo = { id, tipo, x: base.x + 360, y: base.y + (grafo.nos.filter((n) => n.x > base.x + 100 && n.x < base.x + 700).length) * 40, dados };
    // se o bloco escolhido tem uma saída livre, já liga
    const livre = saidasDoNo(base).find((s) => !grafo.ligacoes.some((l) => l.de === base.id && l.saida === s.id));
    setGrafo((g) => ({ nos: [...g.nos, novo], ligacoes: livre ? [...g.ligacoes, { de: base.id, saida: livre.id, para: id }] : g.ligacoes }));
    setSel(id);
    window.setTimeout(() => instancia.current?.setCenter(novo.x + 140, novo.y + 80, { zoom: 0.9, duration: 300 }), 50);
  };

  const guardar = async (ativar?: boolean) => {
    if (!nome.trim()) { toast.error("Dê um nome ao fluxo"); return; }
    const quer = ativar ?? ativo;
    if (quer) {
      if (!palavrasLista.length) { toast.error("Escreva ao menos uma palavra-chave para ativar"); return; }
      if (problemas.length) { toast.error(`Arrume antes de ativar: ${problemas[0].texto}`); return; }
    }
    setSalvando(true);
    try {
      await onSalvar({ nome: nome.trim(), ativo: quer, gatilhos: gatilhos.length ? gatilhos : ["comentario"], palavras_chave: palavrasLista, correspondencia: exata ? "exata" : "contem", media_ids: fluxo?.media_ids ?? null, respostas_comentario: respostas.split("\n").map((r) => r.trim()).filter(Boolean), grafo }, fluxo?.id);
      setAtivo(quer); toast.success(quer ? "Fluxo salvo e ativo" : "Fluxo salvo (desativado)"); onFechar();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não consegui salvar"); } finally { setSalvando(false); }
  };

  const no = grafo.nos.find((n) => n.id === sel) ?? null;
  const trocarBotoes = (tipo: "resposta" | "link" | "nenhum") => mudarNo(sel!, (n) => ({ ...n, dados: { ...n.dados, botoes: tipo === "nenhum" ? [] : (n.dados.botoes ?? []).filter((b) => b.tipo === tipo) } }));
  const tipoBotoes = no?.tipo === "mensagem" ? ((no.dados.botoes ?? [])[0]?.tipo ?? "nenhum") : "nenhum";
  const [escolhaBotoes, setEscolhaBotoes] = useState<"nenhum" | "resposta" | "link" | null>(null);
  const modoBotoes = escolhaBotoes ?? (tipoBotoes as "nenhum" | "resposta" | "link");
  useEffect(() => { setEscolhaBotoes(null); }, [sel]);
  const addBotao = (tipo: "resposta" | "link") => mudarNo(sel!, (n) => ({ ...n, dados: { ...n.dados, botoes: [...(n.dados.botoes ?? []), { id: `b${Math.random().toString(36).slice(2, 7)}`, titulo: "", tipo, url: tipo === "link" ? "https://" : undefined }] } }));
  const mudarBotao = (id: string, p: Partial<Botao>) => mudarNo(sel!, (n) => ({ ...n, dados: { ...n.dados, botoes: (n.dados.botoes ?? []).map((b) => (b.id === id ? { ...b, ...p } : b)) } }));
  const tirarBotao = (id: string) => {
    mudarNo(sel!, (n) => ({ ...n, dados: { ...n.dados, botoes: (n.dados.botoes ?? []).filter((b) => b.id !== id) } }));
    setGrafo((g) => ({ ...g, ligacoes: g.ligacoes.filter((l) => !(l.de === sel && l.saida === id)) }));
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => { if (!a) onFechar(); }}>
      <DialogContent className="dark flex h-[94vh] max-h-[94vh] w-[98vw] max-w-[1600px] flex-col gap-0 overflow-hidden border-white/10 bg-[#0a1520] p-0 text-white [&>button]:hidden">
        <DialogDescription className="sr-only">Editor do fluxo de mensagens do Instagram</DialogDescription>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#0c1b27] px-4 py-2.5">
          <DialogTitle className="sr-only">Fluxo de mensagens</DialogTitle>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 w-64 border-white/15 bg-black/20 font-semibold" aria-label="Nome do fluxo" />
          <span className="text-xs text-white/50">{contaNome}</span>
          <label className="ml-2 flex items-center gap-2 text-xs text-white/70"><Switch checked={ativo} onCheckedChange={(v) => { if (v && (problemas.length || !palavrasLista.length)) { toast.error(problemas[0]?.texto ?? "Escreva ao menos uma palavra-chave"); return; } setAtivo(v); }} />{ativo ? "Ativo" : "Desativado"}</label>
          <div className="ml-auto flex items-center gap-2">
            {problemas.length > 0 && <span className="flex items-center gap-1 text-xs text-amber-300"><AlertTriangle className="h-4 w-4" />{problemas.length} ponto{problemas.length === 1 ? "" : "s"} a arrumar</span>}
            <Button variant="outline" size="sm" onClick={onFechar} className="border-white/20 bg-transparent text-white hover:bg-white/10">Fechar</Button>
            <Button size="sm" disabled={salvando} onClick={() => void guardar()}>{salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Salvar</Button>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="relative min-h-0">
            <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-[#0b1220]/90 p-1.5 backdrop-blur">
              {(["mensagem", "esperar", "condicao", "fim"] as const).map((t) => { const v = VISUAL[t]; return (
                <button key={t} type="button" onClick={() => adicionar(t)} className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:brightness-125", v.cor)}><Plus className="h-3 w-3" /><v.Icone className="h-3.5 w-3.5" />{v.nome}</button>); })}
            </div>
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={tipos} onNodesChange={onNodesChange} onConnect={ligar} onInit={(i) => { instancia.current = i; window.setTimeout(() => i.fitView({ padding: 0.3, maxZoom: 0.9 }), 60); }}
              onNodeClick={(_, n) => setSel(n.id)} onPaneClick={() => setSel(null)} onNodesDelete={(ns) => apagarNos(ns.map((n) => n.id))}
              onEdgesDelete={(es) => setGrafo((g) => ({ ...g, ligacoes: g.ligacoes.filter((l) => !es.some((e) => e.id === `${l.de}:${l.saida}`)) }))}
              minZoom={0.2} maxZoom={1.4} deleteKeyCode={["Backspace", "Delete"]} proOptions={{ hideAttribution: true }} className="bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.07)_1px,transparent_0)] [background-size:22px_22px]">
              <Background color="transparent" /><Controls showInteractive={false} className="!bg-[#0b1220]" />
            </ReactFlow>
            {grafo.nos.length === 1 && <p className="pointer-events-none absolute inset-x-0 bottom-8 text-center text-sm text-white/45">Toque em “+ Mensagem” para começar. Arraste do ponto de uma saída até o próximo bloco para ligar.</p>}
          </div>

          <aside className="min-h-0 space-y-4 overflow-y-auto border-t border-white/10 bg-[#0b141a] p-4 lg:border-l lg:border-t-0">
            {!no || no.tipo === "inicio" ? (
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-bold"><Zap className="h-4 w-4 text-amber-300" />Gatilho do fluxo</h3>
                <label className="block space-y-1 text-xs text-white/60">Palavras (separe por vírgula)
                  <Textarea rows={2} value={palavras} onChange={(e) => setPalavras(e.target.value)} placeholder="instalivros, quero, livro" className="border-white/15 bg-black/20 text-sm text-white" /></label>
                <label className="flex items-center gap-2 text-xs text-white/70"><Switch checked={exata} onCheckedChange={setExata} />Só quando a mensagem for exatamente a palavra</label>
                <div className="space-y-1.5"><p className="text-xs text-white/60">Quando vale</p>
                  {GATILHOS.map((g) => (
                    <label key={g.valor} className="flex items-start gap-2 text-xs text-white/80"><input type="checkbox" className="mt-0.5" checked={gatilhos.includes(g.valor)} onChange={(e) => setGatilhos((x) => e.target.checked ? [...x, g.valor] : x.filter((y) => y !== g.valor))} /><span><b>{g.rotulo}</b> <span className="text-white/45">{g.descricao}</span></span></label>))}
                </div>
                {gatilhos.includes("comentario") && (
                  <label className="block space-y-1 text-xs text-white/60">Respostas públicas no comentário (uma por linha; sorteia uma)
                    <Textarea rows={3} value={respostas} onChange={(e) => setRespostas(e.target.value)} placeholder={"Te mandei no direct! 📩\nConfere sua DM 😉"} className="border-white/15 bg-black/20 text-sm text-white" /></label>)}
                <div className="rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/60">
                  <p className="font-semibold text-white/80">Como a Meta funciona</p>
                  <p>A primeira mensagem de um comentário abre a conversa. As próximas só saem <b>depois que a pessoa responde</b> (toca num botão ou escreve), e valem por 24 h. Por isso a primeira mensagem deve ter botões de resposta.</p>
                </div>
                {problemas.length > 0 && <ul className="space-y-1 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200">{problemas.map((p, i) => <li key={i}>• {p.texto}</li>)}</ul>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2"><h3 className="flex flex-1 items-center gap-2 text-sm font-bold">{(() => { const v = VISUAL[no.tipo]; return <><v.Icone className="h-4 w-4" />{v.nome}</>; })()}</h3>
                  <button type="button" onClick={() => apagarNos([no.id])} title="Apagar bloco" className="rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setSel(null)} title="Fechar" className="rounded-lg p-1.5 text-white/40 hover:bg-white/10"><X className="h-4 w-4" /></button></div>
                {no.tipo === "mensagem" && (<>
                  <label className="block space-y-1 text-xs text-white/60">Mensagem
                    <Textarea rows={6} value={no.dados.texto ?? ""} onChange={(e) => mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, texto: e.target.value } }))} placeholder="Oi! Que bom que você quer. Quer receber o link agora?" className="border-white/15 bg-black/20 text-sm text-white" />
                    <span className="text-right text-[10px] text-white/40">{(no.dados.texto ?? "").length} caracteres</span></label>
                  <div className="space-y-2"><p className="text-xs text-white/60">Botões</p>
                    <div className="flex gap-1.5 text-xs">{([["nenhum", "Sem botões"], ["resposta", "Respostas"], ["link", "Links"]] as const).map(([v, r]) => (
                      <button key={v} type="button" onClick={() => { if (v !== modoBotoes) { if (v === "nenhum" || (no.dados.botoes ?? []).length === 0 || confirm("Trocar o tipo apaga os botões atuais desta mensagem. Continuar?")) { trocarBotoes(v); setEscolhaBotoes(v); } } }}
                        className={cn("rounded-lg border px-2.5 py-1.5", modoBotoes === v ? "border-cyan-300 bg-cyan-300/15 text-cyan-100" : "border-white/15 text-white/60 hover:bg-white/5")}>{r}</button>))}</div>
                    {modoBotoes === "resposta" && <p className="text-[11px] text-white/45">A pessoa toca numa resposta e o fluxo segue pelo caminho daquele botão. Até {MAX_RESPOSTAS}; cada um tem a sua saída no bloco.</p>}
                    {modoBotoes === "link" && <p className="text-[11px] text-white/45">Até {MAX_BOTOES_LINK} botões que abrem um link. Depois dessa mensagem o fluxo segue direto para o próximo bloco.</p>}
                    {(no.dados.botoes ?? []).map((b) => (
                      <div key={b.id} className="space-y-1 rounded-lg border border-white/10 bg-black/20 p-2">
                        <div className="flex items-center gap-1.5"><Input value={b.titulo} maxLength={LIMITE_TITULO_BOTAO + 10} onChange={(e) => mudarBotao(b.id, { titulo: e.target.value })} placeholder="Título do botão" className="h-8 border-white/15 bg-black/30 text-sm" />
                          <span className={cn("text-[10px]", b.titulo.length > LIMITE_TITULO_BOTAO ? "text-rose-300" : "text-white/35")}>{b.titulo.length}/{LIMITE_TITULO_BOTAO}</span>
                          <button type="button" onClick={() => tirarBotao(b.id)} className="rounded p-1 text-white/40 hover:text-rose-300"><X className="h-3.5 w-3.5" /></button></div>
                        {b.tipo === "link" && <Input value={b.url ?? ""} onChange={(e) => mudarBotao(b.id, { url: e.target.value.trim() })} placeholder="https://…" className="h-8 border-white/15 bg-black/30 text-sm" />}
                      </div>))}
                    {(modoBotoes === "resposta" && (no.dados.botoes ?? []).length < MAX_RESPOSTAS) && <Button type="button" variant="outline" size="sm" onClick={() => addBotao("resposta")} className="w-full border-white/20 bg-transparent text-white hover:bg-white/10"><Plus className="mr-1 h-3.5 w-3.5" />Botão de resposta</Button>}
                    {(modoBotoes === "link" && (no.dados.botoes ?? []).length < MAX_BOTOES_LINK) && <Button type="button" variant="outline" size="sm" onClick={() => addBotao("link")} className="w-full border-white/20 bg-transparent text-white hover:bg-white/10"><Plus className="mr-1 h-3.5 w-3.5" />Botão de link</Button>}
                  </div></>)}
                {no.tipo === "esperar" && (
                  <label className="block space-y-1 text-xs text-white/60">Esperar quanto tempo?
                    <div className="flex gap-2"><Input type="number" min={1} value={(no.dados.minutos ?? 10) >= 60 && (no.dados.minutos ?? 0) % 60 === 0 ? (no.dados.minutos ?? 0) / 60 : no.dados.minutos ?? 10} className="h-9 w-24 border-white/15 bg-black/20"
                      onChange={(e) => { const v = Math.max(1, Number(e.target.value) || 1); const h = (no.dados.minutos ?? 0) >= 60 && (no.dados.minutos ?? 0) % 60 === 0; mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, minutos: h ? v * 60 : v } })); }} />
                      <select value={(no.dados.minutos ?? 10) >= 60 && (no.dados.minutos ?? 0) % 60 === 0 ? "h" : "min"} className="h-9 rounded-md border border-white/15 bg-black/20 px-2 text-sm"
                        onChange={(e) => { const atual = no.dados.minutos ?? 10; const emH = atual >= 60 && atual % 60 === 0; const base = emH ? atual / 60 : atual; mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, minutos: e.target.value === "h" ? base * 60 : base } })); }}>
                        <option value="min">minutos</option><option value="h">horas</option></select></div>
                    <span className="text-[11px] text-white/40">De 1 minuto a 24 horas (a janela da Meta fecha em 24 h).</span></label>)}
                {no.tipo === "condicao" && (<>
                  <label className="block space-y-1 text-xs text-white/60">Pergunta do bloco
                    <select value={no.dados.condicao ?? "respondeu"} onChange={(e) => mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, condicao: e.target.value as "respondeu" | "texto_contem" } }))} className="h-9 w-full rounded-md border border-white/15 bg-black/20 px-2 text-sm">
                      <option value="respondeu">A pessoa respondeu desde o início?</option><option value="texto_contem">A última resposta contém a palavra…</option></select></label>
                  {no.dados.condicao === "texto_contem" && <Input value={no.dados.palavra ?? ""} onChange={(e) => mudarNo(no.id, (n) => ({ ...n, dados: { ...n.dados, palavra: e.target.value } }))} placeholder="palavra" className="h-9 border-white/15 bg-black/20" />}
                  <p className="text-[11px] text-white/45">Ligue a saída “Sim” e a saída “Não” aos blocos que seguem.</p></>)}
                {no.tipo === "fim" && <p className="text-xs text-white/55">O fluxo termina aqui para essa pessoa.</p>}
                {(porNo.get(no.id) ?? []).length > 0 && <ul className="space-y-1 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-200">{(porNo.get(no.id) ?? []).map((p, i) => <li key={i}>• {p}</li>)}</ul>}
              </div>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
