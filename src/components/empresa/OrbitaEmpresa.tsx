import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle, BarChart3, CheckCircle2, Crosshair, Factory, HeartPulse, Minus, Plus, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ehCoordenador, tarefaAtrasada, type MembroResumo, type TarefaResumo } from "@/lib/empresa/visaoGeral";
import { PainelAcoes, type AcaoFabrica, type PessoaFabrica } from "./FabricaConteudo";

// Escritório em órbita (04/11, Davi: "um mapa mental vivo da empresa, organizado ao redor do Atlas").
// Atlas no centro → setores ao redor (orbes médios, cor de cada um) → agentes do setor (orbes pequenos com a
// tarefa atual num cartão compacto ao lado). Linhas curvas e luminosas ligam tudo; pacotes de luz correm
// até quem está trabalhando; quem espera o Davi manda uma linha amarela até o Atlas ("Solicita aprovação").
// Canvas com arrastar e zoom (⌘/ctrl + roda ou pinça; roda sozinha arrasta), foco no setor e painel do agente.
// Os dados são os mesmos da fábrica (setores, membros, tarefas, sinais, ações): só muda a visualização.

type Tipo = "audiovisual" | "marketing" | "vendas" | "sac" | "lab" | "diretoria" | "outro";
const tipoDoSetor = (nome: string): Tipo =>
  /diretoria|gest[aã]o|lideran/i.test(nome) ? "diretoria"
    : /audiovisual|v[ií]deo|edi[cç]|est[uú]dio/i.test(nome) ? "audiovisual"
      : /venda|sales|comercial/i.test(nome) ? "vendas"
        : /sucesso|sac|suporte|atendimento|cliente/i.test(nome) ? "sac"
          : /viral|lab/i.test(nome) ? "lab"
            : /marketing|conte[uú]do|copy|tr[aá]fego/i.test(nome) ? "marketing" : "outro";
const COR: Record<Tipo, string> = {
  audiovisual: "#a78bfa", marketing: "#22d3ee", vendas: "#fb923c", sac: "#34d399", lab: "#f472b6", diretoria: "#60a5fa", outro: "#94a3b8",
};

type Estado = "trabalhando" | "livre" | "aguardando" | "bloqueado" | "finalizou";
const ROTULO_ESTADO: Record<Estado, string> = { trabalhando: "Trabalhando", livre: "Livre", aguardando: "Aguardando você", bloqueado: "Bloqueado", finalizou: "Finalizou" };

// Geometria (coordenadas do mundo, Atlas em 0,0).
const R_SETOR = 290;      // Atlas → setor
const R_AGENTE = 158;     // setor → agente
const PASSO = 44;         // graus entre agentes do mesmo setor
const CARTAO = 150;       // largura do cartão da tarefa (ao lado do agente)
const CARTAO_V = 124;     // largura quando fica acima/abaixo (setores em cima e embaixo do Atlas)
const MUNDO = 3200;

