import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, Maximize2, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// Cérebro do projeto (20/10/2026, Davi: "embaixo de Documentos, um Cérebro tipo o Obsidian: vejo a
// organização, os colaboradores, as inteligências deles, meus arquivos, as conexões"). Um grafo:
// projeto no centro → setores → colaboradores → inteligência de cada um; pastas → documentos; e o
// documento entregue numa tarefa liga em quem fez. Física simples (repulsão + molas), em canvas.
const db = supabase as unknown as SupabaseClient;

type Tipo = "projeto" | "setor" | "membro" | "inteligencia" | "pasta" | "documento" | "cerebro";
interface No {
  id: string; tipo: Tipo; nome: string; detalhe?: string; r: number;
  x: number; y: number; vx: number; vy: number; fixo?: boolean; grau: number;
}
interface Aresta { a: string; b: string }

const COR: Record<Tipo, string> = {
  projeto: "#6366f1", setor: "#3b82f6", membro: "#a855f7", inteligencia: "#f59e0b",
  pasta: "#22c55e", documento: "#94a3b8", cerebro: "#ec4899",
};
const ROTULO: Record<Tipo, string> = {
  projeto: "Projeto", setor: "Setores", membro: "Colaboradores", inteligencia: "Inteligência",
  pasta: "Pastas", documento: "Arquivos", cerebro: "Cérebros",
};
const RAIO: Record<Tipo, number> = { projeto: 16, setor: 10, membro: 9, inteligencia: 5, pasta: 8, documento: 5, cerebro: 7 };

async function carregarGrafo(clienteId: string) {
  const [cli, set, mem, intel, pas, docs] = await Promise.all([
    db.from("clientes").select("nome_especialista").eq("id", clienteId).maybeSingle(),
    db.from("setores").select("id, nome, cerebros").eq("cliente_id", clienteId),
    db.from("membros").select("id, nome, funcao, setor_id, eh_ia, ativo").eq("cliente_id", clienteId).eq("ativo", true),
    db.from("inteligencia_membros").select("id, nome, tipo, agente, membro_id, escopo, cliente_id").eq("cliente_id", clienteId),
    db.from("pastas_atividade").select("id, nome").eq("cliente_id", clienteId).eq("origem", "documentos").is("deleted_at", null),
    db.from("documentos").select("id, titulo, pasta_id, atividade_id, updated_at").eq("cliente_id", clienteId).is("deleted_at", null)
      .order("updated_at", { ascending: false }).limit(400),
  ]);
  const nos: No[] = [];
  const arestas: Aresta[] = [];
  const novo = (id: string, tipo: Tipo, nome: string, detalhe?: string) => {
    nos.push({ id, tipo, nome, detalhe, r: RAIO[tipo], x: (Math.random() - 0.5) * 600, y: (Math.random() - 0.5) * 600, vx: 0, vy: 0, grau: 0 });
  };
  const liga = (a: string, b: string) => arestas.push({ a, b });

  const raiz = `p:${clienteId}`;
  novo(raiz, "projeto", (cli.data as { nome_especialista?: string } | null)?.nome_especialista ?? "Projeto");
  const setores = (set.data ?? []) as { id: string; nome: string; cerebros: { id: string; nome: string }[] | null }[];
  for (const s of setores) {
    novo(`s:${s.id}`, "setor", s.nome); liga(raiz, `s:${s.id}`);
    for (const c of s.cerebros ?? []) { novo(`c:${s.id}:${c.id}`, "cerebro", `🧠 ${c.nome}`, `Cérebro do ${s.nome}`); liga(`s:${s.id}`, `c:${s.id}:${c.id}`); }
  }
  const membros = (mem.data ?? []) as { id: string; nome: string; funcao: string | null; setor_id: string | null; eh_ia: boolean }[];
  const porNome = new Map<string, string>();
  for (const m of membros) {
    novo(`m:${m.id}`, "membro", m.nome, [m.funcao, m.eh_ia ? "IA" : "pessoa"].filter(Boolean).join(" · "));
    liga(m.setor_id && setores.some((s) => s.id === m.setor_id) ? `s:${m.setor_id}` : raiz, `m:${m.id}`);
    porNome.set(m.nome.trim().toLowerCase(), m.id);
  }
  for (const i of (intel.data ?? []) as { id: string; nome: string; tipo: string; agente: string; membro_id: string | null; escopo: string }[]) {
    const dono = i.membro_id && membros.some((m) => m.id === i.membro_id) ? i.membro_id : porNome.get((i.agente ?? "").toLowerCase());
    if (!dono) continue;
    novo(`i:${i.id}`, "inteligencia", i.nome.replace(/^Skill:\s*/, "Skill · "), `${i.tipo} · ${i.escopo === "geral" ? "geral" : "deste projeto"}`);
    liga(`m:${dono}`, `i:${i.id}`);
  }
  const pastas = (pas.data ?? []) as { id: string; nome: string }[];
  for (const p of pastas) { novo(`f:${p.id}`, "pasta", p.nome); liga(raiz, `f:${p.id}`); }
  const documentos = (docs.data ?? []) as { id: string; titulo: string; pasta_id: string | null; atividade_id: string | null }[];
  // Documento entregue numa tarefa: liga em quem fez (responsável da tarefa).
  const comTarefa = documentos.filter((d) => d.atividade_id).map((d) => d.atividade_id!);
  const resp = new Map<string, string>();
  if (comTarefa.length) {
    const { data: ats } = await db.from("atividades").select("id, responsavel_id").in("id", comTarefa.slice(0, 300));
    for (const a of (ats ?? []) as { id: string; responsavel_id: string | null }[]) if (a.responsavel_id) resp.set(a.id, a.responsavel_id);
  }
  for (const d of documentos) {
    novo(`d:${d.id}`, "documento", d.titulo || "Sem título");
    liga(d.pasta_id && pastas.some((p) => p.id === d.pasta_id) ? `f:${d.pasta_id}` : raiz, `d:${d.id}`);
    const quem = d.atividade_id ? resp.get(d.atividade_id) : undefined;
    if (quem && membros.some((m) => m.id === quem)) liga(`m:${quem}`, `d:${d.id}`);
  }
  const grau = new Map<string, number>();
  for (const e of arestas) { grau.set(e.a, (grau.get(e.a) ?? 0) + 1); grau.set(e.b, (grau.get(e.b) ?? 0) + 1); }
  for (const n of nos) { n.grau = grau.get(n.id) ?? 0; n.r = RAIO[n.tipo] + Math.min(8, Math.sqrt(n.grau)); }
  const centro = nos[0]; centro.x = 0; centro.y = 0;
  return { nos, arestas };
}

