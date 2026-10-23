import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Clock, ListTodo, MessageCircle, MousePointer2, PlayCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { prenderCursor } from "@/lib/desktop/window";
import { ESTACOES, INICIO, OBSTACULOS, PORTAS, SALAS, assentoDa, podeEstar, type SalaId } from "./cenario";
import { Pecas, Personagem, Portas, Salas, type Pose } from "./Mundo";

// Escritório virtual 3D em primeira pessoa (23/10, Davi: "quero entrar no meu escritório e andar por ele").
// Entrada → corredor → Audiovisual, Marketing e Diretoria (portas de vidro que abrem). React cuida da
// interface e dos dados; o mundo 3D (React Three Fiber) só desenha o que vem pelas props.
// WASD anda, o mouse olha, E (ou clique na mira) interage, T abre as tarefas. O chat da equipe fica por
// cima do mundo (não precisa sair para conversar).

export type SinalFuncionario = "trabalhando" | "esperando" | "problema" | "parado";
export interface Funcionario3D {
  id: string;
  nome: string;
  ehIa: boolean;
  sinal: SinalFuncionario;
  rotuloSinal: string;
  /** sala onde trabalha (setor); sem sala, não aparece no mundo (só nas tarefas) */
  sala?: SalaId | null;
  /** setor do funcionário (o mapa em pixel art põe cada setor numa sala) */
  setorId?: string | null;
  agora?: string | null;
  tarefa?: { id: string; titulo: string; progresso: number | null; minutosRestantes: number | null } | null;
  clicavel?: boolean;
}
export interface Resultado3D { concluidas: number; publicados: number; faltam: number; atrasadas: number; destaque: string }

const COR_SINAL: Record<SinalFuncionario, string> = { trabalhando: "#22c55e", esperando: "#f59e0b", problema: "#ef4444", parado: "#94a3b8" };
const ALTURA_OLHO = 1.62, VELOCIDADE = 3.1, CORRENDO = 5.2, ALCANCE = 2.3;
type Alvo = { tipo: "pessoa" | "porta"; id: string } | null;
type Lugar = { x: number; z: number; giro: number; pose: Pose; estacao: string | null };

// Digitando no chat (ou em qualquer campo), as teclas não mexem o boneco.
const digitando = (e: Event) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

// Quem senta onde: cada um na estação da sua sala (o Danilo na primeira do Audiovisual); quem está
// livre também senta na sua mesa, lendo.
function lugaresDe(funcionarios: Funcionario3D[]): Map<string, Lugar> {
  const m = new Map<string, Lugar>();
  const usadas = new Set<string>();
  const ordem = [...funcionarios].sort((a, b) => Number(/^danilo/i.test(b.nome)) - Number(/^danilo/i.test(a.nome)));
  for (const f of ordem) {
    if (!f.sala) continue;
    const est = ESTACOES.find((e) => e.sala === f.sala && !usadas.has(e.id));
    if (!est) continue;
    usadas.add(est.id);
    const a = assentoDa(est);
    m.set(f.id, { x: a.x, z: a.z, giro: a.giroRad, pose: f.sinal === "trabalhando" ? "digitando" : f.sinal === "parado" ? "lendo" : "sentado", estacao: est.id });
  }
  return m;
}

