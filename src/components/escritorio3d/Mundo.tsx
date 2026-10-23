import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { visualDe, type Visual } from "@/components/empresa/BonecoMesa";
import { ALTURA_PAREDE, ESTACOES, PAREDES, PECAS, PORTAS, SALAS, type Estacao, type Parede, type Peca, type Porta, type Vec2 } from "./cenario";
import { texturaAlerta, texturaCanvas, texturaEtiqueta, texturaPiso, texturaPlaca, texturaResultado, texturaRosto, texturaTelaEdicao, texturaTelaMetricas } from "./texturas";

// Peças voxel: tudo é bloco (caixas), com madeira, vidro, telas que brilham e luz quente.

type V3 = [number, number, number];
function Bloco({ p, t, cor, emissivo, intensidade = 1, rugoso = 0.85, metal = 0, sombra = true, opacidade }: {
  p: V3; t: V3; cor: string; emissivo?: string; intensidade?: number; rugoso?: number; metal?: number; sombra?: boolean; opacidade?: number;
}) {
  return (
    <mesh position={p} castShadow={sombra} receiveShadow>
      <boxGeometry args={t} />
      <meshStandardMaterial color={cor} roughness={rugoso} metalness={metal} emissive={emissivo ?? "#000"} emissiveIntensity={emissivo ? intensidade : 0}
        transparent={opacidade != null} opacity={opacidade ?? 1} />
    </mesh>
  );
}

function Tela({ p, t, textura, rot = 0 }: { p: V3; t: [number, number]; textura: THREE.Texture; rot?: number }) {
  return (
    <mesh position={p} rotation={[0, rot, 0]}>
      <planeGeometry args={t} />
      <meshStandardMaterial map={textura} emissive="#ffffff" emissiveMap={textura} emissiveIntensity={0.9} toneMapped={false} />
    </mesh>
  );
}

const MADEIRA = "#9a6b45", MADEIRA_ESCURA = "#5e3f26", GRAFITE = "#1f2430";

// ---------------------------------------------------------------- salas: piso, paredes, teto
function ParedeBlocos({ parede }: { parede: Parede }) {
  const [x0, z0] = parede.de, [x1, z1] = parede.ate;
  const comp = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
  const ponto = (u: number): Vec2 => [x0 + ((x1 - x0) * u) / comp, z0 + ((z1 - z0) * u) / comp];
  const cheios: [number, number][] = [];
  let u = 0;
  for (const [a, b] of [...(parede.vaos ?? [])].sort((p, q) => p[0] - q[0])) { if (a > u) cheios.push([u, a]); u = b; }
  if (u < comp) cheios.push([u, comp]);
  const pedaco = (a: number, b: number, y0: number, y1: number, cor: string, chave: string, esp = 0.16) => {
    const [cx, cz] = ponto((a + b) / 2);
    return (
      <mesh key={chave} position={[cx, (y0 + y1) / 2, cz]} rotation={[0, ang, 0]} castShadow receiveShadow>
        <boxGeometry args={[esp, y1 - y0, b - a]} />
        <meshStandardMaterial color={cor} roughness={0.9} />
      </mesh>
    );
  };
  return (
    <group>
      {cheios.map(([a, b], k) => pedaco(a, b, 0, ALTURA_PAREDE, "#ece4d6", `c${k}`))}
      {cheios.map(([a, b], k) => pedaco(a + 0.01, b - 0.01, 0.002, 0.15, MADEIRA_ESCURA, `r${k}`, 0.22))}
      {(parede.vaos ?? []).map(([a, b], k) => pedaco(a, b, 2.6, ALTURA_PAREDE, "#ece4d6", `v${k}`))}
      {(parede.janelas ?? []).map(([a, b], k) => {
        const [cx, cz] = ponto((a + b) / 2);
        return (
          <group key={`j${k}`} position={[cx, 1.75, cz]} rotation={[0, ang + Math.PI / 2, 0]}>
            <mesh position={[0, 0, 0.09]}><planeGeometry args={[b - a, 1.5]} /><meshStandardMaterial map={texturaCidade()} emissive="#ffffff" emissiveMap={texturaCidade()} emissiveIntensity={0.55} toneMapped={false} /></mesh>
            <Bloco p={[0, 0.78, 0.1]} t={[b - a + 0.1, 0.08, 0.06]} cor={GRAFITE} />
            <Bloco p={[0, -0.78, 0.1]} t={[b - a + 0.1, 0.08, 0.06]} cor={GRAFITE} />
            <Bloco p={[0, 0, 0.1]} t={[0.06, 1.5, 0.06]} cor={GRAFITE} />
          </group>
        );
      })}
    </group>
  );
}

