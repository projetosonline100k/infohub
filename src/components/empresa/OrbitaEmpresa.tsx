import { isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, ClipboardList, Crosshair, Factory, FlaskConical, Hand,
  Headphones, HeartPulse, Hourglass, Layers, LayoutGrid, Megaphone, Minus, Play, Plus, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ehCoordenador, tarefaAtrasada, type MembroResumo, type TarefaResumo } from "@/lib/empresa/visaoGeral";
import type { AcaoFabrica, PessoaFabrica } from "./FabricaConteudo";

// Escritório em órbita (04/11, Davi: "um mapa mental operacional vivo").
// Atlas no centro → setores dos dois lados (orbe médio, ícone e nome dentro) → agentes em coluna do lado de fora
// (orbe pequeno colorido pelo estado, nome e uma etiqueta curta com o que está fazendo). "Minhas decisões" é um
// cartão preso ao Atlas (sem painel lateral): clicar numa decisão foca o setor e o agente, acende a conexão e
// abre a ação. Tudo arrastável (o setor leva os agentes junto), posições salvas neste aparelho, por projeto;
// "Organizar automaticamente" volta ao arranjo padrão. Os dados são os mesmos de antes: só muda a visualização.
// Para crescer depois (conexão manual, pacote viajando entre agentes): as linhas são desenhadas a partir da
// rede (rede → setores → agentes); basta somar uma lista de ligações agente → agente.

type Tipo = "audiovisual" | "marketing" | "vendas" | "sac" | "lab" | "diretoria" | "outro";
const tipoDoSetor = (nome: string): Tipo =>
  /diretoria|gest[aã]o|lideran/i.test(nome) ? "diretoria"
    : /audiovisual|v[ií]deo|edi[cç]|est[uú]dio/i.test(nome) ? "audiovisual"
      : /venda|sales|comercial/i.test(nome) ? "vendas"
        : /sucesso|sac|suporte|atendimento|cliente/i.test(nome) ? "sac"
          : /viral|lab/i.test(nome) ? "lab"
            : /marketing|conte[uú]do|copy|tr[aá]fego/i.test(nome) ? "marketing" : "outro";
const COR: Record<Tipo, string> = {
  audiovisual: "#a78bfa", marketing: "#38bdf8", vendas: "#c084fc", sac: "#2dd4bf", lab: "#f472b6", diretoria: "#60a5fa", outro: "#94a3b8",
};
const ICONE: Record<Tipo, ComponentType<{ className?: string }>> = {
  audiovisual: Play, marketing: Megaphone, vendas: BarChart3, sac: Headphones, lab: FlaskConical, diretoria: Layers, outro: Layers,
};

type Estado = "trabalhando" | "livre" | "aguardando" | "bloqueado" | "finalizou";
const ESTADO: Record<Estado, { rotulo: string; cor: string; Icone: ComponentType<{ className?: string; style?: CSSProperties }> }> = {
  trabalhando: { rotulo: "Em execução", cor: "#34d399", Icone: Play },
  aguardando: { rotulo: "Aguardando você", cor: "#fbbf24", Icone: Hourglass },
  livre: { rotulo: "Livre", cor: "#22d3ee", Icone: CircleDashed },
  bloqueado: { rotulo: "Bloqueado", cor: "#f43f5e", Icone: AlertTriangle },
  finalizou: { rotulo: "Concluído", cor: "#34d399", Icone: CheckCircle2 },
};

// Geometria (mundo; Atlas em 0,0).
const R_ATLAS = 96;
const R_SETOR = 54;
const R_AGENTE = 17;
const TEXTO = 168;        // largura do bloco nome + etiqueta do agente
const LINHA = 74;         // distância vertical entre agentes do mesmo setor
const MUNDO = 4000;
const DECISOES_W = 270;

const db = supabase as unknown as SupabaseClient;
type Feita = TarefaResumo & { concluida_em?: string | null };
type Ponto = { x: number; y: number };
const curva = (a: Ponto, b: Ponto) => {
  const dx = (b.x - a.x) * 0.5;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} C${(a.x + dx).toFixed(1)} ${a.y.toFixed(1)} ${(b.x - dx).toFixed(1)} ${b.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
};

interface NoAgente {
  pessoa: PessoaFabrica; x: number; y: number; esquerda: boolean; estado: Estado;
  tarefa: TarefaResumo | null; fila: TarefaResumo[]; esperando: TarefaResumo[]; feitas: Feita[];
}
interface NoSetor {
  id: string; nome: string; descricao: string | null; tipo: Tipo; cor: string; x: number; y: number; esquerda: boolean;
  abertas: TarefaResumo[]; fazendo: TarefaResumo[]; esperando: TarefaResumo[]; atrasadas: TarefaResumo[]; feitas: Feita[]; agentes: NoAgente[];
}
type Deslocamentos = Record<string, Ponto>;   // "s:<id>" setor, "a:<id>" agente, "decisoes"