// Andar (WASD), colisão e o que está ao alcance (pessoa ou porta) para o E.
function Jogador({ ativo, posicao, aoAlcance, lugares, funcionarios, abertas, inicio }: {
  ativo: boolean; inicio?: { x: number; z: number; yaw: number }; posicao: React.MutableRefObject<{ x: number; z: number; yaw: number }>;
  aoAlcance: (a: Alvo) => void; lugares: Map<string, Lugar>; funcionarios: Funcionario3D[]; abertas: Set<string>;
}) {
  const { camera } = useThree();
  const teclas = useRef<Record<string, boolean>>({});
  const ultimo = useRef<string>("");
  const passo = useRef(0);
  useEffect(() => {
    camera.position.set(inicio?.x ?? INICIO.x, ALTURA_OLHO, inicio?.z ?? INICIO.z);
    camera.rotation.set(0, inicio?.yaw ?? INICIO.olhando, 0, "YXZ");
  }, [camera, inicio]);
  useEffect(() => {
    const baixo = (e: KeyboardEvent) => { if (!digitando(e)) teclas.current[e.code] = true; };
    const cima = (e: KeyboardEvent) => { teclas.current[e.code] = false; };
    const solta = () => { teclas.current = {}; };
    window.addEventListener("keydown", baixo); window.addEventListener("keyup", cima); window.addEventListener("blur", solta);
    return () => { window.removeEventListener("keydown", baixo); window.removeEventListener("keyup", cima); window.removeEventListener("blur", solta); };
  }, []);
  useEffect(() => { if (!ativo) teclas.current = {}; }, [ativo]);
  const frente = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const k = teclas.current, passoDt = Math.min(dt, 0.05);
    camera.getWorldDirection(frente); frente.y = 0; frente.normalize();
    const direita = { x: -frente.z, z: frente.x };
    let mx = 0, mz = 0;
    if (ativo) {
      if (k.KeyW || k.ArrowUp) { mx += frente.x; mz += frente.z; }
      if (k.KeyS || k.ArrowDown) { mx -= frente.x; mz -= frente.z; }
      if (k.KeyD) { mx += direita.x; mz += direita.z; }
      if (k.KeyA) { mx -= direita.x; mz -= direita.z; }
    }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      const v = ((k.ShiftLeft || k.ShiftRight) ? CORRENDO : VELOCIDADE) * passoDt / len;
      const nx = camera.position.x + mx * v, nz = camera.position.z + mz * v;
      if (podeEstar(nx, camera.position.z, abertas)) camera.position.x = nx;
      if (podeEstar(camera.position.x, nz, abertas)) camera.position.z = nz;
      passo.current += passoDt * 9;
    }
    camera.position.y = ALTURA_OLHO + (len > 0 ? Math.sin(passo.current) * 0.035 : 0);
    posicao.current = { x: camera.position.x, z: camera.position.z, yaw: Math.atan2(-frente.x, -frente.z) };
    // Ao alcance: a pessoa ou a porta mais perto, mais ou menos na frente.
    let melhor: Alvo = null, dist = ALCANCE;
    const olhar = (x: number, z: number, alvo: NonNullable<Alvo>, alcance = ALCANCE) => {
      const dx = x - camera.position.x, dz = z - camera.position.z, d = Math.hypot(dx, dz);
      if (d < Math.min(dist, alcance) && (dx * frente.x + dz * frente.z) / (d || 1) > 0.25) { melhor = alvo; dist = d; }
    };
    for (const f of funcionarios) { const l = lugares.get(f.id); if (l) olhar(l.x, l.z, { tipo: "pessoa", id: f.id }); }
    for (const p of PORTAS) olhar(p.centro[0], p.centro[1], { tipo: "porta", id: p.id }, 2.6);
    const chave = melhor ? `${(melhor as NonNullable<Alvo>).tipo}:${(melhor as NonNullable<Alvo>).id}` : "";
    if (chave !== ultimo.current) { ultimo.current = chave; aoAlcance(melhor); }
  });
  return null;
}

// Olhar: o mouse mexe a câmera (travado quando o sistema deixa; no app do Mac, sem trava, só mexendo o
// mouse em cima do mundo). ← → também viram. Clique: interage com o que está na mira.
function Olhar({ ativo, canvas, aoClicar, preso }: { ativo: boolean; canvas: HTMLCanvasElement | null; aoClicar: (a: Alvo) => void; preso: boolean }) {
  const { camera, scene } = useThree();
  const teclas = useRef<Record<string, boolean>>({});
  const raio = useMemo(() => new THREE.Raycaster(undefined, undefined, 0.1, 5), []);
  useEffect(() => {
    if (!canvas) return;
    const mover = (e: MouseEvent) => {
      if (!ativo) return;
      const k = document.pointerLockElement === canvas || preso ? 0.0022 : 0.0034;
      camera.rotation.order = "YXZ";
      camera.rotation.y -= e.movementX * k;
      camera.rotation.x = Math.max(-1.2, Math.min(1.2, camera.rotation.x - e.movementY * k));
    };
    const clicar = () => {
      if (!ativo) return;
      raio.setFromCamera(new THREE.Vector2(0, 0), camera);
      for (const hit of raio.intersectObjects(scene.children, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && !o.userData?.interativo) o = o.parent;
        if (o) { aoClicar(o.userData.interativo as Alvo); return; }
        if (hit.distance > 0.3) return;   // bateu em parede/móvel antes
      }
    };
    const baixo = (e: KeyboardEvent) => { if (!digitando(e)) teclas.current[e.code] = true; };
    const cima = (e: KeyboardEvent) => { teclas.current[e.code] = false; };
    // Preso pela janela: o cursor não sai do lugar, mas o movimento chega em qualquer ponto da página.
    const alvoMover: HTMLElement | Window = preso ? window : canvas;
    alvoMover.addEventListener("mousemove", mover as EventListener); canvas.addEventListener("click", clicar);
    window.addEventListener("keydown", baixo); window.addEventListener("keyup", cima);
    return () => { alvoMover.removeEventListener("mousemove", mover as EventListener); canvas.removeEventListener("click", clicar); window.removeEventListener("keydown", baixo); window.removeEventListener("keyup", cima); };
  }, [ativo, canvas, camera, scene, raio, aoClicar, preso]);
  useFrame((_, dt) => {
    if (!ativo) return;
    const giro = (teclas.current.ArrowLeft ? 1 : 0) - (teclas.current.ArrowRight ? 1 : 0);
    if (giro) { camera.rotation.order = "YXZ"; camera.rotation.y += giro * 1.9 * Math.min(dt, 0.05); }
  });
  return null;
}