function texturaCidade() {
  return texturaCanvas("cidade", 256, 160, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 160); g.addColorStop(0, "#1e3a5f"); g.addColorStop(1, "#f59e0b"); c.fillStyle = g; c.fillRect(0, 0, 256, 160);
    for (let i = 0; i < 14; i++) { const w = 12 + ((i * 7) % 14), h = 40 + ((i * 29) % 80), x = i * 19; c.fillStyle = "#0f172a"; c.fillRect(x, 160 - h, w, h);
      c.fillStyle = "#fde68a"; for (let j = 0; j < h / 12; j++) if ((i + j) % 3) c.fillRect(x + 3, 160 - h + 6 + j * 12, 3, 4); }
  });
}

export function Salas() {
  const piso = useMemo(() => texturaPiso(), []);
  return (
    <group>
      {SALAS.map((s) => {
        const [x0, z0, x1, z1] = s.rect, w = x1 - x0, d = z1 - z0;
        const tex = piso.clone(); tex.needsUpdate = true; tex.repeat.set(w / 2.2, d / 2.2);
        return (
          <group key={s.id}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, 0, (z0 + z1) / 2]} receiveShadow>
              <planeGeometry args={[w, d]} />
              <meshStandardMaterial map={tex} roughness={0.75} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, ALTURA_PAREDE, (z0 + z1) / 2]}>
              <planeGeometry args={[w, d]} />
              <meshStandardMaterial color="#6e5a48" roughness={1} />
            </mesh>
          </group>
        );
      })}
      {PAREDES.map((p, k) => <ParedeBlocos key={k} parede={p} />)}
      {/* lado de fora da entrada: calçada escura */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 4]} receiveShadow><planeGeometry args={[14, 8]} /><meshStandardMaterial color="#1c1a18" /></mesh>
    </group>
  );
}

// ---------------------------------------------------------------- móveis
function Planta({ grande }: { grande?: boolean }) {
  const s = grande ? 1.35 : 1;
  const folhas: V3[] = [[0, 0.75, 0], [0.18, 0.62, 0.08], [-0.16, 0.66, -0.06], [0.06, 0.9, -0.12], [-0.08, 0.98, 0.1], [0.14, 1.05, -0.02], [-0.18, 0.84, 0.14]];
  return (
    <group scale={s}>
      <Bloco p={[0, 0.2, 0]} t={[0.42, 0.4, 0.42]} cor="#e8e2d8" />
      <Bloco p={[0, 0.41, 0]} t={[0.36, 0.04, 0.36]} cor="#4a3426" sombra={false} />
      {folhas.map((f, k) => <Bloco key={k} p={f} t={[0.26, 0.26, 0.26]} cor={["#2f9e44", "#37b24d", "#2b8a3e", "#40c057"][k % 4]} rugoso={0.7} />)}
    </group>
  );
}

function Estante() {
  const cores = ["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#f1f5f9", "#111827"];
  return (
    <group>
      <Bloco p={[0, 1.0, 0]} t={[1.7, 2.0, 0.38]} cor={MADEIRA_ESCURA} />
      {[0.35, 0.95, 1.55].map((y, n) => (
        <group key={y}>
          <Bloco p={[0, y - 0.05, 0.03]} t={[1.6, 0.04, 0.36]} cor={MADEIRA} sombra={false} />
          {Array.from({ length: 7 }, (_, k) => <Bloco key={k} p={[-0.65 + k * 0.21, y + 0.13, 0.1]} t={[0.14, 0.3 + ((k + n) % 3) * 0.04, 0.24]} cor={cores[(k + n * 2) % cores.length]} sombra={false} />)}
        </group>
      ))}
    </group>
  );
}

