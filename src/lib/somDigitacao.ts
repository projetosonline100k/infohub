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
let sala: ConvolverNode | null = null;

// 2ª versão (25/10, Davi: "não está parecido"): cada batida agora tem as partes de uma máquina de verdade — a haste
// de metal batendo no rolo (estalo curtíssimo + o metal vibrando em frequências "tortas"), o baque grave do
// mecanismo e, ~25 ms depois, o tique do carro andando uma casa; tudo com um eco curto de sala (sem ele soava
// eletrônico).
function audio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    saida = ctx.createGain();
    saida.gain.value = 0.7;
    // Eco de sala: resposta de impulso curta feita de ruído que some (≈0,35 s), misturada baixinho.
    sala = ctx.createConvolver();
    const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 0.35), ctx.sampleRate);
    for (let canal = 0; canal < 2; canal++) {
      const d = ir.getChannelData(canal);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.2);
    }
    sala.buffer = ir;
    const molhado = ctx.createGain();
    molhado.gain.value = 0.16;
    saida.connect(ctx.destination);
    saida.connect(sala).connect(molhado).connect(ctx.destination);
    ruido = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return { c: ctx, n: ruido!, s: saida! };
}

/** Ruído filtrado com ataque instantâneo e queda exponencial (estalos, cliques). */
function estalo(tipo: BiquadFilterType, freq: number, q: number, volume: number, duracao: number, atraso = 0) {
  const { c, n, s } = audio();
  const t = c.currentTime + atraso;
  const fonte = c.createBufferSource();
  fonte.buffer = n;
  const filtro = c.createBiquadFilter();
  filtro.type = tipo;
  filtro.frequency.value = freq;
  filtro.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(volume, t + 0.0008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
  fonte.connect(filtro).connect(g).connect(s);
  fonte.start(t, Math.random() * 0.5, duracao + 0.02);
}

/** Metal vibrando: algumas parciais inarmônicas que somem rápido (a haste/o tipo depois de bater). */
function metal(base: number, volume: number, duracao: number, atraso = 0) {
  const { c, s } = audio();
  const t = c.currentTime + atraso;
  for (const [razao, peso, dec] of [[1, 1, 1], [2.76, 0.55, 0.7], [5.4, 0.3, 0.45], [8.93, 0.16, 0.3]] as const) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = base * razao * (0.99 + Math.random() * 0.02);
    const g = c.createGain();
    g.gain.setValueAtTime(volume * peso, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duracao * dec);
    osc.connect(g).connect(s);
    osc.start(t);
    osc.stop(t + duracao + 0.02);
  }
}

/** Baque grave do mecanismo/rolo de borracha. */
function baque(freq: number, volume: number, duracao: number, atraso = 0) {
  const { c, s } = audio();
  const t = c.currentTime + atraso;
  const osc = c.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 1.6, t);
  osc.frequency.exponentialRampToValueAtTime(freq, t + 0.012);
  const g = c.createGain();
  g.gain.setValueAtTime(volume, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duracao);
  osc.connect(g).connect(s);
  osc.start(t);
  osc.stop(t + duracao + 0.02);
}

/** O "ding" do fim de linha (sino de verdade: parciais inarmônicas e cauda longa). */
function sino(atraso = 0) {
  const { c, s } = audio();
  const t = c.currentTime + atraso;
  for (const [f, v, d] of [[1975, 0.16, 1.6], [4740, 0.07, 0.9], [7020, 0.035, 0.5], [2980, 0.05, 1.1]] as const) {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g).connect(s);
    osc.start(t);
    osc.stop(t + d + 0.05);
  }
}

export type TipoTecla = "letra" | "espaco" | "enter" | "apagar";

export function tocarTecla(tipo: TipoTecla) {
  try {
    const v = 0.85 + Math.random() * 0.3;   // cada tecla um pouco diferente, como na máquina de verdade
    const tom = 0.94 + Math.random() * 0.12;
    if (tipo === "letra") {
      estalo("highpass", 3000, 0.7, 0.9 * v, 0.012);            // a haste batendo no rolo: seco e curto
      metal(1650 * tom, 0.07 * v, 0.09);                         // o metal vibrando
      baque(120 * tom, 0.5 * v, 0.07);                           // o mecanismo / rolo de borracha
      estalo("bandpass", 1900, 1.4, 0.35 * v, 0.03, 0.004);      // corpo do estalo
      estalo("bandpass", 4200, 3, 0.22 * v, 0.018, 0.026);       // tique do carro andando uma casa
    } else if (tipo === "espaco") {
      baque(90, 0.55 * v, 0.1);
      estalo("bandpass", 1200, 1, 0.3 * v, 0.05);
      estalo("bandpass", 4200, 3, 0.25 * v, 0.018, 0.02);        // só o carro anda
    } else if (tipo === "apagar") {
      estalo("bandpass", 3600, 2, 0.35 * v, 0.02);
      baque(150, 0.2 * v, 0.04);
    } else {
      // Enter: alavanca, a catraca do carro voltando (cliques cada vez mais rápidos), o baque no fim e o sino.
      estalo("bandpass", 1500, 0.9, 0.55, 0.06);
      baque(100, 0.4, 0.09);
      let tempo = 0.07;
      for (let i = 0; i < 14; i++) {
        estalo("bandpass", 2600 + Math.random() * 800, 3.5, 0.16 + i * 0.006, 0.018, tempo);
        tempo += Math.max(0.014, 0.034 - i * 0.0016);
      }
      estalo("highpass", 2400, 0.7, 0.7, 0.02, tempo + 0.01);
      baque(85, 0.6, 0.14, tempo + 0.01);
      sino(0.03);
    }
  } catch { /* sem áudio neste aparelho: segue sem som */ }
}