export function OrbitaEmpresa({ clienteId, setores, membros, tarefas, pessoas, acoes, hoje, onTarefa, onPessoa, topo }: {
  clienteId: string;
  setores: { id: string; nome: string; descricao: string | null }[];
  membros: MembroResumo[]; tarefas: TarefaResumo[]; pessoas: PessoaFabrica[]; acoes: AcaoFabrica[];
  categorias?: string[]; rotuloCategoria?: Record<string, string>; hoje: string;
  onTarefa: (t: TarefaResumo) => void; onPessoa: (m: MembroResumo) => void;
  topo?: ReactNode;
}) {
  // Concluídas dos últimos 7 dias ("concluído", últimas entregas, indicadores).
  const [feitas, setFeitas] = useState<Feita[]>([]);
  useEffect(() => {
    const desde = new Date(Date.now() - 7 * 86400000).toISOString();
    void db.from("atividades").select("id, titulo, responsavel_id, setor_id, situacao, tipo, data_vencimento, concluida, progresso, concluida_em")
      .eq("cliente_id", clienteId).eq("concluida", true).is("deleted_at", null).gte("concluida_em", desde).order("concluida_em", { ascending: false }).limit(300)
      .then(({ data }) => setFeitas((data ?? []) as Feita[]));
  }, [clienteId, tarefas.length]);

  // Posições arrastadas pelo Davi (salvas neste aparelho, por projeto).
  const chaveLayout = `orbita:layout:${clienteId}`;
  const [desloc, setDesloc] = useState<Deslocamentos>(() => {
    try { return JSON.parse(localStorage.getItem(chaveLayout) ?? "{}") as Deslocamentos; } catch { return {}; }
  });
  const deslocRef = useRef(desloc);
  deslocRef.current = desloc;
  const salvarLayout = (x: Deslocamentos) => { try { localStorage.setItem(chaveLayout, JSON.stringify(x)); } catch { /* sem storage */ } };
  const d = (k: string): Ponto => desloc[k] ?? { x: 0, y: 0 };

  const abertas = useMemo(() => tarefas.filter((t) => !t.concluida), [tarefas]);
  const atlas = membros.find((m) => ehCoordenador(m)) ?? null;

  // Arranjo automático: setores dos dois lados do Atlas, agentes em coluna do lado de fora.
  const rede = useMemo<NoSetor[]>(() => {
    const setorDoMembro = new Map(membros.map((m) => [m.id, m.setor_id]));
    const setorDa = (t: TarefaResumo) => t.setor_id ?? (t.responsavel_id ? setorDoMembro.get(t.responsavel_id) ?? null : null);
    const pega = (k: string): Ponto => desloc[k] ?? { x: 0, y: 0 };
    const visiveis = setores.filter((s) => tipoDoSetor(s.nome) !== "diretoria");
    const esq = visiveis.filter((_, i) => i % 2 === 0), dir = visiveis.filter((_, i) => i % 2 === 1);
    const lugar = new Map<string, Ponto & { esquerda: boolean }>();
    for (const [grupo, lado] of [[esq, -1], [dir, 1]] as const) {
      const m = grupo.length;
      const passo = m <= 2 ? 440 : 290;
      grupo.forEach((s, i) => {
        const y = (i - (m - 1) / 2) * passo;
        const x = lado * 420 * Math.sqrt(Math.max(0.35, 1 - (y / 560) ** 2));
        lugar.set(s.id, { x, y, esquerda: lado < 0 });
      });
    }
    const agora = Date.now();
    return visiveis.map((s) => {
      const base = lugar.get(s.id)!;
      const ds = pega(`s:${s.id}`);
      const x = base.x + ds.x, y = base.y + ds.y;
      const tipo = tipoDoSetor(s.nome);
      const doSetor = abertas.filter((t) => setorDa(t) === s.id);
      const feitasSetor = feitas.filter((t) => setorDa(t) === s.id);
      const equipe = pessoas.filter((p) => p.membro.setor_id === s.id && !ehCoordenador(p.membro));
      const agentes = equipe.map((p, j): NoAgente => {
        const da = pega(`a:${p.membro.id}`);
        const ax = (base.esquerda ? x - R_SETOR - 70 - TEXTO - 24 : x + R_SETOR + 90) + da.x;
        const ay = y + (j - (equipe.length - 1) / 2) * LINHA + da.y;
        const meus = doSetor.filter((t) => t.responsavel_id === p.membro.id);
        const fazendo = meus.filter((t) => t.situacao === "andamento");
        const esperando = meus.filter((t) => t.situacao === "aguardando_aprovacao");
        const fila = meus.filter((t) => t.situacao !== "andamento" && t.situacao !== "aguardando_aprovacao");
        const minhasFeitas = feitasSetor.filter((t) => t.responsavel_id === p.membro.id);
        const acabou = minhasFeitas.some((t) => t.concluida_em && agora - new Date(t.concluida_em).getTime() < 30 * 60000);
        const estado: Estado = p.sinal === "problema" ? "bloqueado" : p.sinal === "esperando" || esperando.length ? "aguardando"
          : p.sinal === "trabalhando" ? "trabalhando" : acabou ? "finalizou" : "livre";
        return { pessoa: p, x: ax, y: ay, esquerda: base.esquerda, estado, tarefa: fazendo[0] ?? esperando[0] ?? null, fila, esperando, feitas: minhasFeitas };
      });
      return {
        id: s.id, nome: s.nome, descricao: s.descricao, tipo, cor: COR[tipo], x, y, esquerda: base.esquerda,
        abertas: doSetor, fazendo: doSetor.filter((t) => t.situacao === "andamento"), esperando: doSetor.filter((t) => t.situacao === "aguardando_aprovacao"),
        atrasadas: doSetor.filter((t) => tarefaAtrasada(t, hoje)), feitas: feitasSetor, agentes,
      };
    });
  }, [setores, membros, pessoas, abertas, feitas, hoje, desloc]);

  // Cartão "Minhas decisões": à direita do Atlas (arrastável).
  const posDecisoes = { x: R_ATLAS + 50 + d("decisoes").x, y: -70 + d("decisoes").y };

  // ---- Câmera: arrastar o fundo e zoom ----
  const vista = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState({ x: 0, y: 0, k: 0.75 });
  const [suave, setSuave] = useState(false);
  const camRef = useRef(cam);
  camRef.current = cam;
  const limites = useMemo(() => {
    let x0 = -R_ATLAS - 20, x1 = posDecisoes.x + DECISOES_W + 20, y0 = -R_ATLAS - 20, y1 = R_ATLAS + 60;
    for (const s of rede) {
      x0 = Math.min(x0, s.x - R_SETOR - 20); x1 = Math.max(x1, s.x + R_SETOR + 20);
      y0 = Math.min(y0, s.y - R_SETOR - 20); y1 = Math.max(y1, s.y + R_SETOR + 30);
      for (const a of s.agentes) {
        x0 = Math.min(x0, a.x - 30); x1 = Math.max(x1, a.x + 26 + TEXTO + 10);
        y0 = Math.min(y0, a.y - 40); y1 = Math.max(y1, a.y + 40);
      }
    }
    return { x0, x1, y0, y1 };
  }, [rede, posDecisoes.x]);
  const enquadrar = useCallback((animar = true) => {
    const el = vista.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const k = Math.min((w - 60) / (limites.x1 - limites.x0), (h - 90) / (limites.y1 - limites.y0), 1.1);
    const cx = (limites.x0 + limites.x1) / 2, cy = (limites.y0 + limites.y1) / 2;
    setSuave(animar);
    setCam({ k, x: w / 2 - cx * k, y: (h - 30) / 2 - cy * k });
  }, [limites]);
  const enquadrou = useRef(false);
  useLayoutEffect(() => {
    if (enquadrou.current || rede.length === 0) return;
    enquadrou.current = true;
    enquadrar(false);
  }, [rede.length, enquadrar]);
  const irPara = (x: number, y: number, k: number) => {
    const el = vista.current;
    if (!el) return;
    setSuave(true);
    setCam({ k, x: el.clientWidth / 2 - x * k, y: el.clientHeight / 2 - y * k });
  };
  const zoomEm = useCallback((fator: number, px?: number, py?: number) => {
    const el = vista.current;
    if (!el) return;
    const c = camRef.current;
    const k = Math.min(2.4, Math.max(0.25, c.k * fator));
    const ox = px ?? el.clientWidth / 2, oy = py ?? el.clientHeight / 2;
    setCam({ k, x: ox - ((ox - c.x) / c.k) * k, y: oy - ((oy - c.y) / c.k) * k });
  }, []);
  useEffect(() => {
    const el = vista.current;
    if (!el) return;
    // Pinça do trackpad / ⌘ + roda = zoom; rolar com dois dedos = mover o mapa.
    const roda = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("[data-rolavel]")) return;
      e.preventDefault();
      setSuave(false);
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomEm(Math.exp(-e.deltaY * 0.0045), e.clientX - r.left, e.clientY - r.top);
      else setCam((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }));
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, [zoomEm]);

  // ---- Foco ----
  const [setorFoco, setSetorFoco] = useState<string | null>(null);
  const [agenteAberto, setAgenteAberto] = useState<string | null>(null);
  const [acaoFoco, setAcaoFoco] = useState<{ setorId: string; agentes: string[] } | null>(null);
  const [decisoesAbertas, setDecisoesAbertas] = useState(true);
  const [todasDecisoes, setTodasDecisoes] = useState(false);
  const focarSetor = (s: NoSetor) => {
    setSetorFoco(s.id);
    const xs = [s.x - R_SETOR, s.x + R_SETOR, ...s.agentes.flatMap((a) => [a.x - 20, a.x + 26 + TEXTO])];
    const ys = [s.y - R_SETOR, s.y + R_SETOR, ...s.agentes.map((a) => a.y)];
    const el = vista.current;
    const k = el ? Math.min(1.5, (el.clientWidth - 80) / (Math.max(...xs) - Math.min(...xs)), (el.clientHeight - 120) / (Math.max(...ys) - Math.min(...ys) + 80)) : 1.2;
    irPara((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, k);
  };
  const visaoGeral = () => { setSetorFoco(null); setAcaoFoco(null); setAgenteAberto(null); enquadrar(); };
  const organizar = () => {
    setDesloc({}); salvarLayout({}); setSetorFoco(null); setAcaoFoco(null); setAgenteAberto(null);
    window.setTimeout(() => enquadrar(), 30);
  };
  const focarAcao = (a: AcaoFabrica) => {
    const s = rede.find((x) => x.id === a.setorId);
    if (!s) { setAcaoFoco(null); return; }
    const ids = new Set<string>();
    for (const t of tarefas) if (a.tarefaIds?.includes(t.id) && t.responsavel_id) ids.add(t.responsavel_id);
    if (a.chave.startsWith("ia-")) ids.add(a.chave.slice(3));
    if (!ids.size) for (const ag of s.agentes) if (ag.estado === "aguardando") ids.add(ag.pessoa.membro.id);
    setAcaoFoco({ setorId: s.id, agentes: [...ids] });
    setSetorFoco(s.id);
    const alvo = s.agentes.find((ag) => ids.has(ag.pessoa.membro.id));
    if (alvo) irPara(alvo.x + 80, alvo.y, 1.35); else focarSetor(s);
  };

  // ---- Arrastar: fundo move a câmera; setor (leva os agentes), agente e cartão mudam de lugar ----
  const arrasto = useRef<{ chave: string | null; x: number; y: number; ox: number; oy: number; moveu: boolean; clique?: () => void } | null>(null);
  const comecarNo = (e: React.PointerEvent, chave: string, clique?: () => void) => {
    e.stopPropagation();
    const o = deslocRef.current[chave] ?? { x: 0, y: 0 };
    arrasto.current = { chave, x: e.clientX, y: e.clientY, ox: o.x, oy: o.y, moveu: false, clique };
    vista.current?.setPointerCapture(e.pointerId);
    setSuave(false);
  };

  // Decisões: título e ação de cada linha vêm da própria LinhaAcao (mesmo clique de antes).
  const decisoes = acoes.map((a) => {
    const p = (isValidElement(a.no) ? a.no.props : {}) as { titulo?: string; detalhe?: string; onClick?: () => void; atrasada?: boolean };
    return { a, titulo: p.titulo ?? a.chave, detalhe: p.detalhe, abrir: p.onClick, atrasada: p.atrasada || a.atrasada };
  });

  const agenteSel = rede.flatMap((s) => s.agentes.map((a) => ({ a, s }))).find((x) => x.a.pessoa.membro.id === agenteAberto) ?? null;
  const setorSel = rede.find((s) => s.id === setorFoco) ?? null;
  const trabalhando = rede.reduce((n, s) => n + s.agentes.filter((a) => a.estado === "trabalhando").length, 0);
  const totalEsperando = abertas.filter((t) => t.situacao === "aguardando_aprovacao").length;
  const totalAtrasadas = abertas.filter((t) => tarefaAtrasada(t, hoje)).length;
  const hojeFeitas = feitas.filter((t) => (t.concluida_em ?? "").slice(0, 10) === hoje).length;
  const apagado = (setorId: string) => !!setorFoco && setorFoco !== setorId;

  const indicadores = [
    { rotulo: "Na produção", valor: abertas.filter((t) => t.situacao !== "aguardando_aprovacao").length, Icone: Factory, cor: "text-sky-400 bg-sky-500/15" },
    { rotulo: "Concluídas hoje", valor: hojeFeitas, Icone: CheckCircle2, cor: "text-emerald-400 bg-emerald-500/15" },
    { rotulo: "Aguardando você", valor: acoes.length, Icone: AlertTriangle, cor: "text-amber-400 bg-amber-500/15" },
    { rotulo: "Atrasadas", valor: totalAtrasadas, Icone: AlertTriangle, cor: "text-rose-400 bg-rose-500/15" },
    { rotulo: "Concluídas na semana", valor: feitas.length, Icone: BarChart3, cor: "text-violet-400 bg-violet-500/15" },
  ];
  const saude = Math.max(0, Math.round(100 - (abertas.length ? (totalAtrasadas / abertas.length) * 70 : 0) - Math.min(totalEsperando, 10) * 1.5));
  const insights = [
    ...rede.filter((s) => s.feitas.length >= 3).sort((a, b) => b.feitas.length - a.feitas.length).slice(0, 1).map((s) => `${s.nome} avançando bem (${s.feitas.length} entregas)`),
    ...(totalEsperando ? [`${totalEsperando} ${totalEsperando === 1 ? "item aguardando" : "itens aguardando"} sua aprovação`] : []),
    ...(totalAtrasadas ? [`${totalAtrasadas} ${totalAtrasadas === 1 ? "entrega atrasada" : "entregas atrasadas"}`] : []),
    ...rede.flatMap((s) => s.agentes.filter((a) => a.estado === "bloqueado").map((a) => `${a.pessoa.membro.nome} está bloqueado`)).slice(0, 2),
  ];

  // Ponto de tela de um ponto do mundo (o cartão do agente abre ao lado dele).
  const naTela = (p: Ponto) => ({ x: p.x * cam.k + cam.x, y: p.y * cam.k + cam.y });

  return (
    <div className="dark space-y-3 rounded-2xl bg-[#05070d] p-3 text-white">
      <style>{`
        .orb * { transform-box: fill-box; }
        @keyframes orb-pulso { 0%,100% { transform: scale(1) } 50% { transform: scale(1.05) } }
        @keyframes orb-brilho { 0%,100% { opacity: .4 } 50% { opacity: .85 } }
        @keyframes orb-gira { to { transform: rotate(360deg) } }
        @keyframes orb-energia { to { stroke-dashoffset: -28 } }
        @keyframes orb-piscar { 0%,95%,100% { transform: scaleY(1) } 97% { transform: scaleY(.1) } }
        @keyframes orb-foco { 0%,100% { opacity: .45 } 50% { opacity: 1 } }
        .orb-pulso { transform-origin: center; animation: orb-pulso 3.6s ease-in-out infinite }
        .orb-brilho { animation: orb-brilho 3.6s ease-in-out infinite }
        .orb-gira { transform-origin: center; animation: orb-gira 40s linear infinite }
        .orb-energia { stroke-dasharray: 3 11; animation: orb-energia 2.2s linear infinite }
        .orb-olho { transform-origin: center; animation: orb-piscar 6s infinite }
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

      {/* O mapa */}
      <div ref={vista}
        className="orb relative h-[calc(100svh-230px)] min-h-[580px] cursor-grab touch-none select-none overflow-hidden rounded-2xl border border-white/[0.06] active:cursor-grabbing"
        style={{ background: "radial-gradient(55% 60% at 50% 48%, #0b1424 0%, #060810 70%), #05070d" }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-no]")) return;
          arrasto.current = { chave: null, x: e.clientX, y: e.clientY, ox: cam.x, oy: cam.y, moveu: false };
          vista.current?.setPointerCapture(e.pointerId);
          setSuave(false);
        }}
        onPointerMove={(e) => {
          const a = arrasto.current;
          if (!a) return;
          const dx = e.clientX - a.x, dy = e.clientY - a.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) a.moveu = true;
          if (!a.moveu) return;
          if (a.chave === null) setCam((c) => ({ ...c, x: a.ox + dx, y: a.oy + dy }));
          else {
            // O ref já leva a posição nova: ao soltar, salva exatamente o que está na tela.
            const novo = { ...deslocRef.current, [a.chave]: { x: a.ox + dx / camRef.current.k, y: a.oy + dy / camRef.current.k } };
            deslocRef.current = novo;
            setDesloc(novo);
          }
        }}
        onPointerUp={() => {
          const a = arrasto.current;
          arrasto.current = null;
          if (!a) return;
          if (a.chave !== null) { if (a.moveu) salvarLayout(deslocRef.current); else a.clique?.(); }
          else if (!a.moveu) setAgenteAberto(null);
        }}>
        <div className="pointer-events-none absolute inset-0 opacity-40"
          style={{ backgroundImage: "radial-gradient(1px 1px at 20% 30%, #fff8, transparent), radial-gradient(1px 1px at 70% 60%, #fff6, transparent), radial-gradient(1px 1px at 40% 80%, #fff5, transparent), radial-gradient(1px 1px at 85% 20%, #fff7, transparent), radial-gradient(1px 1px at 10% 70%, #fff5, transparent), radial-gradient(1px 1px at 55% 12%, #fff6, transparent)" }} />

        <div className="absolute left-0 top-0 h-0 w-0" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`, transformOrigin: "0 0", transition: suave ? "transform .55s cubic-bezier(.2,.7,.2,1)" : undefined }}>
          <svg className="absolute overflow-visible" style={{ left: -MUNDO / 2, top: -MUNDO / 2 }} width={MUNDO} height={MUNDO} viewBox={`${-MUNDO / 2} ${-MUNDO / 2} ${MUNDO} ${MUNDO}`}>
            <defs>
              <filter id="orb-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="14" /></filter>
              <filter id="orb-glow-p" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" /></filter>
              <radialGradient id="orb-esfera" cx="38%" cy="30%" r="80%"><stop offset="0%" stopColor="#16233a" /><stop offset="60%" stopColor="#0a1120" /><stop offset="100%" stopColor="#030712" /></radialGradient>
            </defs>

            {/* Órbitas tracejadas */}
            <ellipse rx="300" ry="250" fill="none" stroke="#38bdf8" strokeOpacity=".09" strokeDasharray="3 9" />
            <ellipse rx="190" ry="165" fill="none" stroke="#a78bfa" strokeOpacity=".07" strokeDasharray="2 10" />

            {/* Conexões */}
            {rede.map((s) => {
              const aceso = acaoFoco?.setorId === s.id;
              const ativo = s.fazendo.length > 0 || s.agentes.some((a) => a.estado === "trabalhando");
              const ang = Math.atan2(s.y, s.x);
              const ini = { x: Math.cos(ang) * R_ATLAS, y: Math.sin(ang) * R_ATLAS };
              const fim = { x: s.x - Math.cos(ang) * R_SETOR, y: s.y - Math.sin(ang) * R_SETOR };
              const d1 = curva(ini, fim);
              return (
                <g key={s.id} opacity={apagado(s.id) ? 0.15 : 1} style={{ transition: "opacity .4s" }}>
                  <path d={d1} stroke={s.cor} strokeOpacity={aceso ? 1 : 0.55} strokeWidth={aceso ? 3 : 1.6} fill="none" filter={aceso ? "url(#orb-glow-p)" : undefined} />
                  <path id={`orb-l-${s.id}`} d={d1} stroke={s.cor} strokeWidth="1.2" fill="none" className={ativo ? "orb-energia" : undefined} strokeOpacity={ativo ? 0.85 : 0} />
                  {ativo && <circle r="3" fill={s.cor}><animateMotion dur="4.5s" repeatCount="indefinite"><mpath href={`#orb-l-${s.id}`} /></animateMotion></circle>}
                  {s.agentes.map((a) => {
                    const id = `orb-a-${a.pessoa.membro.id}`;
                    const alvo = a.esquerda ? { x: a.x + 26 + TEXTO, y: a.y } : { x: a.x - R_AGENTE - 4, y: a.y };
                    const de = { x: s.x + (alvo.x < s.x ? -R_SETOR : R_SETOR), y: s.y };
                    const da = curva(de, alvo);
                    const acesoA = aceso && acaoFoco!.agentes.includes(a.pessoa.membro.id);
                    const corA = a.estado === "aguardando" ? "#fbbf24" : s.cor;
                    return (
                      <g key={id}>
                        <path id={id} d={da} stroke={corA} strokeOpacity={acesoA ? 1 : a.estado === "livre" ? 0.25 : 0.6} strokeWidth={acesoA ? 2.8 : 1.3} fill="none"
                          className={a.estado === "trabalhando" ? "orb-energia" : undefined} />
                        {a.estado === "trabalhando" && <circle r="2.6" fill="#fff"><animateMotion dur="3.4s" repeatCount="indefinite"><mpath href={`#${id}`} /></animateMotion></circle>}
                        {/* Pedido de aprovação: linha amarela até o Atlas, com um pacote andando */}
                        {a.esperando.length > 0 && (
                          <>
                            <path id={`${id}-ap`} d={curva({ x: a.x, y: a.y }, { x: (a.x < 0 ? -1 : 1) * R_ATLAS * 0.95, y: a.y > 0 ? 30 : -30 })}
                              stroke="#fbbf24" strokeOpacity={acesoA ? 0.9 : 0.28} strokeWidth={acesoA ? 2.2 : 1} fill="none" strokeDasharray="4 8" />
                            <rect width="6" height="6" x="-3" y="-3" rx="1.5" fill="#fbbf24" opacity=".85"><animateMotion dur="6s" repeatCount="indefinite"><mpath href={`#${id}-ap`} /></animateMotion></rect>
                          </>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {/* Atlas → Minhas decisões */}
            {decisoes.length > 0 && <path d={curva({ x: R_ATLAS, y: 0 }, { x: posDecisoes.x, y: posDecisoes.y + 20 })} stroke="#22d3ee" strokeOpacity=".7" strokeWidth="1.6" fill="none" />}

            {/* Atlas */}
            <g>
              <circle r={R_ATLAS + 26} fill="#22d3ee" opacity=".16" filter="url(#orb-glow)" className="orb-brilho" />
              <g className="orb-gira"><ellipse rx={R_ATLAS + 22} ry={R_ATLAS * 0.32} fill="none" stroke="#a78bfa" strokeOpacity=".35" strokeWidth="1.2" transform="rotate(-16)" />
                <circle cx={R_ATLAS + 18} cy="-26" r="2.6" fill="#c4b5fd" /></g>
              <g className="orb-pulso">
                <circle r={R_ATLAS} fill="url(#orb-esfera)" stroke="#22d3ee" strokeWidth="2.4" />
                <circle r={R_ATLAS - 3} fill="none" stroke="#38bdf8" strokeOpacity=".25" strokeWidth="5" />
                <g className="orb-olho"><circle cx="-17" cy="-38" r="9" fill="#67e8f9" /><circle cx="17" cy="-38" r="9" fill="#67e8f9" /></g>
              </g>
              {[20, 95, 160, 230, 300].map((g) => (
                <circle key={g} cx={Math.cos((g * Math.PI) / 180) * (R_ATLAS + 34)} cy={Math.sin((g * Math.PI) / 180) * (R_ATLAS + 34)} r="1.5" fill="#a5f3fc" className="orb-brilho" style={{ animationDelay: `${g * 9}ms` }} />
              ))}
            </g>

            {/* Setores */}
            {rede.map((s) => {
              const aceso = acaoFoco?.setorId === s.id || setorFoco === s.id;
              return (
                <g key={s.id} data-no="" transform={`translate(${s.x} ${s.y})`} opacity={apagado(s.id) ? 0.25 : 1} style={{ transition: "opacity .4s", cursor: "grab" }}
                  onPointerDown={(e) => comecarNo(e, `s:${s.id}`, () => (setorFoco === s.id ? visaoGeral() : focarSetor(s)))}>
                  <circle r={R_SETOR + 12} fill={s.cor} opacity={aceso ? 0.35 : 0.14} filter="url(#orb-glow)" />
                  <circle r={R_SETOR} fill="url(#orb-esfera)" stroke={s.cor} strokeWidth={aceso ? 3 : 2} />
                  {s.esperando.length > 0 && <circle r={R_SETOR + 7} fill="none" stroke="#fbbf24" strokeOpacity=".7" strokeWidth="1.4" strokeDasharray="3 6" className="orb-gira" />}
                </g>
              );
            })}

            {/* Agentes */}
            {rede.map((s) => s.agentes.map((a) => {
              const m = a.pessoa.membro;
              const est = ESTADO[a.estado];
              const aceso = (acaoFoco?.setorId === s.id && acaoFoco.agentes.includes(m.id)) || agenteAberto === m.id;
              const livre = a.estado === "livre";
              return (
                <g key={m.id} data-no="" transform={`translate(${a.x} ${a.y})`} opacity={apagado(s.id) ? 0.25 : 1} style={{ transition: "opacity .4s", cursor: "grab" }}
                  onPointerDown={(e) => comecarNo(e, `a:${m.id}`, () => setAgenteAberto(m.id))}>
                  {aceso && <circle r={R_AGENTE + 9} fill="none" stroke="#67e8f9" strokeWidth="2" style={{ animation: "orb-foco 1.4s ease-in-out infinite" }} />}
                  <circle r={R_AGENTE + 6} fill={est.cor} opacity={livre ? 0.12 : 0.32} filter="url(#orb-glow-p)" className={a.estado === "trabalhando" ? "orb-brilho" : undefined} />
                  <g className={a.estado === "trabalhando" ? "orb-pulso" : undefined}>
                    <circle r={R_AGENTE} fill="url(#orb-esfera)" stroke={est.cor} strokeOpacity={livre ? 0.6 : 1} strokeWidth={a.estado === "aguardando" || a.estado === "bloqueado" ? 2.6 : 2} />
                    <g className="orb-olho"><circle cx="-5" cy="-1" r="2.6" fill={est.cor} /><circle cx="5" cy="-1" r="2.6" fill={est.cor} /></g>
                  </g>
                  {a.estado === "finalizou" && <g transform="translate(13 -13)"><circle r="6" fill="#34d399" /><path d="M-2.6 0 l1.8 1.9 l3.4 -3.6" stroke="#04210f" strokeWidth="1.6" fill="none" /></g>}
                  {a.estado === "bloqueado" && <g transform="translate(13 -13)"><circle r="6" fill="#f43f5e" /><text textAnchor="middle" y="3.5" fontSize="9" fontWeight="900" fill="#fff">!</text></g>}
                </g>
              );
            }))}
          </svg>

          {/* Textos e cartões (HTML nas mesmas coordenadas) */}
          <div className="pointer-events-none absolute left-0 top-0 text-center" style={{ transform: "translate(-80px, -10px)", width: 160 }}>
            <p className="text-[26px] font-bold leading-none tracking-wide">{atlas?.nome ?? "Atlas"}</p>
            <p className="mt-1 text-[11px] text-white/60">Orquestrador da operação</p>
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-300">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" style={{ animation: "orb-brilho 2s infinite" }} />
              {trabalhando ? `Coordenando ${trabalhando}` : acoes.length ? "Analisando" : "Ativo"}
            </p>
          </div>

          {rede.map((s) => {
            const Icone = ICONE[s.tipo];
            const ativos = s.agentes.filter((a) => a.estado === "trabalhando").length;
            const status = s.esperando.length ? "Aguardando você" : ativos || s.fazendo.length ? "Em execução" : "Parado";
            return (
              <div key={s.id} className="pointer-events-none absolute left-0 top-0 flex flex-col items-center text-center"
                style={{ transform: `translate(${s.x - R_SETOR}px, ${s.y - 36}px)`, width: R_SETOR * 2, opacity: apagado(s.id) ? 0.25 : 1, transition: "opacity .4s" }}>
                <span style={{ color: s.cor }}><Icone className="h-6 w-6" /></span>
                <p className="mt-0.5 line-clamp-2 max-w-[100px] text-[13px] font-bold leading-[1.1]">{s.nome}</p>
                <p className="mt-0.5 text-[9.5px] leading-tight text-white/55">
                  <span className={s.esperando.length ? "text-amber-300" : ativos ? "text-emerald-300" : undefined}>{status}</span>
                  <br />{ativos} {ativos === 1 ? "ativo" : "ativos"} · {s.fazendo.length} em execução
                </p>
              </div>
            );
          })}

          {rede.map((s) => s.agentes.map((a) => {
            const m = a.pessoa.membro;
            const est = ESTADO[a.estado];
            const texto = a.tarefa?.titulo ?? (a.estado === "livre" ? null : a.pessoa.atual) ?? null;
            const prog = a.tarefa?.progresso ?? null;
            return (
              <div key={m.id} className="pointer-events-none absolute left-0 top-0" style={{ transform: `translate(${a.x + 26}px, ${a.y - 24}px)`, width: TEXTO, opacity: apagado(s.id) ? 0.2 : 1, transition: "opacity .4s" }}>
                <p className="truncate text-[13px] font-semibold leading-tight">{m.nome}</p>
                <span className={cn("mt-1 inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-white/[0.04] px-2 py-[3px] text-[11px] leading-tight",
                  a.estado === "livre" ? "border-white/10 text-white/45" : "text-white/90")}
                  style={a.estado === "livre" ? undefined : { borderColor: `${est.cor}66` }}>
                  <est.Icone className="h-3 w-3 shrink-0" style={{ color: est.cor }} />
                  <span className="truncate">{texto ?? (a.estado === "livre" ? (a.fila.length ? `Livre · ${a.fila.length} na fila` : "Sem tarefa") : est.rotulo)}</span>
                  {prog != null && prog > 0 && <span className="shrink-0 tabular-nums text-white/55">{prog}%</span>}
                </span>
              </div>
            );
          }))}

          {/* Minhas decisões: extensão do Atlas (arrastável, recolhível) */}
          {decisoes.length > 0 && (
            <div data-no="" className="absolute left-0 top-0 rounded-2xl border border-cyan-400/40 bg-[#0a1322]/90 shadow-[0_0_30px_rgba(34,211,238,0.12)] backdrop-blur"
              style={{ transform: `translate(${posDecisoes.x}px, ${posDecisoes.y}px)`, width: DECISOES_W }}>
              <div className="flex cursor-grab items-center gap-2 px-3 py-2 active:cursor-grabbing" onPointerDown={(e) => comecarNo(e, "decisoes", () => setDecisoesAbertas((x) => !x))}>
                <ClipboardList className="h-4 w-4 text-cyan-300" />
                <p className="flex-1 text-[13px] font-semibold">Minhas decisões</p>
                <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold">{decisoes.length}</span>
                <ChevronDown className={cn("h-4 w-4 text-white/50 transition-transform", !decisoesAbertas && "-rotate-90")} />
              </div>
              {decisoesAbertas && (
                <div data-rolavel="" className="max-h-[260px] space-y-0.5 overflow-y-auto border-t border-white/[0.06] p-1.5">
                  {(todasDecisoes ? decisoes : decisoes.slice(0, 4)).map(({ a, titulo, detalhe, abrir, atrasada }) => (
                    <button key={a.chave} type="button" title={detalhe ?? titulo}
                      onClick={() => { focarAcao(a); abrir?.(); }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] hover:bg-white/[0.06]">
                      {a.aprovacao ? <Hourglass className="h-3.5 w-3.5 shrink-0 text-amber-300" /> : atrasada ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />}
                      <span className="min-w-0 flex-1 truncate">{titulo}</span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/40" />
                    </button>
                  ))}
                  {decisoes.length > 4 && (
                    <button type="button" onClick={() => setTodasDecisoes((x) => !x)} className="w-full py-1 text-center text-[11px] text-cyan-300 hover:underline">
                      {todasDecisoes ? "Mostrar menos" : `Ver todas (${decisoes.length})`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Detalhe do agente: cartão pequeno ao lado dele */}
        {agenteSel && (() => {
          const a = agenteSel.a, est = ESTADO[a.estado];
          const p = naTela({ x: a.x, y: a.y });
          const w = 260;
          const el = vista.current;
          const esquerda = Math.min(Math.max(8, a.esquerda ? p.x - w - 24 : p.x + (26 + TEXTO) * cam.k + 12), (el?.clientWidth ?? 800) - w - 8);
          const topo = Math.min(Math.max(8, p.y - 40), (el?.clientHeight ?? 600) - 300);
          return (
            <div data-no="" data-rolavel="" className="absolute z-20 max-h-[300px] overflow-y-auto rounded-2xl border bg-[#0a0f1a]/95 p-3 shadow-2xl backdrop-blur"
              style={{ left: esquerda, top: topo, width: w, borderColor: `${agenteSel.s.cor}66` }}>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: est.cor, boxShadow: `0 0 10px ${est.cor}` }} />
                <p className="font-bold">{a.pessoa.membro.nome}</p>
                <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/70">{agenteSel.s.nome}</span>
                <button type="button" onClick={() => setAgenteAberto(null)} className="ml-auto rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              <dl className="mt-2 space-y-1.5 text-[12px]">
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-white/50">Tarefa atual</dt>
                  <dd className="min-w-0 flex-1">{a.tarefa ? <button type="button" onClick={() => onTarefa(a.tarefa!)} className="text-left hover:underline">{a.tarefa.titulo}</button> : (a.pessoa.atual ?? "Sem tarefa")}</dd></div>
                {(a.tarefa?.progresso ?? 0) > 0 && (
                  <div className="flex items-center gap-2"><dt className="w-20 shrink-0 text-white/50">Progresso</dt>
                    <dd className="flex flex-1 items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded bg-white/10"><span className="block h-full" style={{ width: `${a.tarefa!.progresso}%`, background: est.cor }} /></span><span className="tabular-nums">{a.tarefa!.progresso}%</span></dd></div>
                )}
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-white/50">Fila</dt><dd>{a.fila.length} {a.fila.length === 1 ? "item" : "itens"}</dd></div>
                <div className="flex gap-2"><dt className="w-20 shrink-0 text-white/50">Status</dt><dd style={{ color: est.cor }}>{est.rotulo}</dd></div>
              </dl>
              <ListaTarefas titulo="Aguardando aprovação" itens={a.esperando} onTarefa={onTarefa} />
              <ListaTarefas titulo="Fila" itens={a.fila} onTarefa={onTarefa} />
              <ListaTarefas titulo="Últimas entregas" itens={a.feitas} onTarefa={onTarefa} />
              <button type="button" onClick={() => onPessoa(a.pessoa.membro)} className="mt-2.5 w-full rounded-lg py-1.5 text-[12px] font-semibold text-black" style={{ background: agenteSel.s.cor }}>
                {a.pessoa.membro.eh_ia ? "Conversar" : "Abrir fila"}
              </button>
            </div>
          );
        })()}

        {/* Foco no setor: um resumo pequeno do grupo */}
        {setorSel && !agenteSel && (
          <div data-no="" data-rolavel="" className="absolute left-3 top-3 max-h-[60%] w-60 overflow-y-auto rounded-2xl border bg-[#0a0f1a]/90 p-3 backdrop-blur" style={{ borderColor: `${setorSel.cor}55` }}>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: setorSel.cor }} />
              <p className="flex-1 font-bold">{setorSel.nome}</p>
              <button type="button" onClick={visaoGeral} className="rounded p-0.5 text-white/50 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px]">
              <span className="rounded-lg bg-white/5 py-1"><b className="block text-sm">{setorSel.abertas.length - setorSel.esperando.length}</b>em produção</span>
              <span className="rounded-lg bg-amber-400/10 py-1 text-amber-200"><b className="block text-sm">{setorSel.esperando.length}</b>aguardando</span>
              <span className="rounded-lg bg-rose-500/10 py-1 text-rose-200"><b className="block text-sm">{setorSel.atrasadas.length}</b>atrasadas</span>
            </div>
            <ListaTarefas titulo="Aguardando você" itens={setorSel.esperando} onTarefa={onTarefa} />
            <ListaTarefas titulo="Atrasadas" itens={setorSel.atrasadas} onTarefa={onTarefa} />
            <ListaTarefas titulo="Últimas entregas" itens={setorSel.feitas} onTarefa={onTarefa} />
          </div>
        )}

        {/* Controles, dica e legenda */}
        <div data-no="" className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-xl border border-white/10 bg-black/60 p-1 backdrop-blur">
          <button type="button" onClick={() => { setSuave(true); zoomEm(1.25); }} className="rounded-lg p-1.5 hover:bg-white/10" title="Aproximar"><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={() => { setSuave(true); zoomEm(0.8); }} className="rounded-lg p-1.5 hover:bg-white/10" title="Afastar"><Minus className="h-4 w-4" /></button>
          <button type="button" onClick={() => irPara(0, 0, Math.max(cam.k, 0.9))} className="rounded-lg p-1.5 hover:bg-white/10" title="Centralizar o Atlas"><Crosshair className="h-4 w-4" /></button>
          <button type="button" onClick={visaoGeral} className="rounded-lg px-2 py-1 text-xs font-medium hover:bg-white/10">Visão geral</button>
          <button type="button" onClick={organizar} title="Volta setores e agentes para o arranjo automático" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-white/10"><LayoutGrid className="h-3.5 w-3.5" />Organizar automaticamente</button>
          <span className="px-1.5 text-[10px] tabular-nums text-white/45">{Math.round(cam.k * 100)}%</span>
        </div>
        <p className="pointer-events-none absolute bottom-4 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 text-[11px] text-white/40 2xl:flex">
          <Hand className="h-3.5 w-3.5" />Arraste o fundo para mover · arraste setores e agentes para reorganizar · pinça ou ⌘ + roda para zoom
        </p>
        <div className="pointer-events-none absolute bottom-4 right-4 hidden items-center gap-3 text-[11px] text-white/60 lg:flex">
          {(["trabalhando", "aguardando", "livre", "bloqueado"] as Estado[]).map((e) => (
            <span key={e} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: ESTADO[e].cor }} />{e === "aguardando" ? "Aguardando aprovação" : ESTADO[e].rotulo}</span>
          ))}
        </div>
      </div>

      {/* Fluxo geral e saúde (secundários) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/[0.03] px-3 py-2.5">
          <p className="mr-1 text-xs font-semibold text-white/60">Fluxo geral</p>
          {[
            ["Ideia / fila", abertas.filter((t) => t.situacao !== "andamento" && t.situacao !== "aguardando_aprovacao").length, "text-white"],
            ["Em produção", abertas.filter((t) => t.situacao === "andamento").length, "text-sky-300"],
            ["Aprovação", totalEsperando, "text-amber-300"],
            ["Concluído (7 dias)", feitas.length, "text-emerald-300"],
          ].map(([r, n, c], i) => (
            <span key={r as string} className="flex items-center gap-1.5 text-xs">
              {i > 0 && <span className="text-white/30">→</span>}
              <span className="rounded-lg bg-white/5 px-2.5 py-1">{r} <b className={cn("tabular-nums", c as string)}>{n}</b></span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-3 py-2.5">
          <HeartPulse className={cn("h-5 w-5 shrink-0", saude >= 75 ? "text-emerald-400" : saude >= 50 ? "text-amber-400" : "text-rose-400")} />
          <p className="text-xs font-semibold text-white/60">Saúde</p>
          <p className="text-lg font-bold tabular-nums">{saude}%</p>
          <p className="min-w-0 flex-1 truncate text-[11px] text-white/55">{insights.length ? insights.slice(0, 3).join(" · ") : "Tudo em dia"}</p>
        </div>
      </div>
    </div>
  );
}

function ListaTarefas({ titulo, itens, onTarefa }: { titulo: string; itens: TarefaResumo[]; onTarefa: (t: TarefaResumo) => void }) {
  if (!itens.length) return null;
  return (
    <div className="mt-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">{titulo} · {itens.length}</p>
      <div className="mt-0.5 space-y-0.5">
        {itens.slice(0, 6).map((t) => (
          <button key={t.id} type="button" onClick={() => onTarefa(t)} className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] text-white/80 hover:bg-white/10">{t.titulo}</button>
        ))}
      </div>
    </div>
  );
}
