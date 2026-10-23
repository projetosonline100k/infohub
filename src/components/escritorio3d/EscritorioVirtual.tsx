import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Clock, MessageCircle, MousePointer2, PlayCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ESTACOES, INICIO, OBSTACULOS, PORTAS, SALAS, podeEstar } from "./cenario";
import { Pecas, Personagem, Salas, type Pose } from "./Mundo";

// Escritório virtual 3D em primeira pessoa (23/10, Davi: "quero entrar no meu escritório e andar por ele").
// Protótipo (vertical slice): Entrada → corredor → Audiovisual. React cuida da interface e dos dados;
// o mundo 3D (React Three Fiber) só desenha o que vem pelas props. WASD anda, mouse olha, E interage.

export type SinalFuncionario = "trabalhando" | "esperando" | "problema" | "parado";
export interface Funcionario3D {
  id: string;
  nome: string;
  ehIa: boolean;
  sinal: SinalFuncionario;
  rotuloSinal: string;
  /** o que está fazendo agora (o balão do mapa) */
  agora?: string | null;
  tarefa?: { id: string; titulo: string; progresso: number | null; minutosRestantes: number | null } | null;
  clicavel?: boolean;
}
export interface Resultado3D { concluidas: number; publicados: number; faltam: number; atrasadas: number; destaque: string }

const COR_SINAL: Record<SinalFuncionario, string> = { trabalhando: "#22c55e", esperando: "#f59e0b", problema: "#ef4444", parado: "#94a3b8" };
const ALTURA_OLHO = 1.62, VELOCIDADE = 3.1, CORRENDO = 5.2, ALCANCE = 2.3;

type Lugar = { x: number; z: number; giro: number; pose: Pose; estacao: number | null };

// Quem senta onde: trabalhando/esperando/problema nas estações (o Danilo na primeira); quem está livre
// fica no sofá lendo.
function lugaresDe(funcionarios: Funcionario3D[]): Map<string, Lugar> {
  const m = new Map<string, Lugar>();
  const ordem = [...funcionarios].sort((a, b) => Number(/^danilo/i.test(b.nome)) - Number(/^danilo/i.test(a.nome)));
  let est = 0, sofa = 0;
  for (const f of ordem) {
    if (f.sinal !== "parado" && est < ESTACOES.length) {
      const [x, z] = ESTACOES[est];
      m.set(f.id, { x, z: z + 0.78, giro: 0, pose: f.sinal === "trabalhando" ? "digitando" : "sentado", estacao: est });
      est++;
    } else if (sofa < 2) {
      m.set(f.id, { x: 3.7 + sofa * 1.0, z: -2.75, giro: Math.PI, pose: "lendo", estacao: null });
      sofa++;
    }
  }
  return m;
}

function Jogador({ ativo, posicao, perto, lugares, funcionarios, inicio }: {
  ativo: boolean; inicio?: { x: number; z: number; yaw: number }; posicao: React.MutableRefObject<{ x: number; z: number; yaw: number }>;
  perto: (id: string | null) => void; lugares: Map<string, Lugar>; funcionarios: Funcionario3D[];
}) {
  const { camera } = useThree();
  const teclas = useRef<Record<string, boolean>>({});
  const ultimoPerto = useRef<string | null>(null);
  const passo = useRef(0);
  useEffect(() => {
    camera.position.set(inicio?.x ?? INICIO.x, ALTURA_OLHO, inicio?.z ?? INICIO.z);
    camera.rotation.set(0, inicio?.yaw ?? INICIO.olhando, 0, "YXZ");
  }, [camera, inicio]);
  useEffect(() => {
    const baixo = (e: KeyboardEvent) => { teclas.current[e.code] = true; };
    const cima = (e: KeyboardEvent) => { teclas.current[e.code] = false; };
    const solta = () => { teclas.current = {}; };
    window.addEventListener("keydown", baixo); window.addEventListener("keyup", cima); window.addEventListener("blur", solta);
    return () => { window.removeEventListener("keydown", baixo); window.removeEventListener("keyup", cima); window.removeEventListener("blur", solta); };
  }, []);
  useEffect(() => { if (!ativo) teclas.current = {}; }, [ativo]);
  const frente = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const k = teclas.current;
    const passoDt = Math.min(dt, 0.05);
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
      // Desliza nas paredes: tenta os dois eixos separados.
      if (podeEstar(nx, camera.position.z)) camera.position.x = nx;
      if (podeEstar(camera.position.x, nz)) camera.position.z = nz;
      passo.current += passoDt * 9;
    }
    camera.position.y = ALTURA_OLHO + (len > 0 ? Math.sin(passo.current) * 0.035 : 0);
    posicao.current = { x: camera.position.x, z: camera.position.z, yaw: Math.atan2(-frente.x, -frente.z) };
    // Quem está perto (e mais ou menos na frente) pode ser chamado com E.
    let melhor: string | null = null, dist = ALCANCE;
    for (const f of funcionarios) {
      const l = lugares.get(f.id); if (!l) continue;
      const dx = l.x - camera.position.x, dz = l.z - camera.position.z, d = Math.hypot(dx, dz);
      if (d < dist && (dx * frente.x + dz * frente.z) / (d || 1) > 0.2) { melhor = f.id; dist = d; }
    }
    if (melhor !== ultimoPerto.current) { ultimoPerto.current = melhor; perto(melhor); }
  });
  return null;
}