function EstacaoMesa({ variante, ligado, tipo }: { variante: number; ligado: boolean; tipo: Estacao["tipo"] }) {
  const telaA = useMemo(() => texturaTelaEdicao(variante), [variante]);
  const telaB = useMemo(() => (variante % 2 ? texturaTelaMetricas(variante) : texturaTelaEdicao(variante + 1)), [variante]);
  return (
    <group>
      {/* mesa (a da Diretoria é maior e escura) */}
      <Bloco p={[0, 0.74, 0]} t={[tipo === "executiva" ? 2.0 : 1.7, 0.07, 0.85]} cor={tipo === "executiva" ? MADEIRA_ESCURA : MADEIRA} rugoso={0.6} />
      {[[-0.78, -0.36], [0.78, -0.36], [-0.78, 0.36], [0.78, 0.36]].map(([x, z], k) => <Bloco key={k} p={[x, 0.36, z]} t={[0.07, 0.72, 0.07]} cor={GRAFITE} />)}
      {/* edição: dois monitores; criativa/executiva: notebook (tela virada para quem senta, em +z) */}
      {tipo !== "edicao" && (
        <group position={[0, 0.78, -0.02]}>
          <Bloco p={[0, 0, 0]} t={[0.5, 0.025, 0.34]} cor="#cbd5e1" sombra={false} />
          <group position={[0, 0.01, -0.16]} rotation={[-0.25, 0, 0]}>
            <Bloco p={[0, 0.16, 0]} t={[0.5, 0.32, 0.02]} cor="#94a3b8" />
            {ligado ? <Tela p={[0, 0.16, 0.012]} t={[0.46, 0.28]} textura={variante % 2 ? telaB : telaA} /> : null}
          </group>
        </group>
      )}
      {tipo === "edicao" && [-0.38, 0.38].map((x, k) => (
        <group key={k} position={[x, 0, -0.22]} rotation={[0, x < 0 ? 0.12 : -0.12, 0]}>
          <Bloco p={[0, 0.86, 0]} t={[0.08, 0.2, 0.08]} cor={GRAFITE} />
          <Bloco p={[0, 1.13, 0]} t={[0.7, 0.42, 0.05]} cor="#0b0d12" />
          {ligado ? <Tela p={[0, 1.13, 0.03]} t={[0.64, 0.37]} textura={k ? telaB : telaA} /> : <Bloco p={[0, 1.13, 0.03]} t={[0.64, 0.37, 0.005]} cor="#111" sombra={false} />}
        </group>
      ))}
      {/* teclado, mouse, caneca */}
      {tipo === "edicao" && <Bloco p={[0, 0.79, 0.14]} t={[0.5, 0.025, 0.16]} cor="#d1d5db" sombra={false} />}
      <Bloco p={[0.38, 0.79, 0.16]} t={[0.07, 0.03, 0.1]} cor="#d1d5db" sombra={false} />
      <Bloco p={[-0.68, 0.83, 0.18]} t={[0.1, 0.12, 0.1]} cor={["#f97316", "#38bdf8", "#f472b6", "#a3e635"][variante % 4]} sombra={false} />
      {/* cadeira (atrás da mesa, em +z) */}
      <group position={[0, 0, 0.78]}>
        <Bloco p={[0, 0.22, 0]} t={[0.08, 0.44, 0.08]} cor={GRAFITE} />
        <Bloco p={[0, 0.03, 0]} t={[0.55, 0.05, 0.55]} cor={GRAFITE} />
        <Bloco p={[0, 0.47, 0]} t={[0.55, 0.09, 0.55]} cor={tipo === "executiva" ? "#3f2a1d" : "#334155"} />
        <Bloco p={[0, 0.85, 0.27]} t={[0.55, tipo === "executiva" ? 0.9 : 0.7, 0.09]} cor={tipo === "executiva" ? "#3f2a1d" : "#334155"} />
      </group>
    </group>
  );
}

function TripeCamera() {
  return (
    <group>
      {[0, 2.1, 4.2].map((a, k) => (
        <mesh key={k} position={[Math.sin(a) * 0.22, 0.62, Math.cos(a) * 0.22]} rotation={[Math.cos(a) * 0.32, 0, -Math.sin(a) * 0.32]} castShadow>
          <boxGeometry args={[0.04, 1.3, 0.04]} /><meshStandardMaterial color={GRAFITE} />
        </mesh>
      ))}
      <Bloco p={[0, 1.38, 0]} t={[0.34, 0.24, 0.42]} cor="#111827" />
      <Bloco p={[0, 1.38, -0.28]} t={[0.18, 0.18, 0.18]} cor="#0b0d12" />
      <Bloco p={[0, 1.38, -0.375]} t={[0.12, 0.12, 0.01]} cor="#38bdf8" emissivo="#38bdf8" intensidade={1.2} sombra={false} />
      <Bloco p={[0.12, 1.53, 0.1]} t={[0.05, 0.05, 0.05]} cor="#ef4444" emissivo="#ef4444" intensidade={2} sombra={false} />
    </group>
  );
}