function Luzes() {
  return (
    <>
      <color attach="background" args={["#0d0b0a"]} />
      <fog attach="fog" args={["#0d0b0a", 16, 38]} />
      <hemisphereLight args={["#ffe8c4", "#2a1f17", 0.55]} />
      <ambientLight intensity={0.12} />
      {/* Poucas luzes de verdade (cada uma pesa no desenho); luminárias, telas e neons só brilham. */}
      <pointLight position={[0, 2.8, -6]} intensity={14} distance={12} decay={2} color="#ffd9a0" />
      <pointLight position={[0, 2.8, -15]} intensity={12} distance={12} decay={2} color="#ffd9a0" />
      <pointLight position={[7.5, 2.8, -8]} intensity={22} distance={14} decay={2} color="#ffe2b8" />
      <pointLight position={[-7.5, 2.8, -8]} intensity={22} distance={14} decay={2} color="#ffe2b8" />
      <pointLight position={[0, 2.8, -23]} intensity={20} distance={13} decay={2} color="#ffd9a0" />
      <directionalLight position={[16, 14, 4]} intensity={1.0} color="#ffd9a8" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-18} shadow-camera-right={18}
        shadow-camera-top={18} shadow-camera-bottom={-30} shadow-camera-near={1} shadow-camera-far={70} shadow-bias={-0.0005} shadow-normalBias={0.04} />
    </>
  );
}

function Minimapa({ pos, lugares, funcionarios }: { pos: { x: number; z: number; yaw: number }; lugares: Map<string, Lugar>; funcionarios: Funcionario3D[] }) {
  // x de -15 a 15, z de 1 a -29 → SVG 180 × 180
  const sx = (x: number) => (x + 15) * 6, sz = (z: number) => (1 - z) * 6;
  return (
    <svg viewBox="0 0 180 180" className="h-40 w-40 rounded-xl border border-white/10 bg-black/55 p-1 backdrop-blur">
      {SALAS.map((s) => <rect key={s.id} x={sx(s.rect[0])} y={sz(s.rect[3])} width={(s.rect[2] - s.rect[0]) * 6} height={(s.rect[3] - s.rect[1]) * 6} fill={s.id === "corredor" ? "#3f3328" : `${s.cor}33`} stroke="#ffffff22" />)}
      {OBSTACULOS.map((o, k) => <rect key={k} x={sx(o[0])} y={sz(o[3])} width={(o[2] - o[0]) * 6} height={(o[3] - o[1]) * 6} fill="#ffffff14" />)}
      {SALAS.filter((s) => s.id !== "corredor").map((s) => <text key={s.id} x={sx((s.rect[0] + s.rect[2]) / 2)} y={sz(s.rect[1]) - 3} textAnchor="middle" fontSize="7" fill={s.cor}>{s.nome}</text>)}
      {funcionarios.map((f) => { const l = lugares.get(f.id); return l ? <circle key={f.id} cx={sx(l.x)} cy={sz(l.z)} r="2.6" fill={COR_SINAL[f.sinal]} /> : null; })}
      <g transform={`translate(${sx(pos.x)} ${sz(pos.z)}) rotate(${(-pos.yaw * 180) / Math.PI})`}><path d="M0 -6 L4 4 L0 2 L-4 4 Z" fill="#fff" stroke="#000" strokeWidth=".8" /></g>
    </svg>
  );
}