export function CerebroView({ clienteId }: { clienteId: string }) {
  const navigate = useNavigate();
  const tela = useRef<HTMLCanvasElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const grafo = useRef<{ nos: No[]; arestas: Aresta[]; porId: Map<string, No>; vizinhos: Map<string, Set<string>> } | null>(null);
  const vista = useRef({ x: 0, y: 0, z: 1 });
  const energia = useRef(1);
  const [carregando, setCarregando] = useState(true);
  const [sel, setSel] = useState<No | null>(null);
  const [busca, setBusca] = useState("");
  const [ocultos, setOcultos] = useState<Set<Tipo>>(new Set());
  const hover = useRef<string | null>(null);
  const estado = useRef({ sel: null as No | null, busca: "", ocultos: new Set<Tipo>() });
  estado.current = { sel, busca: busca.trim().toLowerCase(), ocultos };

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    void carregarGrafo(clienteId).then(({ nos, arestas }) => {
      if (!vivo) return;
      const porId = new Map(nos.map((n) => [n.id, n]));
      const vizinhos = new Map<string, Set<string>>();
      for (const e of arestas) {
        (vizinhos.get(e.a) ?? vizinhos.set(e.a, new Set()).get(e.a)!).add(e.b);
        (vizinhos.get(e.b) ?? vizinhos.set(e.b, new Set()).get(e.b)!).add(e.a);
      }
      grafo.current = { nos, arestas: arestas.filter((e) => porId.has(e.a) && porId.has(e.b)), porId, vizinhos };
      energia.current = 1;
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [clienteId]);

  // Física: repulsão entre todos, molas nas ligações, puxão leve para o centro; esfria até parar.
  const passo = useCallback(() => {
    const g = grafo.current;
    if (!g || energia.current < 0.002) return;
    const { nos, arestas, porId } = g;
    const k = energia.current;
    for (let i = 0; i < nos.length; i++) {
      const a = nos[i];
      for (let j = i + 1; j < nos.length; j++) {
        const b = nos[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.5; }
        if (d2 > 250000) continue;
        const f = (1800 * k) / d2;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
    }
    for (const e of arestas) {
      const a = porId.get(e.a)!, b = porId.get(e.b)!;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const alvo = 40 + a.r + b.r + (a.tipo === "projeto" || b.tipo === "projeto" ? 60 : 0);
      const f = ((d - alvo) / d) * 0.06 * k;
      a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
    }
    for (const n of nos) {
      n.vx -= n.x * 0.002 * k; n.vy -= n.y * 0.002 * k;
      if (n.fixo) { n.vx = 0; n.vy = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += Math.max(-30, Math.min(30, n.vx)); n.y += Math.max(-30, Math.min(30, n.vy));
    }
    energia.current *= 0.992;
  }, []);

  const desenhar = useCallback(() => {
    const c = tela.current, g = grafo.current;
    if (!c || !g) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const { x: vx, y: vy, z } = vista.current;
    ctx.translate(w / 2 + vx, h / 2 + vy);
    ctx.scale(z, z);
    const { sel: s, busca: b, ocultos: oc } = estado.current;
    const foco = hover.current ?? s?.id ?? null;
    const perto = foco ? g.vizinhos.get(foco) ?? new Set<string>() : null;
    const visivel = (n: No) => !oc.has(n.tipo) || n.tipo === "projeto";
    const aceso = (n: No) => (!foco || n.id === foco || perto!.has(n.id)) && (!b || n.nome.toLowerCase().includes(b) || n.tipo === "projeto");
    ctx.lineWidth = 1 / z;
    for (const e of g.arestas) {
      const a = g.porId.get(e.a)!, d = g.porId.get(e.b)!;
      if (!visivel(a) || !visivel(d)) continue;
      const ligado = foco && (e.a === foco || e.b === foco);
      ctx.strokeStyle = ligado ? "rgba(168,85,247,0.8)" : foco || b ? "rgba(148,163,184,0.08)" : "rgba(148,163,184,0.28)";
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
    const escuro = document.documentElement.classList.contains("dark");
    for (const n of g.nos) {
      if (!visivel(n)) continue;
      const on = aceso(n);
      ctx.globalAlpha = on ? 1 : 0.15;
      ctx.fillStyle = COR[n.tipo];
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      if (s?.id === n.id) { ctx.strokeStyle = escuro ? "#fff" : "#111"; ctx.lineWidth = 2 / z; ctx.stroke(); ctx.lineWidth = 1 / z; }
      // Nomes: os grandes sempre; os pequenos com zoom, no foco ou na busca.
      const mostrar = n.tipo === "projeto" || n.tipo === "setor" || n.tipo === "membro" || n.tipo === "pasta" || z > 1.3 || (foco && on) || (b && on);
      if (mostrar) {
        ctx.font = `${n.tipo === "projeto" ? 13 : 11}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle = escuro ? "rgba(226,232,240,0.95)" : "rgba(30,41,59,0.95)";
        const t = n.nome.length > 42 ? `${n.nome.slice(0, 40)}…` : n.nome;
        ctx.fillText(t, n.x, n.y + n.r + 12);
      }
    }
    ctx.globalAlpha = 1;
  }, []);

  useEffect(() => {
    let id = 0;
    const laco = () => { passo(); desenhar(); id = requestAnimationFrame(laco); };
    id = requestAnimationFrame(laco);
    return () => cancelAnimationFrame(id);
  }, [passo, desenhar]);

  // Mouse: arrastar o fundo (anda), arrastar um ponto (move), roda/pinça (zoom), clique (seleciona).
  const mundo = (ev: { clientX: number; clientY: number }) => {
    const r = tela.current!.getBoundingClientRect();
    const { x, y, z } = vista.current;
    return { x: (ev.clientX - r.left - r.width / 2 - x) / z, y: (ev.clientY - r.top - r.height / 2 - y) / z };
  };
  const noEm = (p: { x: number; y: number }) => {
    const g = grafo.current;
    if (!g) return null;
    let melhor: No | null = null, dist = Infinity;
    for (const n of g.nos) {
      if (estado.current.ocultos.has(n.tipo) && n.tipo !== "projeto") continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < n.r + 4 / vista.current.z && d < dist) { melhor = n; dist = d; }
    }
    return melhor;
  };
  const arrasto = useRef<{ no: No | null; ix: number; iy: number; vx: number; vy: number; moveu: boolean } | null>(null);
  const aoApertar = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const no = noEm(mundo(e));
    if (no) { no.fixo = true; energia.current = Math.max(energia.current, 0.3); }
    arrasto.current = { no, ix: e.clientX, iy: e.clientY, vx: vista.current.x, vy: vista.current.y, moveu: false };
  };
  const aoMover = (e: React.PointerEvent) => {
    const a = arrasto.current;
    if (!a) {
      const n = noEm(mundo(e));
      hover.current = n?.id ?? null;
      if (tela.current) tela.current.style.cursor = n ? "pointer" : "grab";
      return;
    }
    if (Math.hypot(e.clientX - a.ix, e.clientY - a.iy) > 3) a.moveu = true;
    if (a.no) { const p = mundo(e); a.no.x = p.x; a.no.y = p.y; energia.current = Math.max(energia.current, 0.3); }
    else vista.current = { ...vista.current, x: a.vx + e.clientX - a.ix, y: a.vy + e.clientY - a.iy };
  };
  const aoSoltar = () => {
    const a = arrasto.current;
    arrasto.current = null;
    if (!a) return;
    if (a.no) a.no.fixo = false;
    if (!a.moveu) setSel(a.no);
  };
  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const { x, y, z } = vista.current;
      const fator = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const nz = Math.max(0.15, Math.min(4, z * fator));
      const mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
      vista.current = { x: mx - ((mx - x) / z) * nz, y: my - ((my - y) / z) * nz, z: nz };
    };
    c.addEventListener("wheel", roda, { passive: false });
    return () => c.removeEventListener("wheel", roda);
  }, [carregando]);

  const centralizar = () => { vista.current = { x: 0, y: 0, z: 0.8 }; };
  const contagem = useMemo(() => {
    const r = new Map<Tipo, number>();
    for (const n of grafo.current?.nos ?? []) r.set(n.tipo, (r.get(n.tipo) ?? 0) + 1);
    return r;
  }, [carregando]); // eslint-disable-line react-hooks/exhaustive-deps
  const ligados = sel ? [...(grafo.current?.vizinhos.get(sel.id) ?? [])].map((id) => grafo.current!.porId.get(id)!).filter(Boolean) : [];

  const abrir = (n: No) => {
    if (n.tipo === "documento") navigate(`/clientes/${clienteId}?documento=${n.id.slice(2)}`);
    else setSel(n);
  };

  return (
    <div ref={caixa} className="relative h-[calc(100vh-170px)] min-h-[520px] overflow-hidden rounded-xl border bg-slate-50 dark:bg-[#1e1f24]">
      {carregando && <div className="absolute inset-0 z-10 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      <canvas ref={tela} className="h-full w-full touch-none" onPointerDown={aoApertar} onPointerMove={aoMover} onPointerUp={aoSoltar}
        onPointerLeave={() => { hover.current = null; }} onDoubleClick={(e) => { const n = noEm(mundo(e)); if (n) abrir(n); }} />

      {/* Busca e legenda (clique na legenda esconde/mostra o tipo) */}
      <div className="absolute left-3 top-3 flex w-64 flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no cérebro…"
            className="h-8 w-full rounded-md border bg-background/90 pl-8 pr-2 text-xs outline-none backdrop-blur focus:border-primary/50" />
        </div>
        <div className="rounded-lg border bg-background/90 p-2 text-xs backdrop-blur">
          {(Object.keys(ROTULO) as Tipo[]).filter((t) => t !== "projeto" && contagem.get(t)).map((t) => (
            <button key={t} type="button" onClick={() => setOcultos((o) => { const n = new Set(o); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
              className={cn("flex w-full items-center gap-2 rounded px-1.5 py-1 hover:bg-muted", ocultos.has(t) && "opacity-40")}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: COR[t] }} />
              <span className="flex-1 text-left">{ROTULO[t]}</span>
              <span className="text-muted-foreground">{contagem.get(t)}</span>
            </button>
          ))}
        </div>
      </div>
      <button type="button" onClick={centralizar} title="Centralizar"
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md border bg-background/90 backdrop-blur hover:bg-muted">
        <Maximize2 className="h-4 w-4" />
      </button>
      <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-muted-foreground">
        Arraste o fundo para andar · roda ou pinça para zoom · clique para ver as conexões · dois cliques no arquivo abre
      </p>

      {/* Detalhe do ponto escolhido */}
      {sel && (
        <div className="absolute bottom-3 right-3 top-14 flex w-72 flex-col rounded-xl border bg-background/95 shadow-lg backdrop-blur">
          <div className="flex items-start gap-2 border-b p-3">
            <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: COR[sel.tipo] }} />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold">{sel.nome}</p>
              <p className="text-[11px] text-muted-foreground">{ROTULO[sel.tipo]}{sel.detalhe ? ` · ${sel.detalhe}` : ""}</p>
            </div>
            <button type="button" onClick={() => setSel(null)} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          {sel.tipo === "documento" && (
            <button type="button" onClick={() => abrir(sel)} className="mx-3 mt-3 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Abrir documento</button>
          )}
          <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conexões ({ligados.length})</p>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
            {ligados.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome)).map((n) => (
              <button key={n.id} type="button" onClick={() => setSel(n)} onDoubleClick={() => abrir(n)}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR[n.tipo] }} />
                <span className="min-w-0 flex-1 truncate">{n.nome}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