function Softbox() {
  return (
    <group>
      <Bloco p={[0, 0.85, 0]} t={[0.05, 1.7, 0.05]} cor={GRAFITE} />
      <group position={[0, 1.75, 0]} rotation={[-0.25, 0, 0]}>
        <Bloco p={[0, 0, 0]} t={[0.7, 0.7, 0.2]} cor="#111827" />
        <Bloco p={[0, 0, -0.11]} t={[0.62, 0.62, 0.02]} cor="#fff7e6" emissivo="#fff1d6" intensidade={2.2} sombra={false} />
      </group>
    </group>
  );
}

function Sofa() {
  return (
    <group>
      <Bloco p={[0, 0.25, 0]} t={[2.1, 0.5, 0.9]} cor="#0f766e" />
      <Bloco p={[0, 0.62, 0.36]} t={[2.1, 0.75, 0.2]} cor="#115e59" />
      <Bloco p={[-1.0, 0.45, 0]} t={[0.2, 0.5, 0.9]} cor="#115e59" />
      <Bloco p={[1.0, 0.45, 0]} t={[0.2, 0.5, 0.9]} cor="#115e59" />
      <Bloco p={[-0.5, 0.62, 0.18]} t={[0.4, 0.34, 0.12]} cor="#fbbf24" />
    </group>
  );
}

function QuadroIdeias({ tam }: { tam: Vec2 }) {
  const tex = useMemo(() => texturaCanvas("quadro-ideias", 512, 256, (c) => {
    c.fillStyle = "#f8fafc"; c.fillRect(0, 0, 512, 256);
    const notas = ["#fde047", "#f9a8d4", "#86efac", "#93c5fd", "#fdba74", "#c4b5fd"];
    for (let i = 0; i < 12; i++) { c.fillStyle = notas[i % notas.length]; c.fillRect(24 + (i % 6) * 80, 30 + Math.floor(i / 6) * 100 + (i % 2) * 10, 62, 62); }
    c.strokeStyle = "#2563eb"; c.lineWidth = 4; c.beginPath(); c.moveTo(60, 230); c.bezierCurveTo(200, 180, 300, 250, 470, 200); c.stroke();
  }), []);
  return (
    <group>
      <Bloco p={[0, 0, -0.02]} t={[tam[0] + 0.1, tam[1] + 0.1, 0.04]} cor="#9ca3af" />
      <mesh position={[0, 0, 0.005]}><planeGeometry args={tam} /><meshStandardMaterial map={tex} roughness={0.6} /></mesh>
    </group>
  );
}

function TvResultado({ tam, resultado }: { tam: Vec2; resultado: Parameters<typeof texturaResultado>[0] }) {
  const tex = useMemo(() => texturaResultado(resultado), [resultado]);
  return (
    <group>
      <Bloco p={[0, 0, -0.04]} t={[tam[0] + 0.12, tam[1] + 0.12, 0.08]} cor="#050608" />
      <Tela p={[0, 0, 0.005]} t={tam} textura={tex} />
    </group>
  );
}

function Neon({ texto, cor, tam }: { texto: string; cor: string; tam: Vec2 }) {
  const tex = useMemo(() => texturaPlaca(texto, cor, 1024, Math.round(1024 * (tam[1] / tam[0]))), [texto, cor, tam]);
  return (
    <group>
      <mesh><planeGeometry args={tam} /><meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={1.1} toneMapped={false} /></mesh>
    </group>
  );
}

function LuminariaTeto() {
  return (
    <group position={[0, ALTURA_PAREDE - 0.06, 0]}>
      <Bloco p={[0, 0, 0]} t={[1.2, 0.08, 0.4]} cor="#fff4dd" emissivo="#ffe2b0" intensidade={2.2} sombra={false} />
    </group>
  );
}

