// Som de máquina de escrever ao digitar nos documentos (25/10, Davi: "quando eu escrever, quero um som de teclado
// digitando, da máquina de datilografia"). Tudo sintetizado na hora com Web Audio (sem arquivo): tecla = estalo seco
// de metal + batida grave; espaço = batida mais macia; Enter = sino ("ding") + o carro voltando; apagar = clique leve.
// Liga/desliga na janelinha de Aparência (fica salvo neste Mac/navegador).

const CHAVE = "som-digitacao";
export const EVENTO_SOM_DIGITACAO = "infopro-som-digitacao";

export function somLigado(): boolean {
  try { return localStorage.getItem(CHAVE) !== "off"; } catch { return true; }
}
export function ligarSom(ligado: boolean) {
  try { localStorage.setItem(CHAVE, ligado ? "on" : "off"); } catch { /* sem storage */ }
  window.dispatchEvent(new CustomEvent(EVENTO_SOM_DIGITACAO, { detail: ligado }));
}

let ctx: AudioContext | null = null;
let ruido: AudioBuffer | null = null;
let saida: GainNode | null = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    saida = ctx.createGain();
    saida.gain.value = 0.55;
    saida.connect(ctx.destination);
    // 0,3 s de ruído branco: a matéria-prima dos estalos.
    ruido = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { c: ctx, n: ruido!, s: saida! };
}

/** Estalo: ruído filtrado com ataque instantâneo e queda rápida. */
function estalo(freq: number, q: number, volume: number, duracao: number, atraso = 0) {
  const { c, n, s } = audio();
  const t = c.currentTime + atraso;
  const fonte = c.createBufferSource();
  fonte.buffer = n;
  fonte.playbackRate.value = 0.9 + Math.random() * 0.2;
  const filtro = c.createBiquadFilter();
  filtro.type = "bandpass";
  filtro.frequency.value = freq;
  filtro.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
  fonte.connect(filtro).connect(g).connect(s);
  fonte.start(t, Math.random() * 0.2, duracao + 0.02);
}

/** Batida grave do tipo na fita/papel. */
function batida(freq: number, volume: number, duracao: number, atraso = 0) {
  const { c, s } = audio();
  const t = c.currentTime + atraso;
  const osc = c.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + duracao);
  const g = c.createGain();
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
  osc.connect(g).connect(s);
  osc.start(t);
  osc.stop(t + duracao + 0.02);
}

/** O "ding" do fim de linha. */
function sino(atraso = 0) {
  const { c, s } = audio();
  const t = c.currentTime + atraso;
  for (const [f, v] of [[2093, 0.18], [4186, 0.06], [3136, 0.04]] as const) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(g).connect(s);
    osc.start(t);
    osc.stop(t + 1.15);
  }
}

export type TipoTecla = "letra" | "espaco" | "enter" | "apagar";

export function tocarTecla(tipo: TipoTecla) {
  try {
    const v = 0.85 + Math.random() * 0.3;   // cada tecla um pouco diferente, como na máquina de verdade
    if (tipo === "letra") {
      estalo(2600 + Math.random() * 900, 1.2, 0.5 * v, 0.045);
      batida(140 + Math.random() * 30, 0.35 * v, 0.06);
      estalo(5200, 3, 0.12 * v, 0.02, 0.012);   // o tipo batendo no papel
    } else if (tipo === "espaco") {
      batida(95, 0.45 * v, 0.09);
      estalo(1400, 1, 0.25 * v, 0.06);
    } else if (tipo === "apagar") {
      estalo(3200, 2, 0.28 * v, 0.03);
    } else {
      // Enter: alavanca + carro deslizando + sino.
      estalo(1800, 0.8, 0.4, 0.05);
      for (let i = 0; i < 6; i++) estalo(900 + i * 120, 4, 0.12, 0.03, 0.04 + i * 0.035);
      batida(110, 0.45, 0.12, 0.26);
      sino(0.02);
    }
  } catch { /* sem áudio neste aparelho: segue sem som */ }
}