// Olhar em volta (23/10: no app do Mac o "travar o mouse" do navegador não funciona — o clique em
// "Entrar" não fazia nada). Mouse travado quando dá; senão, olha arrastando o mouse ou com ← →.
function Olhar({ ativo, canvas }: { ativo: boolean; canvas: HTMLCanvasElement | null }) {
  const { camera } = useThree();
  const teclas = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!canvas) return;
    const mover = (e: MouseEvent) => {
      if (!ativo) return;
      const travado = document.pointerLockElement === canvas;
      if (!travado && !(e.buttons & 1)) return;
      const k = travado ? 0.0022 : 0.0042;
      camera.rotation.order = "YXZ";
      camera.rotation.y -= e.movementX * k;
      camera.rotation.x = Math.max(-1.25, Math.min(1.25, camera.rotation.x - e.movementY * k));
    };
    const baixo = (e: KeyboardEvent) => { teclas.current[e.code] = true; };
    const cima = (e: KeyboardEvent) => { teclas.current[e.code] = false; };
    window.addEventListener("mousemove", mover); window.addEventListener("keydown", baixo); window.addEventListener("keyup", cima);
    return () => { window.removeEventListener("mousemove", mover); window.removeEventListener("keydown", baixo); window.removeEventListener("keyup", cima); };
  }, [ativo, canvas, camera]);
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
      <fog attach="fog" args={["#0d0b0a", 14, 34]} />
      <hemisphereLight args={["#ffe8c4", "#2a1f17", 0.55]} />
      <ambientLight intensity={0.12} />
      {/* Poucas luzes de verdade (cada uma pesa no desenho); luminárias, telas e neons só brilham. */}
      <pointLight position={[0, 2.8, -4]} intensity={14} distance={12} decay={2} color="#ffd9a0" />
      <pointLight position={[0, 2.8, -13]} intensity={14} distance={12} decay={2} color="#ffd9a0" />
      <pointLight position={[6, 2.8, -6]} intensity={18} distance={13} decay={2} color="#ffe2b8" />
      <pointLight position={[10.5, 2.8, -10.5]} intensity={18} distance={13} decay={2} color="#ffe2b8" />
      <directionalLight position={[16, 14, 4]} intensity={1.1} color="#ffd9a8" castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-left={-14} shadow-camera-right={18}
        shadow-camera-top={14} shadow-camera-bottom={-22} shadow-camera-near={1} shadow-camera-far={60} shadow-bias={-0.0005} shadow-normalBias={0.04} />
    </>
  );
}