// Porta de vidro que desliza para o lado quando abre (E perto dela ou clique na mira).
function PortaDeslizante({ porta, aberta }: { porta: Porta; aberta: boolean }) {
  const folha = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!folha.current) return;
    const alvo = aberta ? porta.largura * 0.92 : 0;
    folha.current.position.x += (alvo - folha.current.position.x) * Math.min(1, dt * 6);
  });
  const giro = porta.eixo === "x" ? 0 : Math.PI / 2;
  return (
    <group position={[porta.centro[0], 0, porta.centro[1]]} rotation={[0, giro, 0]} userData={{ interativo: { tipo: "porta", id: porta.id } }}>
      <group ref={folha}><PortaVidro tam={[porta.largura, 2.6]} /></group>
    </group>
  );
}

export function Portas({ abertas }: { abertas: Set<string> }) {
  return <group>{PORTAS.map((p) => <PortaDeslizante key={p.id} porta={p} aberta={abertas.has(p.id)} />)}</group>;
}

function OrbeAtlas() {
  const esfera = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (esfera.current) { esfera.current.position.y = 1.55 + Math.sin(clock.elapsedTime * 1.6) * 0.06; esfera.current.rotation.y = clock.elapsedTime * 0.8; } });
  return (
    <group>
      <Bloco p={[0, 0.06, 0]} t={[1.1, 0.12, 1.1]} cor="#0e3a47" emissivo="#22d3ee" intensidade={0.35} />
      <mesh position={[0, 0.8, 0]}><cylinderGeometry args={[0.06, 0.32, 1.4, 6, 1, true]} /><meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.8} transparent opacity={0.25} side={THREE.DoubleSide} toneMapped={false} /></mesh>
      <group ref={esfera}>
        <mesh><icosahedronGeometry args={[0.3, 1]} /><meshStandardMaterial color="#cffafe" emissive="#67e8f9" emissiveIntensity={1.6} flatShading toneMapped={false} /></mesh>
        <mesh rotation={[1.2, 0, 0]}><torusGeometry args={[0.46, 0.015, 6, 32]} /><meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={1.4} toneMapped={false} /></mesh>
      </group>
    </group>
  );
}

function PortaVidro({ tam }: { tam: Vec2 }) {
  return (
    <group position={[0, tam[1] / 2, 0]}>
      <mesh><boxGeometry args={[tam[0], tam[1], 0.04]} /><meshStandardMaterial color="#bfe3ff" transparent opacity={0.28} roughness={0.05} metalness={0.2} /></mesh>
      <Bloco p={[0, tam[1] / 2, 0]} t={[tam[0], 0.06, 0.08]} cor={GRAFITE} />
      <Bloco p={[0, 0, 0]} t={[0.05, tam[1], 0.08]} cor={GRAFITE} />
      <Bloco p={[0.2, 0, 0.05]} t={[0.04, 0.5, 0.04]} cor="#cbd5e1" metal={0.6} rugoso={0.3} />
    </group>
  );
}

function PlacaDirecao({ texto, cor, tam }: { texto: string; cor: string; tam: Vec2 }) {
  const tex = useMemo(() => texturaPlaca(texto, cor, 1536, Math.round(1536 * (tam[1] / tam[0]))), [texto, cor, tam]);
  return (
    <group>
      {[-tam[0] / 2 + 0.2, tam[0] / 2 - 0.2].map((x) => <Bloco key={x} p={[x, 0.4, 0]} t={[0.03, 0.55, 0.03]} cor={GRAFITE} sombra={false} />)}
      <Bloco p={[0, 0, 0]} t={[tam[0] + 0.08, tam[1] + 0.08, 0.05]} cor="#0f0d0b" />
      {[0.03, -0.03].map((z, k) => (
        <mesh key={k} position={[0, 0, z]} rotation={[0, k ? Math.PI : 0, 0]}><planeGeometry args={tam} /><meshStandardMaterial map={tex} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.85} toneMapped={false} /></mesh>
      ))}
    </group>
  );
}

function Banco() {
  return <group><Bloco p={[0, 0.42, 0]} t={[1.3, 0.08, 0.45]} cor={MADEIRA} /><Bloco p={[-0.55, 0.2, 0]} t={[0.08, 0.4, 0.4]} cor={GRAFITE} /><Bloco p={[0.55, 0.2, 0]} t={[0.08, 0.4, 0.4]} cor={GRAFITE} /></group>;
}