const db = supabase as unknown as SupabaseClient;
type Feita = TarefaResumo & { concluida_em?: string | null };
const rad = (g: number) => (g * Math.PI) / 180;
/** Curva suave (mapa mental): quadrática com o meio puxado para o lado. */
function curva(x1: number, y1: number, x2: number, y2: number, torcao = 0.18) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${(mx - dy * torcao).toFixed(1)} ${(my + dx * torcao).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

interface NoAgente {
  pessoa: PessoaFabrica; x: number; y: number; lado: "direita" | "esquerda" | "cima" | "baixo"; estado: Estado;
  tarefa: TarefaResumo | null; fila: TarefaResumo[]; esperando: TarefaResumo[]; feitas: Feita[];
}
interface NoSetor {
  id: string; nome: string; descricao: string | null; tipo: Tipo; cor: string; x: number; y: number;
  abertas: TarefaResumo[]; fazendo: TarefaResumo[]; esperando: TarefaResumo[]; atrasadas: TarefaResumo[]; feitas: Feita[]; agentes: NoAgente[];
}

export function OrbitaEmpresa({ clienteId, setores, membros, tarefas, pessoas, acoes, categorias, rotuloCategoria, hoje, onTarefa, onPessoa, topo }: {
  clienteId: string;
  setores: { id: string; nome: string; descricao: string | null }[];
  membros: MembroResumo[]; tarefas: TarefaResumo[]; pessoas: PessoaFabrica[]; acoes: AcaoFabrica[];
  categorias: string[]; rotuloCategoria: Record<string, string>; hoje: string;
  onTarefa: (t: TarefaResumo) => void; onPessoa: (m: MembroResumo) => void;
  topo?: ReactNode;
}) {
  // Concluídas dos últimos 7 dias (saída, "finalizou", últimas entregas).
  const [feitas, setFeitas] = useState<Feita[]>([]);
  useEffect(() => {
    const desde = new Date(Date.now() - 7 * 86400000).toISOString();
    void db.from("atividades").select("id, titulo, responsavel_id, setor_id, situacao, tipo, data_vencimento, concluida, progresso, concluida_em")
      .eq("cliente_id", clienteId).eq("concluida", true).is("deleted_at", null).gte("concluida_em", desde).order("concluida_em", { ascending: false }).limit(300)
      .then(({ data }) => setFeitas((data ?? []) as Feita[]));
  }, [clienteId, tarefas.length]);

  const abertas = useMemo(() => tarefas.filter((t) => !t.concluida), [tarefas]);
  const atlas = membros.find((m) => ehCoordenador(m)) ?? null;

  // Monta a rede: setores em volta do Atlas, agentes em leque para fora de cada setor.
  const rede = useMemo<NoSetor[]>(() => {
    const setorDoMembro = new Map(membros.map((m) => [m.id, m.setor_id]));
    const setorDa = (t: TarefaResumo) => t.setor_id ?? (t.responsavel_id ? setorDoMembro.get(t.responsavel_id) ?? null : null);
    const visiveis = setores.filter((s) => tipoDoSetor(s.nome) !== "diretoria");
    const n = Math.max(visiveis.length, 1);
    const agora = Date.now();
    return visiveis.map((s, i) => {
      const ang = -90 + (360 / n) * i;
      const x = Math.cos(rad(ang)) * R_SETOR, y = Math.sin(rad(ang)) * R_SETOR;
      const tipo = tipoDoSetor(s.nome);
      const doSetor = abertas.filter((t) => setorDa(t) === s.id);
      const feitasSetor = feitas.filter((t) => setorDa(t) === s.id);
      const equipe = pessoas.filter((p) => p.membro.setor_id === s.id && !ehCoordenador(p.membro));
      // Setor em cima/embaixo do Atlas: os agentes ficam lado a lado, então o cartão vai acima/abaixo deles.
      const vertical = Math.abs(Math.sin(rad(ang))) > 0.7;
      const agentes = equipe.map((p, j): NoAgente => {
        const a = ang + (j - (equipe.length - 1) / 2) * PASSO;
        const ax = x + Math.cos(rad(a)) * R_AGENTE, ay = y + Math.sin(rad(a)) * R_AGENTE;
        const meus = doSetor.filter((t) => t.responsavel_id === p.membro.id);
        const fazendo = meus.filter((t) => t.situacao === "andamento");
        const esperando = meus.filter((t) => t.situacao === "aguardando_aprovacao");
        const fila = meus.filter((t) => t.situacao !== "andamento" && t.situacao !== "aguardando_aprovacao");
        const minhasFeitas = feitasSetor.filter((t) => t.responsavel_id === p.membro.id);
        const acabou = minhasFeitas.some((t) => t.concluida_em && agora - new Date(t.concluida_em).getTime() < 30 * 60000);
        const estado: Estado = p.sinal === "problema" ? "bloqueado" : p.sinal === "esperando" || esperando.length ? "aguardando"
          : p.sinal === "trabalhando" ? "trabalhando" : acabou ? "finalizou" : "livre";
        return { pessoa: p, x: ax, y: ay, lado: vertical ? (y < 0 ? "cima" : "baixo") : ax >= x - 1 ? "direita" : "esquerda", estado, tarefa: fazendo[0] ?? esperando[0] ?? null, fila, esperando, feitas: minhasFeitas };
      });
      return {
        id: s.id, nome: s.nome, descricao: s.descricao, tipo, cor: COR[tipo], x, y,
        abertas: doSetor, fazendo: doSetor.filter((t) => t.situacao === "andamento"), esperando: doSetor.filter((t) => t.situacao === "aguardando_aprovacao"),
        atrasadas: doSetor.filter((t) => tarefaAtrasada(t, hoje)), feitas: feitasSetor, agentes,
      };
    });
  }, [setores, membros, pessoas, abertas, feitas, hoje]);

  // ---- Canvas: arrastar e zoom ----
  const vista = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState({ x: 0, y: 0, k: 0.7 });
  const [suave, setSuave] = useState(false);       // transição ao focar/centralizar
  const camRef = useRef(cam);
  camRef.current = cam;
  const limites = useMemo(() => {
    let x0 = -120, x1 = 120, y0 = -120, y1 = 120;
    for (const s of rede) for (const a of [{ x: s.x, y: s.y, lado: "baixo" as const }, ...s.agentes]) {
      x0 = Math.min(x0, a.x - 40 - (a.lado === "esquerda" ? CARTAO + 30 : a.lado === "direita" ? 0 : CARTAO_V / 2));
      x1 = Math.max(x1, a.x + 40 + (a.lado === "direita" ? CARTAO + 30 : a.lado === "esquerda" ? 0 : CARTAO_V / 2));
      y0 = Math.min(y0, a.y - (a.lado === "cima" ? 90 : 40)); y1 = Math.max(y1, a.y + (a.lado === "baixo" ? 100 : 60));
    }
    return { x0, x1, y0, y1 };
  }, [rede]);
  const enquadrar = useCallback((animar = true) => {
    const el = vista.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const k = Math.min(w / (limites.x1 - limites.x0), h / (limites.y1 - limites.y0), 1.15);
    const cx = (limites.x0 + limites.x1) / 2, cy = (limites.y0 + limites.y1) / 2;
    setSuave(animar);
    setCam({ k, x: w / 2 - cx * k, y: h / 2 - cy * k });
  }, [limites]);
  const enquadrouRef = useRef(false);
  useLayoutEffect(() => {
    if (enquadrouRef.current || rede.length === 0) return;
    enquadrouRef.current = true;
    enquadrar(false);
  }, [rede.length, enquadrar]);
  const irPara = (x: number, y: number, k: number) => {
    const el = vista.current;
    if (!el) return;
    setSuave(true);
    setCam({ k, x: el.clientWidth / 2 - x * k, y: el.clientHeight / 2 - y * k });
  };
  const zoomEm = (fator: number, px?: number, py?: number) => {
    const el = vista.current;
    if (!el) return;
    const c = camRef.current;
    const k = Math.min(2.4, Math.max(0.3, c.k * fator));
    const ox = px ?? el.clientWidth / 2, oy = py ?? el.clientHeight / 2;
    setCam({ k, x: ox - ((ox - c.x) / c.k) * k, y: oy - ((oy - c.y) / c.k) * k });
  };
  useEffect(() => {
    const el = vista.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      setSuave(false);
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomEm(Math.exp(-e.deltaY * 0.0045), e.clientX - r.left, e.clientY - r.top);
      else setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, []);
  const arrasto = useRef<{ x: number; y: number; cx: number; cy: number; moveu: boolean } | null>(null);

  // ---- Foco ----
  const [setorFoco, setSetorFoco] = useState<string | null>(null);
  const [agenteAberto, setAgenteAberto] = useState<string | null>(null);
  const [acaoFoco, setAcaoFoco] = useState<{ setorId: string; agentes: string[] } | null>(null);
  const focarSetor = (s: NoSetor) => {
    setSetorFoco(s.id);
    // Centraliza o setor com os agentes dele.
    const xs = [s.x, ...s.agentes.map((a) => a.x)], ys = [s.y, ...s.agentes.map((a) => a.y)];
    // (um pouco para a direita: o painel do setor ocupa a esquerda)
    irPara((Math.min(...xs) + Math.max(...xs)) / 2 - 110, (Math.min(...ys) + Math.max(...ys)) / 2, 1.25);
  };
  const visaoGeral = () => { setSetorFoco(null); setAcaoFoco(null); setAgenteAberto(null); enquadrar(); };
  const focarAcao = (a: AcaoFabrica) => {
    const s = rede.find((x) => x.id === a.setorId);
    if (!s) { setAcaoFoco(null); return; }
    const ids = new Set<string>();
    for (const t of tarefas) if (a.tarefaIds?.includes(t.id) && t.responsavel_id) ids.add(t.responsavel_id);
    if (a.chave.startsWith("ia-")) ids.add(a.chave.slice(3));
    // Sem tarefa ligada: quem do setor está esperando o Davi.
    if (!ids.size) for (const ag of s.agentes) if (ag.estado === "aguardando") ids.add(ag.pessoa.membro.id);
    setAcaoFoco({ setorId: s.id, agentes: [...ids] });
    focarSetor(s);
  };

  const agenteSel = rede.flatMap((s) => s.agentes.map((a) => ({ a, s }))).find((x) => x.a.pessoa.membro.id === agenteAberto) ?? null;
  const setorSel = rede.find((s) => s.id === setorFoco) ?? null;
  const trabalhando = rede.reduce((n, s) => n + s.agentes.filter((a) => a.estado === "trabalhando").length, 0);
  const totalEsperando = abertas.filter((t) => t.situacao === "aguardando_aprovacao").length;
  const totalAtrasadas = abertas.filter((t) => tarefaAtrasada(t, hoje)).length;
  const hojeFeitas = feitas.filter((t) => (t.concluida_em ?? "").slice(0, 10) === hoje).length;
  const detalhes = cam.k >= 0.55;   // longe demais: só nome + estado

  const indicadores = [
    { rotulo: "Na produção", valor: abertas.filter((t) => t.situacao !== "aguardando_aprovacao").length, Icone: Factory, cor: "text-sky-400 bg-sky-500/15" },
    { rotulo: "Concluídas hoje", valor: hojeFeitas, Icone: CheckCircle2, cor: "text-emerald-400 bg-emerald-500/15" },
    { rotulo: "Aguardando você", valor: acoes.length, Icone: AlertTriangle, cor: "text-amber-400 bg-amber-500/15" },
    { rotulo: "Atrasadas", valor: totalAtrasadas, Icone: AlertTriangle, cor: "text-rose-400 bg-rose-500/15" },
    { rotulo: "Concluídas na semana", valor: feitas.length, Icone: BarChart3, cor: "text-violet-400 bg-violet-500/15" },
  ];

  // Saúde: começa em 100 e perde pelo atraso e pelo que está parado esperando.
  const saude = Math.max(0, Math.round(100 - (abertas.length ? (totalAtrasadas / abertas.length) * 70 : 0) - Math.min(totalEsperando, 10) * 1.5));
  const insights = [
    ...rede.filter((s) => s.feitas.length >= 3).sort((a, b) => b.feitas.length - a.feitas.length).slice(0, 1).map((s) => `${s.nome} avançando bem (${s.feitas.length} entregas na semana)`),
    ...(totalEsperando ? [`${totalEsperando} ${totalEsperando === 1 ? "item aguardando" : "itens aguardando"} sua aprovação`] : []),
    ...(totalAtrasadas ? [`${totalAtrasadas} ${totalAtrasadas === 1 ? "entrega atrasada" : "entregas atrasadas"}`] : []),
    ...rede.flatMap((s) => s.agentes.filter((a) => a.estado === "bloqueado").map((a) => `${a.pessoa.membro.nome} está bloqueado`)).slice(0, 2),
  ];

  return (
    <div className="dark space-y-3 rounded-2xl bg-[#05070d] p-3 text-white">
      <style>{`
        .orb * { transform-box: fill-box; }
        @keyframes orb-pulso { 0%,100% { transform: scale(1) } 50% { transform: scale(1.06) } }
        @keyframes orb-brilho { 0%,100% { opacity: .45 } 50% { opacity: .9 } }
        @keyframes orb-gira { to { transform: rotate(360deg) } }
        @keyframes orb-flutua { 0%,100% { transform: translate(0,0) } 50% { transform: translate(0,-4px) } }
        @keyframes orb-energia { to { stroke-dashoffset: -28 } }
        @keyframes orb-piscar { 0%,95%,100% { transform: scaleY(1) } 97% { transform: scaleY(.1) } }
        @keyframes orb-foco { 0%,100% { opacity: .5 } 50% { opacity: 1 } }
        .orb-pulso { transform-origin: center; animation: orb-pulso 3.2s ease-in-out infinite }
        .orb-brilho { animation: orb-brilho 3.2s ease-in-out infinite }
        .orb-gira { transform-origin: center; animation: orb-gira 26s linear infinite }
        .orb-flutua { animation: orb-flutua 6s ease-in-out infinite }
        .orb-energia { stroke-dasharray: 3 11; animation: orb-energia 1.6s linear infinite }
        .orb-olho { transform-origin: center; animation: orb-piscar 5s infinite }
        @media (prefers-reduced-motion: reduce) { .orb *, .orb { animation: none !important } }
      `}</style>

      {/* Indicadores */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
          {indicadores.map(({ rotulo, valor, Icone, cor }) => (
            <div key={rotulo} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", cor)}><Icone className="h-5 w-5" /></span>
              <div><p className="text-[11px] text-white/55">{rotulo}</p><p className="text-xl font-bold leading-tight tabular-nums">{valor}</p></div>
            </div>
          ))}
        </div>
        {topo}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {/* O mapa */}
          <div ref={vista}
            className="orb relative h-[calc(100svh-250px)] min-h-[560px] cursor-grab touch-none overflow-hidden rounded-2xl border border-white/[0.06] active:cursor-grabbing"
            style={{ background: "radial-gradient(60% 60% at 50% 50%, #0c1424 0%, #06080f 70%), #05070d" }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("[data-no]")) return;
              arrasto.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moveu: false };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setSuave(false);
            }}
            onPointerMove={(e) => {
              const a = arrasto.current;
              if (!a) return;
              if (Math.abs(e.clientX - a.x) + Math.abs(e.clientY - a.y) > 3) a.moveu = true;
              setCam((c) => ({ ...c, x: a.cx + e.clientX - a.x, y: a.cy + e.clientY - a.y }));
            }}
            onPointerUp={() => {
              const a = arrasto.current;
              arrasto.current = null;
              if (a && !a.moveu) { setAgenteAberto(null); }   // clique no vazio fecha o painel do agente
            }}>
            {/* Estrelas de fundo */}
            <div className="pointer-events-none absolute inset-0 opacity-40"
              style={{ backgroundImage: "radial-gradient(1px 1px at 20% 30%, #fff8, transparent), radial-gradient(1px 1px at 70% 60%, #fff6, transparent), radial-gradient(1px 1px at 40% 80%, #fff5, transparent), radial-gradient(1px 1px at 85% 20%, #fff7, transparent), radial-gradient(1px 1px at 10% 70%, #fff5, transparent)" }} />

            <div className="absolute left-0 top-0 h-0 w-0" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`, transformOrigin: "0 0", transition: suave ? "transform .55s cubic-bezier(.2,.7,.2,1)" : undefined }}>
              <svg className="absolute overflow-visible" style={{ left: -MUNDO / 2, top: -MUNDO / 2 }} width={MUNDO} height={MUNDO} viewBox={`${-MUNDO / 2} ${-MUNDO / 2} ${MUNDO} ${MUNDO}`}>
                <defs>
                  <filter id="orb-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="10" /></filter>
                  <filter id="orb-glow-p" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" /></filter>
                  <radialGradient id="orb-esfera" cx="35%" cy="30%" r="75%"><stop offset="0%" stopColor="#1e293b" /><stop offset="60%" stopColor="#0b1220" /><stop offset="100%" stopColor="#020617" /></radialGradient>
                </defs>

                {/* Órbita dos setores */}
                <circle r={R_SETOR} fill="none" stroke="#ffffff" strokeOpacity=".05" strokeDasharray="2 8" />

                {/* Conexões Atlas → setor → agente */}
                {rede.map((s) => {
                  const apagado = !!setorFoco && setorFoco !== s.id;
                  const acesoSetor = acaoFoco?.setorId === s.id;
                  const ativo = s.fazendo.length > 0 || s.agentes.some((a) => a.estado === "trabalhando");
                  const caminho = curva(0, 0, s.x, s.y, 0.12);
                  return (
                    <g key={s.id} opacity={apagado ? 0.18 : 1} style={{ transition: "opacity .4s" }}>
                      <path d={caminho} stroke={s.cor} strokeOpacity={acesoSetor ? 0.9 : 0.35} strokeWidth={acesoSetor ? 3 : 1.6} fill="none" filter={acesoSetor ? "url(#orb-glow-p)" : undefined} />
                      <path id={`orb-l-${s.id}`} d={caminho} stroke={s.cor} strokeWidth="1.4" fill="none" className={ativo ? "orb-energia" : undefined} strokeOpacity={ativo ? 0.9 : 0.25} />
                      {ativo && <circle r="3.5" fill={s.cor}><animateMotion dur="3.4s" repeatCount="indefinite"><mpath href={`#orb-l-${s.id}`} /></animateMotion></circle>}
                      {s.agentes.map((a) => {
                        const id = `orb-a-${a.pessoa.membro.id}`;
                        const d = curva(s.x, s.y, a.x, a.y, 0.2);
                        const aceso = acesoSetor && acaoFoco!.agentes.includes(a.pessoa.membro.id);
                        return (
                          <g key={id}>
                            <path id={id} d={d} stroke={s.cor} strokeOpacity={aceso ? 1 : a.estado === "livre" ? 0.2 : 0.55} strokeWidth={aceso ? 3 : 1.3} fill="none"
                              className={a.estado === "trabalhando" ? "orb-energia" : undefined} />
                            {a.estado === "trabalhando" && <circle r="2.8" fill="#fff"><animateMotion dur="2.6s" repeatCount="indefinite"><mpath href={`#${id}`} /></animateMotion></circle>}
                            {/* Pedido de aprovação: linha temporária até o Atlas */}
                            {a.esperando.length > 0 && (
                              <>
                                <path id={`${id}-ap`} d={curva(a.x, a.y, 0, 0, -0.25)} stroke="#fbbf24" strokeOpacity={aceso ? 0.95 : 0.4} strokeWidth={aceso ? 2.4 : 1.2} fill="none" strokeDasharray="5 7" />
                                <rect width="7" height="7" x="-3.5" y="-3.5" rx="1.5" fill="#fbbf24"><animateMotion dur="4.5s" repeatCount="indefinite"><mpath href={`#${id}-ap`} /></animateMotion></rect>
                              </>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* Atlas */}
                <g className="orb-flutua">
                  <circle r="78" fill="#22d3ee" opacity=".18" filter="url(#orb-glow)" className="orb-brilho" />
                  <g className="orb-gira"><ellipse rx="92" ry="26" fill="none" stroke="#a78bfa" strokeOpacity=".45" strokeWidth="1.4" transform="rotate(-18)" />
                    <circle cx="88" cy="-20" r="3" fill="#a78bfa" /></g>
                  <g className="orb-pulso">
                    <circle r="58" fill="url(#orb-esfera)" stroke="#22d3ee" strokeWidth="2" />
                    <circle r="58" fill="none" stroke="#a78bfa" strokeOpacity=".35" strokeWidth="6" />
                    <g className="orb-olho"><rect x="-21" y="-14" width="12" height="22" rx="6" fill="#67e8f9" /><rect x="9" y="-14" width="12" height="22" rx="6" fill="#67e8f9" /></g>
                  </g>
                  {[0, 72, 144, 216, 288].map((g) => (
                    <circle key={g} cx={Math.cos(rad(g)) * 74} cy={Math.sin(rad(g)) * 74} r="1.6" fill="#a5f3fc" className="orb-brilho" style={{ animationDelay: `${g * 8}ms` }} />
                  ))}
                </g>

                {/* Setores */}
                {rede.map((s, i) => {
                  const apagado = !!setorFoco && setorFoco !== s.id;
                  const aceso = acaoFoco?.setorId === s.id || setorFoco === s.id;
                  return (
                    <g key={s.id} data-no="" opacity={apagado ? 0.25 : 1} style={{ transition: "opacity .4s", cursor: "pointer" }}
                      onClick={() => (setorFoco === s.id ? visaoGeral() : focarSetor(s))}>
                      <g transform={`translate(${s.x} ${s.y})`}>
                        <g className="orb-flutua" style={{ animationDelay: `${-i * 1.3}s` }}>
                          <circle r="44" fill={s.cor} opacity={aceso ? 0.4 : 0.18} filter="url(#orb-glow)" />
                          <circle r="34" fill="url(#orb-esfera)" stroke={s.cor} strokeWidth={aceso ? 3 : 1.8} />
                          {s.esperando.length > 0 && <circle r="40" fill="none" stroke="#fbbf24" strokeWidth="1.6" strokeDasharray="4 5" className="orb-gira" />}
                          <text textAnchor="middle" y="-2" fontSize="15" fontWeight="700" fill="#fff">{s.abertas.length}</text>
                          <text textAnchor="middle" y="12" fontSize="7.5" fill="#ffffff99">itens</text>
                        </g>
                      </g>
                    </g>
                  );
                })}

                {/* Agentes */}
                {rede.map((s) => s.agentes.map((a) => {
                  const apagado = !!setorFoco && setorFoco !== s.id;
                  const aceso = (acaoFoco?.setorId === s.id && acaoFoco.agentes.includes(a.pessoa.membro.id)) || agenteAberto === a.pessoa.membro.id;
                  const anel = a.estado === "aguardando" ? "#fbbf24" : a.estado === "bloqueado" ? "#f43f5e" : a.estado === "finalizou" ? "#34d399" : s.cor;
                  const livre = a.estado === "livre";
                  return (
                    <g key={a.pessoa.membro.id} data-no="" transform={`translate(${a.x} ${a.y})`} opacity={apagado ? 0.25 : 1}
                      style={{ transition: "opacity .4s", cursor: "pointer" }} onClick={() => setAgenteAberto(a.pessoa.membro.id)}>
                      {aceso && <circle r="30" fill="none" stroke="#67e8f9" strokeWidth="2" style={{ animation: "orb-foco 1.2s ease-in-out infinite" }} />}
                      {!livre && <circle r="24" fill={anel} opacity=".3" filter="url(#orb-glow-p)" className={a.estado === "trabalhando" || a.estado === "finalizou" ? "orb-brilho" : undefined} />}
                      <g className={a.estado === "trabalhando" ? "orb-pulso" : undefined}>
                        <circle r="17" fill="url(#orb-esfera)" stroke={anel} strokeOpacity={livre ? 0.4 : 1} strokeWidth={a.estado === "aguardando" || a.estado === "bloqueado" ? 2.6 : 1.6} />
                        <g className="orb-olho" opacity={livre ? 0.45 : 1}>
                          <rect x="-6.5" y="-5" width="4.2" height="8" rx="2.1" fill={livre ? "#94a3b8" : s.cor} />
                          <rect x="2.3" y="-5" width="4.2" height="8" rx="2.1" fill={livre ? "#94a3b8" : s.cor} />
                        </g>
                      </g>
                      {a.estado === "bloqueado" && <g transform="translate(13 -14)"><circle r="6" fill="#f43f5e" /><text textAnchor="middle" y="3.5" fontSize="9" fontWeight="900" fill="#fff">!</text></g>}
                      {a.estado === "aguardando" && <g transform="translate(13 -14)"><circle r="6" fill="#fbbf24" /><text textAnchor="middle" y="3.5" fontSize="9" fontWeight="900" fill="#000">!</text></g>}
                      {a.estado === "finalizou" && <g transform="translate(13 -14)"><circle r="6" fill="#34d399" /><path d="M-2.6 0 l1.8 1.9 l3.4 -3.6" stroke="#04210f" strokeWidth="1.6" fill="none" /></g>}
                    </g>
                  );
                }))}
              </svg>

              {/* Textos (HTML por cima do SVG, nas mesmas coordenadas) */}
              <div className="pointer-events-none absolute left-0 top-0 text-center" style={{ transform: "translate(-50%, 70px)", width: 220 }}>
                <p className="text-base font-bold tracking-wide">{atlas?.nome ?? "Atlas"}</p>
                <p className="text-[10px] text-white/55">Orquestrador da operação</p>
                <p className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" style={{ animation: "orb-brilho 1.6s infinite" }} />
                  {trabalhando ? `Coordenando ${trabalhando} ${trabalhando === 1 ? "agente" : "agentes"}` : acoes.length ? "Analisando" : "Ativo"}
                </p>
              </div>
              {rede.map((s) => {
                const apagado = !!setorFoco && setorFoco !== s.id;
                const status = s.esperando.length ? "Aguardando você" : s.fazendo.length || s.agentes.some((a) => a.estado === "trabalhando") ? "Em execução" : "Parado";
                return (
                  <div key={s.id} className="pointer-events-none absolute left-0 top-0 text-center" style={{ transform: `translate(${s.x - 80}px, ${s.y + 46}px)`, width: 160, opacity: apagado ? 0.25 : 1, transition: "opacity .4s" }}>
                    <p className="text-[15px] font-bold" style={{ color: s.cor }}>{s.nome}</p>
                    {detalhes && (
                      <p className="text-[10px] text-white/55">
                        {s.agentes.filter((a) => a.estado === "trabalhando").length} em foco · <span className={s.esperando.length ? "text-amber-300" : undefined}>{status}</span>
                      </p>
                    )}
                  </div>
                );
              })}
              {rede.map((s) => s.agentes.map((a) => {
                const apagado = !!setorFoco && setorFoco !== s.id;
                const m = a.pessoa.membro;
                const texto = a.tarefa?.titulo ?? a.pessoa.atual ?? null;
                const prog = a.tarefa?.progresso ?? null;
                return (
                  <div key={m.id} className="pointer-events-none absolute left-0 top-0" style={{ opacity: apagado ? 0.2 : 1, transition: "opacity .4s" }}>
                    <p className="absolute w-24 truncate text-center text-xs font-semibold" style={{ transform: `translate(${a.x - 48}px, ${a.y + 20}px)` }}>{m.nome}</p>
                    {detalhes && (
                      <div className={cn("absolute rounded-lg border bg-[#0b1220]/90 px-2 py-1 shadow-lg backdrop-blur",
                        a.estado === "aguardando" ? "border-amber-400/40" : a.estado === "bloqueado" ? "border-rose-500/40" : "border-white/10")}
                        style={a.lado === "direita" || a.lado === "esquerda"
                          ? { width: CARTAO, transform: `translate(${a.lado === "direita" ? a.x + 26 : a.x - 26 - CARTAO}px, ${a.y - 20}px)` }
                          : { width: CARTAO_V, transform: `translate(${a.x - CARTAO_V / 2}px, ${a.lado === "cima" ? a.y - 24 : a.y + 36}px) translateY(${a.lado === "cima" ? "-100%" : "0"})` }}>
                        <p className={cn("text-[9px] font-semibold uppercase tracking-wide",
                          a.estado === "aguardando" ? "text-amber-300" : a.estado === "bloqueado" ? "text-rose-300" : a.estado === "livre" ? "text-white/40" : "")}
                          style={a.estado === "trabalhando" || a.estado === "finalizou" ? { color: a.estado === "finalizou" ? "#34d399" : s.cor } : undefined}>
                          {ROTULO_ESTADO[a.estado]}
                        </p>
                        <p className="truncate text-[11.5px] leading-tight text-white/90">{texto ?? (a.fila.length ? `${a.fila.length} na fila` : "Sem tarefa")}</p>
                        {prog != null && prog > 0 && (
                          <div className="mt-0.5 flex items-center gap-1">
                            <span className="h-0.5 flex-1 overflow-hidden rounded bg-white/10"><span className="block h-full" style={{ width: `${prog}%`, background: s.cor }} /></span>
                            <span className="text-[9px] tabular-nums text-white/60">{prog}%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }))}
            </div>

            {/* Controles do mapa */}
            <div data-no="" className="absolute bottom-3 left-3 flex items-center gap-1 rounded-xl border border-white/10 bg-black/60 p-1 backdrop-blur">
              <button type="button" onClick={() => { setSuave(true); zoomEm(1.25); }} className="rounded-lg p-1.5 hover:bg-white/10" title="Aproximar"><Plus className="h-4 w-4" /></button>
              <button type="button" onClick={() => { setSuave(true); zoomEm(0.8); }} className="rounded-lg p-1.5 hover:bg-white/10" title="Afastar"><Minus className="h-4 w-4" /></button>
              <button type="button" onClick={() => irPara(0, 0, Math.max(cam.k, 0.9))} className="rounded-lg p-1.5 hover:bg-white/10" title="Centralizar o Atlas"><Crosshair className="h-4 w-4" /></button>
              <button type="button" onClick={visaoGeral} className="rounded-lg px-2 py-1 text-xs hover:bg-white/10">Visão geral</button>
              <span className="px-1.5 text-[10px] tabular-nums text-white/45">{Math.round(cam.k * 100)}%</span>
            </div>
            <p className="pointer-events-none absolute bottom-3 right-3 hidden text-[10px] text-white/35 md:block">arraste para mover · ⌘ + roda (ou pinça) para zoom · clique num setor para focar</p>

            {/* Foco no setor: filas, bloqueios e últimas entregas */}
            {setorSel && !agenteSel && (
              <div data-no="" className="absolute left-3 top-3 w-64 rounded-2xl border bg-[#0a0f1a]/95 p-3 shadow-2xl backdrop-blur" style={{ borderColor: `${setorSel.cor}55` }}>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: setorSel.cor }} />
                  <p className="flex-1 font-bold">{setorSel.nome}</p>
                  <button type="button" onClick={visaoGeral} className="rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
                </div>
                {setorSel.descricao && <p className="mt-0.5 text-[11px] text-white/50">{setorSel.descricao}</p>}
                <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
                  <span className="rounded-lg bg-white/5 py-1"><b className="block text-sm">{setorSel.abertas.length - setorSel.esperando.length}</b>na fila/fazendo</span>
                  <span className="rounded-lg bg-amber-400/10 py-1 text-amber-200"><b className="block text-sm">{setorSel.esperando.length}</b>aguardando</span>
                  <span className="rounded-lg bg-rose-500/10 py-1 text-rose-200"><b className="block text-sm">{setorSel.atrasadas.length}</b>atrasadas</span>
                </div>
                <ListaTarefas titulo="Aguardando você" itens={setorSel.esperando} onTarefa={onTarefa} />
                <ListaTarefas titulo="Bloqueios e atrasos" itens={setorSel.atrasadas} onTarefa={onTarefa} />
                <ListaTarefas titulo="Fila" itens={setorSel.abertas.filter((t) => t.situacao !== "andamento" && t.situacao !== "aguardando_aprovacao")} onTarefa={onTarefa} />
                <ListaTarefas titulo="Últimas entregas" itens={setorSel.feitas} onTarefa={onTarefa} />
              </div>
            )}

            {/* Painel do agente */}
            {agenteSel && (
              <div data-no="" className="absolute right-3 top-3 w-72 rounded-2xl border bg-[#0a0f1a]/95 p-3 shadow-2xl backdrop-blur" style={{ borderColor: `${agenteSel.s.cor}55` }}>
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-3 w-3 rounded-full" style={{ background: agenteSel.s.cor, boxShadow: `0 0 10px ${agenteSel.s.cor}` }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{agenteSel.a.pessoa.membro.nome}</p>
                    <p className="text-[11px] text-white/55">{agenteSel.a.pessoa.membro.funcao ?? "Agente"} · {agenteSel.s.nome}</p>
                  </div>
                  <button type="button" onClick={() => setAgenteAberto(null)} className="rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
                </div>
                <div className="mt-2 rounded-xl bg-white/5 p-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Agora · {ROTULO_ESTADO[agenteSel.a.estado]}</p>
                  {agenteSel.a.tarefa ? (
                    <button type="button" onClick={() => onTarefa(agenteSel.a.tarefa!)} className="mt-0.5 block w-full text-left text-sm hover:underline">{agenteSel.a.tarefa.titulo}</button>
                  ) : <p className="mt-0.5 text-sm text-white/70">{agenteSel.a.pessoa.atual ?? "Livre"}</p>}
                  {(agenteSel.a.tarefa?.progresso ?? 0) > 0 && (
                    <div className="mt-1 flex items-center gap-2"><span className="h-1 flex-1 overflow-hidden rounded bg-white/10"><span className="block h-full" style={{ width: `${agenteSel.a.tarefa!.progresso}%`, background: agenteSel.s.cor }} /></span>
                      <span className="text-[11px] tabular-nums">{agenteSel.a.tarefa!.progresso}%</span></div>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-center text-[11px]">
                  <span className="rounded-lg bg-white/5 py-1"><b className="block text-base">{agenteSel.a.fila.length}</b>na fila</span>
                  <span className="rounded-lg bg-amber-400/10 py-1 text-amber-200"><b className="block text-base">{agenteSel.a.esperando.length}</b>aguardando aprovação</span>
                </div>
                <ListaTarefas titulo="Fila" itens={agenteSel.a.fila} onTarefa={onTarefa} />
                <ListaTarefas titulo="Aguardando aprovação" itens={agenteSel.a.esperando} onTarefa={onTarefa} />
                <ListaTarefas titulo="Últimas entregas" itens={agenteSel.a.feitas} onTarefa={onTarefa} />
                <button type="button" onClick={() => onPessoa(agenteSel.a.pessoa.membro)}
                  className="mt-3 w-full rounded-lg py-1.5 text-sm font-semibold text-black" style={{ background: agenteSel.s.cor }}>
                  {agenteSel.a.pessoa.membro.eh_ia ? "Conversar" : "Abrir fila"}
                </button>
              </div>
            )}
          </div>

          {/* Fluxo geral e saúde (secundários) */}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="rounded-2xl bg-white/[0.03] p-3">
              <p className="mb-2 text-xs font-semibold text-white/60">Fluxo geral da operação</p>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {[
                  ["Na fila", abertas.filter((t) => t.situacao !== "andamento" && t.situacao !== "aguardando_aprovacao").length, "text-white"],
                  ["Em produção", abertas.filter((t) => t.situacao === "andamento").length, "text-sky-300"],
                  ["Aprovação", totalEsperando, "text-amber-300"],
                  ["Concluído (7 dias)", feitas.length, "text-emerald-300"],
                ].map(([r, n, c], i) => (
                  <span key={r as string} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-white/30">→</span>}
                    <span className="rounded-lg bg-white/5 px-2.5 py-1">{r} <b className={cn("tabular-nums", c as string)}>{n}</b></span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-3 rounded-2xl bg-white/[0.03] p-3">
              <div className="text-center">
                <HeartPulse className={cn("mx-auto h-5 w-5", saude >= 75 ? "text-emerald-400" : saude >= 50 ? "text-amber-400" : "text-rose-400")} />
                <p className="text-xl font-bold tabular-nums">{saude}%</p>
                <p className="text-[10px] text-white/55">{saude >= 75 ? "Saudável" : saude >= 50 ? "Atenção" : "Crítica"}</p>
              </div>
              <ul className="min-w-0 flex-1 space-y-0.5 text-[11px] text-white/70">
                <li className="text-xs font-semibold text-white/60">Saúde da operação</li>
                {insights.length ? insights.slice(0, 4).map((x) => <li key={x} className="truncate">• {x}</li>) : <li>• Tudo em dia</li>}
              </ul>
            </div>
          </div>
        </div>

        <PainelAcoes acoes={acoes} categorias={categorias} rotuloCategoria={rotuloCategoria} onFocar={focarAcao} />
      </div>
    </div>
  );
}

function ListaTarefas({ titulo, itens, onTarefa }: { titulo: string; itens: TarefaResumo[]; onTarefa: (t: TarefaResumo) => void }) {
  if (!itens.length) return null;
  return (
    <div className="mt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">{titulo} · {itens.length}</p>
      <div className="mt-0.5 max-h-28 space-y-0.5 overflow-y-auto">
        {itens.slice(0, 12).map((t) => (
          <button key={t.id} type="button" onClick={() => onTarefa(t)} className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] text-white/80 hover:bg-white/10">{t.titulo}</button>
        ))}
      </div>
    </div>
  );
}