function Minimapa({ pos, lugares, funcionarios }: { pos: { x: number; z: number; yaw: number }; lugares: Map<string, Lugar>; funcionarios: Funcionario3D[] }) {
  // x de -3 a 15, z de 1 a -19 → SVG 180 × 200
  const sx = (x: number) => (x + 3) * 10, sz = (z: number) => (1 - z) * 10;
  return (
    <svg viewBox="0 0 180 200" className="h-40 w-36 rounded-xl border border-white/10 bg-black/55 p-1 backdrop-blur">
      {SALAS.map((s) => <rect key={s.id} x={sx(s.rect[0])} y={sz(s.rect[3])} width={(s.rect[2] - s.rect[0]) * 10} height={(s.rect[3] - s.rect[1]) * 10} fill={s.id === "corredor" ? "#3f3328" : "#1e3a5f"} stroke="#ffffff22" />)}
      {PORTAS.map((p) => <rect key={p.id} x={sx(p.rect[0])} y={sz(p.rect[3])} width={(p.rect[2] - p.rect[0]) * 10} height={(p.rect[3] - p.rect[1]) * 10} fill="#3f3328" />)}
      {OBSTACULOS.map((o, k) => <rect key={k} x={sx(o[0])} y={sz(o[3])} width={(o[2] - o[0]) * 10} height={(o[3] - o[1]) * 10} fill="#ffffff14" />)}
      <text x={sx(8)} y={sz(-13.2)} textAnchor="middle" fontSize="9" fill="#93c5fd">Audiovisual</text>
      <text x={sx(0)} y={sz(-17.3)} textAnchor="middle" fontSize="8" fill="#fcd34d">Diretoria</text>
      {funcionarios.map((f) => { const l = lugares.get(f.id); return l ? <circle key={f.id} cx={sx(l.x)} cy={sz(l.z)} r="3.2" fill={COR_SINAL[f.sinal]} /> : null; })}
      <g transform={`translate(${sx(pos.x)} ${sz(pos.z)}) rotate(${(-pos.yaw * 180) / Math.PI})`}>
        <path d="M0 -7 L5 5 L0 2 L-5 5 Z" fill="#fff" stroke="#000" strokeWidth=".8" />
      </g>
    </svg>
  );
}