export function Pecas({ ligadas, resultado }: { ligadas: Set<string>; resultado: Parameters<typeof texturaResultado>[0] }) {
  return (
    <group>
      {PECAS.map((p) => <PecaNoLugar key={p.id} peca={p} resultado={resultado} />)}
      {ESTACOES.map((e, k) => (
        <group key={e.id} position={[e.pos[0], 0, e.pos[1]]} rotation={[0, (e.giro * Math.PI) / 180, 0]}>
          <EstacaoMesa variante={k} ligado={ligadas.has(e.id)} tipo={e.tipo} />
        </group>
      ))}
    </group>
  );
}

function PecaNoLugar({ peca: p, resultado }: { peca: Peca; resultado: Parameters<typeof texturaResultado>[0] }) {
  const pos: V3 = [p.pos[0], p.y ?? 0, p.pos[1]];
  const rot: V3 = [0, ((p.giro ?? 0) * Math.PI) / 180, 0];
  const conteudo = (() => {
    switch (p.tipo) {
      case "planta": return <Planta />;
      case "planta_grande": return <Planta grande />;
      case "estante": return <Estante />;
      case "tripe_camera": return <TripeCamera />;
      case "softbox": return <Softbox />;
      case "fundo_verde": return <group><Bloco p={[0, (p.tam?.[1] ?? 2.8) / 2, 0.06]} t={[p.tam?.[0] ?? 3, p.tam?.[1] ?? 2.8, 0.05]} cor="#16a34a" emissivo="#16a34a" intensidade={0.25} /><Bloco p={[0, 0.01, 0.9]} t={[p.tam?.[0] ?? 3, 0.02, 1.7]} cor="#16a34a" emissivo="#16a34a" intensidade={0.15} sombra={false} /></group>;
      case "luminaria_teto": return <LuminariaTeto />;
      case "sofa": return <Sofa />;
      case "tapete": return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow><planeGeometry args={p.tam ?? [3, 2]} /><meshStandardMaterial color={p.cor ?? "#334155"} roughness={1} /></mesh>;
      case "quadro_ideias": return <QuadroIdeias tam={p.tam ?? [2.4, 1.2]} />;
      case "tv_resultado": return <TvResultado tam={p.tam ?? [2.4, 1.35]} resultado={resultado} />;
      case "neon": return <Neon texto={p.texto ?? ""} cor={p.cor ?? "#38bdf8"} tam={p.tam ?? [2, 0.5]} />;
      case "placa_direcao": return <PlacaDirecao texto={p.texto ?? ""} cor={p.cor ?? "#f59e0b"} tam={p.tam ?? [3, 0.5]} />;
      case "orbe": return <OrbeAtlas />;
      case "banco": return <Banco />;
      default: return null;
    }
  })();
  return <group position={pos} rotation={rot}>{conteudo}</group>;
}