export default function EscritorioVirtual({ funcionarios, resultado, onSair, onConversar, onAbrirTarefa, inicio, semTelaDeEntrada }: {
  /** todos da equipe (quem tem sala aparece no mundo; todos aparecem nas tarefas) */
  funcionarios: Funcionario3D[];
  resultado: Resultado3D | null;
  onSair: () => void;
  /** abre o chat da pessoa (por cima do mundo) */
  onConversar: (id: string) => void;
  onAbrirTarefa?: (f: Funcionario3D) => void;
  /** só para testes: onde a câmera começa e entrar direto */
  inicio?: { x: number; z: number; yaw: number };
  semTelaDeEntrada?: boolean;
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [dentro, setDentro] = useState(!!semTelaDeEntrada);
  const [travado, setTravado] = useState(false);
  const [alcance, setAlcance] = useState<Alvo>(null);
  const [aberto, setAberto] = useState<Funcionario3D | null>(null);
  const [verTarefas, setVerTarefas] = useState(false);
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(PORTAS.filter((p) => p.abertaNoInicio).map((p) => p.id)));
  const posicao = useRef({ x: INICIO.x, z: INICIO.z, yaw: 0 });
  const [posMapa, setPosMapa] = useState(posicao.current);
  useEffect(() => { const t = window.setInterval(() => setPosMapa({ ...posicao.current }), 120); return () => window.clearInterval(t); }, []);
  useEffect(() => {
    const mudou = () => setTravado(!!canvas && document.pointerLockElement === canvas);
    document.addEventListener("pointerlockchange", mudou);
    return () => document.removeEventListener("pointerlockchange", mudou);
  }, [canvas]);
  // Cursor preso enquanto anda; Esc solta (aí dá para clicar em qualquer coisa do Infopro).
  const [preso, setPreso] = useState(false);   // preso pela janela do app do Mac
  const soltar = () => {
    if (document.pointerLockElement) document.exitPointerLock();
    void prenderCursor(false); setPreso(false);
  };
  const entrar = useCallback(() => {
    setDentro(true);
    void prenderCursor(true).then((ok) => {
      if (ok) { setPreso(true); return; }
      try { const r = canvas?.requestPointerLock() as unknown as Promise<void> | undefined; r?.catch?.(() => { /* sem trava: o mouse mexe a câmera em cima do mundo */ }); } catch { /* idem */ }
    });
  }, [canvas]);
  useEffect(() => () => { void prenderCursor(false); }, []);

  const noMundo = useMemo(() => funcionarios.filter((f) => f.sala), [funcionarios]);
  const lugares = useMemo(() => lugaresDe(noMundo), [noMundo]);
  const ligadas = useMemo(() => new Set([...lugares.values()].filter((l) => l.estacao && l.pose === "digitando").map((l) => l.estacao!)), [lugares]);
  const precisam = funcionarios.filter((f) => f.sinal === "esperando" || f.sinal === "problema");
  const pessoaAlvo = alcance?.tipo === "pessoa" ? funcionarios.find((f) => f.id === alcance.id) ?? null : null;
  const portaAlvo = alcance?.tipo === "porta" ? PORTAS.find((p) => p.id === alcance.id) ?? null : null;

  const interagir = useCallback((a: Alvo) => {
    if (!a) return;
    if (a.tipo === "porta") { setAbertas((s) => { const n = new Set(s); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; }); return; }
    const f = funcionarios.find((x) => x.id === a.id);
    if (f) { setAberto(f); soltar(); }
  }, [funcionarios]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (digitando(e)) return;
      if (e.code === "KeyE" && dentro && !aberto && alcance) { e.preventDefault(); interagir(alcance); }
      if (e.code === "KeyT" && dentro) { e.preventDefault(); setVerTarefas((v) => { if (!v) soltar(); return !v; }); }
      if (e.code === "Escape") {
        if (aberto) setAberto(null);
        else if (verTarefas) setVerTarefas(false);
        else if (dentro && !travado && !semTelaDeEntrada) { soltar(); setDentro(false); }   // pausa e solta o mouse
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [dentro, travado, alcance, aberto, verTarefas, interagir, semTelaDeEntrada]);

  const conversar = (id: string) => { soltar(); setAberto(null); onConversar(id); };
  const verAoVivo = (f: Funcionario3D) => { soltar(); setAberto(null); onAbrirTarefa?.(f); };
  const comTarefa = funcionarios.filter((f) => f.tarefa || f.sinal === "esperando" || f.sinal === "problema")
    .sort((a, b) => Number(b.sinal === "esperando" || b.sinal === "problema") - Number(a.sinal === "esperando" || a.sinal === "problema"));

  return (
    // z-[35]: fica embaixo da gaveta do chat da equipe (z-40) e das janelas (z-50) — não precisa sair.
    <div className="fixed inset-0 z-[35] select-none bg-black">
      <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 72, near: 0.05, far: 90 }} gl={{ antialias: true }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; setCanvas(gl.domElement); }}>
        <Suspense fallback={null}>
          <Luzes />
          <Salas />
          <Pecas ligadas={ligadas} resultado={resultado} />
          <Portas abertas={abertas} />
          {noMundo.map((f) => {
            const l = lugares.get(f.id); if (!l) return null;
            return <Personagem key={f.id} id={f.id} nome={f.nome} pose={l.pose} corStatus={COR_SINAL[f.sinal]}
              alerta={f.sinal === "esperando" ? "#f59e0b" : f.sinal === "problema" ? "#ef4444" : null} posicao={[l.x, 0, l.z]} giro={l.giro} />;
          })}
          <Jogador ativo={dentro && !aberto} inicio={inicio} posicao={posicao} aoAlcance={setAlcance} lugares={lugares} funcionarios={noMundo} abertas={abertas} />
          <Olhar ativo={dentro && !aberto && !verTarefas} canvas={canvas} aoClicar={interagir} preso={preso} />
        </Suspense>
      </Canvas>

      {/* HUD: mira, minimapa, tarefas, quem precisa de você, dica */}
      {dentro && <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-[0_0_0_2px_rgba(0,0,0,.45)]" />}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <Minimapa pos={posMapa} lugares={lugares} funcionarios={noMundo} />
        {precisam.length > 0 && (
          <button type="button" onClick={() => setVerTarefas(true)} className="rounded-lg border border-amber-400/40 bg-black/60 px-2.5 py-1.5 text-[11px] text-amber-200 backdrop-blur hover:bg-black/80">
            {precisam.length === 1 ? `${precisam[0].nome} precisa de você` : `${precisam.length} precisam de você`}
          </button>
        )}
      </div>
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <span className="rounded-lg bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur">Escritório virtual</span>
        <button type="button" onClick={() => setVerTarefas((v) => !v)} className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] backdrop-blur", verTarefas ? "bg-white text-black" : "bg-black/55 text-white/85 hover:bg-black/75")}>
          <ListTodo className="h-3.5 w-3.5" />Tarefas <kbd className="ml-0.5 rounded bg-white/15 px-1 text-[9px]">T</kbd>
        </button>
        <button type="button" onClick={() => { soltar(); onSair(); }} className="rounded-lg bg-black/55 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur hover:bg-black/75 hover:text-white">Sair</button>
      </div>
      {dentro && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-black/45 px-2.5 py-1.5 text-[10.5px] text-white/75 backdrop-blur">
          <b className="text-white">W A S D</b> andar · <b className="text-white">Shift</b> correr · <b className="text-white">Mouse</b> olhar · <b className="text-white">E</b> ou clique interagir · <b className="text-white">T</b> tarefas · <b className="text-white">Esc</b> pausar
        </div>
      )}
      {dentro && !aberto && (pessoaAlvo || portaAlvo) && (
        <div className="pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2 rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-sm text-white shadow-xl backdrop-blur">
          <kbd className="mr-1.5 rounded bg-white px-1.5 py-0.5 text-xs font-bold text-black">E</kbd>
          {pessoaAlvo ? `Conversar com ${pessoaAlvo.nome}` : `${abertas.has(portaAlvo!.id) ? "Fechar" : "Abrir"} a porta · ${portaAlvo!.nome}`}
        </div>
      )}

      {/* Tarefas (canto esquerdo): quem precisa de você primeiro, depois o que está em execução */}
      {verTarefas && (
        <div className="absolute bottom-16 left-4 top-14 z-10 flex w-[min(340px,86vw)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#14110f]/92 text-white shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <p className="text-sm font-semibold">Tarefas da equipe</p>
            <button type="button" onClick={() => setVerTarefas(false)} className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Fechar"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
            {comTarefa.length === 0 && <p className="p-3 text-xs text-white/60">Ninguém com tarefa agora.</p>}
            {comTarefa.map((f) => (
              <div key={f.id} className="rounded-xl bg-white/5 p-2.5">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: COR_SINAL[f.sinal] }} />
                  <b>{f.nome}</b><span className="text-white/50">· {f.rotuloSinal}</span>
                </div>
                <p className="mt-1 text-[12.5px] leading-snug">{f.tarefa?.titulo ?? f.agora ?? "—"}</p>
                {f.tarefa?.progresso != null && f.tarefa.progresso > 0 && (
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, f.tarefa.progresso)}%` }} /></div>
                )}
                <div className="mt-2 flex gap-1.5">
                  {f.clicavel !== false && <button type="button" onClick={() => conversar(f.id)} className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20"><MessageCircle className="h-3 w-3" />Conversar</button>}
                  {f.tarefa && onAbrirTarefa && <button type="button" onClick={() => verAoVivo(f)} className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20"><PlayCircle className="h-3 w-3" />Ao vivo</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Antes de entrar / pausado */}
      {!dentro && !aberto && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 text-center text-white">
            <p className="text-2xl font-bold">Escritório virtual</p>
            <p className="max-w-sm text-sm text-white/70">Corredor, Audiovisual, Marketing e Diretoria. Mexa o mouse para olhar, WASD para andar, E para conversar ou abrir as portas.</p>
            <button type="button" onClick={entrar} className="mt-1 flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-lg hover:bg-white/90">
              <MousePointer2 className="h-4 w-4" />Clique para entrar
            </button>
            <button type="button" onClick={() => { soltar(); onSair(); }} className="text-xs text-white/60 hover:text-white">Voltar para o mapa</button>
          </div>
        </div>
      )}

      {/* Painel do funcionário (React por cima do mundo) */}
      {aberto && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35">
          <div className="w-[min(420px,92vw)] rounded-2xl border border-white/10 bg-[#14110f]/95 p-5 text-white shadow-2xl backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg font-bold">{aberto.nome.slice(0, 1)}</div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold leading-tight">{aberto.nome}</p>
                <p className="flex items-center gap-1.5 text-xs text-white/70"><span className="h-2 w-2 rounded-full" style={{ background: COR_SINAL[aberto.sinal] }} />{aberto.rotuloSinal}</p>
              </div>
              <button type="button" onClick={() => setAberto(null)} className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Tarefa atual</p>
              <p className="text-sm font-medium">{aberto.tarefa?.titulo ?? aberto.agora ?? "Sem tarefa agora"}</p>
              {aberto.tarefa && (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    {aberto.tarefa.progresso != null && aberto.tarefa.progresso > 0
                      ? <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, aberto.tarefa.progresso)}%` }} />
                      : <div className="h-full w-1/3 animate-pulse rounded-full bg-emerald-500/60" />}
                  </div>
                  <p className="flex items-center justify-between text-xs text-white/70">
                    <span>{aberto.tarefa.progresso != null ? `${aberto.tarefa.progresso}%` : "em andamento"}</span>
                    {aberto.tarefa.minutosRestantes != null && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{aberto.tarefa.minutosRestantes < 60 ? `~${aberto.tarefa.minutosRestantes} min` : `~${Math.round(aberto.tarefa.minutosRestantes / 60)} h`}</span>}
                  </p>
                </>
              )}
              {aberto.agora && aberto.tarefa && aberto.agora !== aberto.tarefa.titulo && <p className="rounded-lg bg-white/5 px-2.5 py-1.5 text-xs text-white/80">Agora: {aberto.agora}</p>}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {aberto.clicavel !== false && (
                <button type="button" onClick={() => conversar(aberto.id)} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90">
                  <MessageCircle className="h-4 w-4" />Conversar com {aberto.nome}
                </button>
              )}
              {aberto.tarefa && onAbrirTarefa && (
                <button type="button" onClick={() => verAoVivo(aberto)} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
                  <PlayCircle className="h-4 w-4" />Ver ao vivo
                </button>
              )}
              <button type="button" onClick={() => { setAberto(null); entrar(); }} className="ml-auto rounded-lg px-3 py-2 text-sm text-white/70 hover:text-white">Voltar ao escritório</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