export default function EscritorioVirtual({ funcionarios, resultado, onSair, onConversar, onAbrirTarefa, inicio, semTelaDeEntrada }: {
  /** só para testes: onde a câmera começa e esconder a tela "Clique para entrar" */
  inicio?: { x: number; z: number; yaw: number };
  semTelaDeEntrada?: boolean;
  /** quem trabalha no Audiovisual (protótipo) */
  funcionarios: Funcionario3D[];
  resultado: Resultado3D | null;
  onSair: () => void;
  onConversar: (id: string) => void;
  onAbrirTarefa?: (f: Funcionario3D) => void;
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [dentro, setDentro] = useState(!!semTelaDeEntrada);   // entrou no escritório
  const [travado, setTravado] = useState(false);               // mouse preso (quando o sistema deixa)
  useEffect(() => {
    const mudou = () => {
      const preso = !!canvas && document.pointerLockElement === canvas;
      setTravado((antes) => { if (antes && !preso) setDentro(false); return preso; });   // Esc soltou o mouse: volta à tela de entrada
    };
    document.addEventListener("pointerlockchange", mudou);
    return () => document.removeEventListener("pointerlockchange", mudou);
  }, [canvas]);
  const entrar = useCallback(() => {
    setDentro(true);
    try { const r = canvas?.requestPointerLock() as unknown as Promise<void> | undefined; r?.catch?.(() => { /* sem trava: olha arrastando */ }); } catch { /* idem */ }
  }, [canvas]);
  const soltar = () => { if (document.pointerLockElement) document.exitPointerLock(); };
  const [pertoDe, setPertoDe] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Funcionario3D | null>(null);
  const posicao = useRef({ x: INICIO.x, z: INICIO.z, yaw: 0 });
  const [posMapa, setPosMapa] = useState(posicao.current);
  useEffect(() => { const t = window.setInterval(() => setPosMapa({ ...posicao.current }), 120); return () => window.clearInterval(t); }, []);
  const lugares = useMemo(() => lugaresDe(funcionarios), [funcionarios]);
  const ligadas = useMemo(() => new Set([...lugares.values()].filter((l) => l.estacao != null && l.pose === "digitando").map((l) => l.estacao!)), [lugares]);
  const perto = funcionarios.find((f) => f.id === pertoDe) ?? null;
  const precisam = funcionarios.filter((f) => f.sinal === "esperando" || f.sinal === "problema");

  const abrir = useCallback((f: Funcionario3D) => { setAberto(f); if (document.pointerLockElement) document.exitPointerLock(); }, []);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.code === "KeyE" && dentro && perto && !aberto) { e.preventDefault(); abrir(perto); }
      if (e.code === "Escape") { if (aberto) setAberto(null); else if (dentro && !travado && !semTelaDeEntrada) setDentro(false); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [dentro, travado, perto, aberto, abrir, semTelaDeEntrada]);

  return (
    <div className="fixed inset-0 z-[60] select-none bg-black">
      <Canvas shadows dpr={[1, 1.75]} camera={{ fov: 72, near: 0.05, far: 80 }} gl={{ antialias: true }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05; setCanvas(gl.domElement); }}>
        <Suspense fallback={null}>
          <Luzes />
          <Salas />
          <Pecas ligadas={ligadas} resultado={resultado} />
          {funcionarios.map((f) => {
            const l = lugares.get(f.id); if (!l) return null;
            return <Personagem key={f.id} nome={f.nome} pose={l.pose} corStatus={COR_SINAL[f.sinal]}
              alerta={f.sinal === "esperando" ? "#f59e0b" : f.sinal === "problema" ? "#ef4444" : null} posicao={[l.x, 0, l.z]} giro={l.giro} />;
          })}
          <Jogador ativo={dentro && !aberto} inicio={inicio} posicao={posicao} perto={setPertoDe} lugares={lugares} funcionarios={funcionarios} />
          <Olhar ativo={dentro && !aberto} canvas={canvas} />
        </Suspense>
      </Canvas>

      {/* HUD mínimo: mira, minimapa, quem precisa de você, dica de controles */}
      {dentro && <div className="pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-[0_0_0_2px_rgba(0,0,0,.45)]" />}
      <div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-2">
        <Minimapa pos={posMapa} lugares={lugares} funcionarios={funcionarios} />
        {precisam.length > 0 && (
          <div className="rounded-lg border border-amber-400/40 bg-black/60 px-2.5 py-1.5 text-[11px] text-amber-200 backdrop-blur">
            {precisam.length === 1 ? `${precisam[0].nome} precisa de você` : `${precisam.length} precisam de você`}
          </div>
        )}
      </div>
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <span className="rounded-lg bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur">Escritório virtual · protótipo</span>
        <button type="button" onClick={() => { soltar(); onSair(); }} className="rounded-lg bg-black/55 px-2.5 py-1 text-[11px] text-white/80 backdrop-blur hover:bg-black/75 hover:text-white">Sair</button>
      </div>
      {dentro && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg bg-black/45 px-2.5 py-1.5 text-[10.5px] text-white/75 backdrop-blur">
          <b className="text-white">W A S D</b> andar · <b className="text-white">Shift</b> correr · <b className="text-white">{travado ? "Mouse" : "Arraste o mouse ou ← →"}</b> olhar · <b className="text-white">E</b> interagir · <b className="text-white">Esc</b> {travado ? "soltar o mouse" : "pausar"}
        </div>
      )}
      {dentro && perto && !aberto && (
        <div className="pointer-events-none absolute left-1/2 top-[58%] -translate-x-1/2 rounded-lg border border-white/15 bg-black/70 px-3 py-1.5 text-sm text-white shadow-xl backdrop-blur">
          <kbd className="mr-1.5 rounded bg-white px-1.5 py-0.5 text-xs font-bold text-black">E</kbd>Conversar com {perto.nome}
        </div>
      )}

      {/* Antes de entrar / mouse solto */}
      {!dentro && !aberto && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-3 text-center text-white">
            <p className="text-2xl font-bold">Escritório virtual</p>
            <p className="max-w-sm text-sm text-white/70">Entrada, corredor e Audiovisual (protótipo). Ande até o Danilo e aperte <b>E</b>.</p>
            <button type="button" onClick={entrar} className="mt-1 flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-lg hover:bg-white/90">
              <MousePointer2 className="h-4 w-4" />Clique para entrar
            </button>
            <button type="button" onClick={onSair} className="text-xs text-white/60 hover:text-white">Voltar para o mapa</button>
          </div>
        </div>
      )}

      {/* Interação: o painel do funcionário (React por cima do mundo) */}
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
                <button type="button" onClick={() => { const id = aberto.id; onSair(); onConversar(id); }} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-white/90">
                  <MessageCircle className="h-4 w-4" />Conversar com {aberto.nome}
                </button>
              )}
              {aberto.tarefa && onAbrirTarefa && (
                <button type="button" onClick={() => { const f = aberto; onSair(); onAbrirTarefa(f); }} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
                  <PlayCircle className="h-4 w-4" />Ver ao vivo
                </button>
              )}
              <button type="button" onClick={() => { setAberto(null); entrar(); }} className={cn("ml-auto rounded-lg px-3 py-2 text-sm text-white/70 hover:text-white")}>Voltar ao escritório</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