// ---------------------------------------------------------------- funcionários voxel
export type Pose = "digitando" | "sentado" | "lendo" | "em_pe";
export function Personagem({ id, nome, pose, corStatus, alerta, posicao, giro = 0 }: {
  id: string; nome: string; pose: Pose; corStatus: string; alerta?: string | null; posicao: V3; giro?: number;
}) {
  const v: Visual = visualDe(nome);
  const rosto = useMemo(() => texturaRosto(v.pele, v.corCabelo, !!v.barba, !!v.oculos), [v.pele, v.corCabelo, v.barba, v.oculos]);
  const etiqueta = useMemo(() => texturaEtiqueta(nome, corStatus), [nome, corStatus]);
  const iconeAlerta = useMemo(() => (alerta ? texturaAlerta(alerta) : null), [alerta]);
  const bracoE = useRef<THREE.Group>(null), bracoD = useRef<THREE.Group>(null), cabeca = useRef<THREE.Group>(null), sinal = useRef<THREE.Sprite>(null);
  const fase = useMemo(() => [...nome].reduce((t, c) => t + c.charCodeAt(0), 0) % 10, [nome]);
  const sentado = pose !== "em_pe";
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + fase;
    if (pose === "digitando") {
      if (bracoE.current) bracoE.current.rotation.x = 1.15 + Math.sin(t * 14) * 0.07;
      if (bracoD.current) bracoD.current.rotation.x = 1.15 + Math.sin(t * 14 + 1.7) * 0.07;
      if (cabeca.current) cabeca.current.rotation.y = Math.sin(t * 0.6) * 0.08;
    } else if (pose === "lendo") {
      if (bracoE.current) bracoE.current.rotation.x = 1.35;
      if (bracoD.current) bracoD.current.rotation.x = 1.35;
      if (cabeca.current) cabeca.current.rotation.x = 0.28 + Math.sin(t * 0.4) * 0.03;
    } else if (cabeca.current) cabeca.current.rotation.y = Math.sin(t * 0.5) * 0.25;
    if (sinal.current) sinal.current.position.y = (sentado ? 2.3 : 2.62) + Math.sin(t * 3) * 0.06;
  });
  const quadril = sentado ? 0.5 : 0.78;
  const calca = "#2b3445", sapato = "#16181d";
  // Cabeça: o rosto fica na face -z (o personagem olha para -z).
  const matsCabeca = useMemo(() => {
    const pele = new THREE.MeshStandardMaterial({ color: v.pele, roughness: 0.8 });
    const cabelo = new THREE.MeshStandardMaterial({ color: v.corCabelo, roughness: 0.9 });
    const frente = new THREE.MeshStandardMaterial({ map: rosto, roughness: 0.8 });
    return [pele, pele, cabelo, pele, cabelo, frente];
  }, [v.pele, v.corCabelo, rosto]);
  return (
    <group position={posicao} rotation={[0, giro, 0]} userData={{ interativo: { tipo: "pessoa", id } }}>
      {/* pernas */}
      {[-0.12, 0.12].map((x) => sentado ? (
        <group key={x}>
          <Bloco p={[x, quadril, -0.24]} t={[0.22, 0.22, 0.5]} cor={calca} />
          <Bloco p={[x, quadril / 2, -0.47]} t={[0.22, quadril, 0.22]} cor={calca} />
          <Bloco p={[x, 0.05, -0.52]} t={[0.23, 0.1, 0.3]} cor={sapato} />
        </group>
      ) : (
        <group key={x}><Bloco p={[x, 0.39, 0]} t={[0.22, 0.78, 0.22]} cor={calca} /><Bloco p={[x, 0.05, -0.04]} t={[0.23, 0.1, 0.3]} cor={sapato} /></group>
      ))}
      {/* corpo */}
      <Bloco p={[0, quadril + 0.33, 0]} t={[0.5, 0.66, 0.28]} cor={v.camisa} />
      {/* braços (giram no ombro) */}
      {([[-0.34, bracoE], [0.34, bracoD]] as const).map(([x, ref]) => (
        <group key={x} ref={ref} position={[x, quadril + 0.62, 0]}>
          <Bloco p={[0, -0.27, 0]} t={[0.18, 0.56, 0.18]} cor={v.camisa} />
          <Bloco p={[0, -0.58, 0]} t={[0.16, 0.08, 0.16]} cor={v.pele} />
        </group>
      ))}
      {pose === "lendo" && <Bloco p={[0, quadril + 0.42, -0.42]} t={[0.42, 0.3, 0.05]} cor="#f8fafc" />}
      {/* cabeça e cabelo */}
      <group ref={cabeca} position={[0, quadril + 0.88, 0]}>
        <mesh material={matsCabeca} castShadow><boxGeometry args={[0.44, 0.44, 0.44]} /></mesh>
        <Bloco p={[0, 0.25, 0.02]} t={[0.48, 0.1, 0.48]} cor={v.corCabelo} />
        <Bloco p={[0, 0.02, 0.21]} t={[0.48, v.cabelo === "longo" ? 0.62 : 0.4, 0.08]} cor={v.corCabelo} />
      </group>
      {/* nome e alerta */}
      <sprite position={[0, quadril + 1.48, 0]} scale={[1.0, 0.25, 1]}><spriteMaterial map={etiqueta} transparent depthWrite={false} /></sprite>
      {iconeAlerta && <sprite ref={sinal} position={[0, 2.05, 0]} scale={[0.32, 0.32, 1]}><spriteMaterial map={iconeAlerta} transparent depthWrite={false} /></sprite>}
    </group>
  );
}
