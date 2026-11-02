import { isDesktop } from "@/lib/platform";
import { textoParaFala } from "@/lib/desktop/voz";

// Voz do Atlas na conversa (04/11, Davi: "uma voz boa mesmo, parecida com a do Homem de Ferro, sem pagar").
// A fala vem das vozes neurais grátis da Microsoft (edge-tts, comando voz_gerar no app do Mac) e é tocada aqui
// no Web Audio com um tratamento de "IA": um pouco mais grave, presença nos médios, compressão de rádio,
// um chorus curtinho (o brilho metálico do JARVIS) e uma sala pequena. Assim também sabemos a hora exata em que
// a fala termina (para voltar a ouvir) e o volume a cada instante (o orbe do Atlas pulsa com a voz).

export interface VozAtlas { id: string; nome: string; voz: string; velocidade: number; efeito: boolean }
export const VOZES_ATLAS: VozAtlas[] = [
  { id: "jarvis", nome: "Jarvis (grave, com efeito)", voz: "pt-BR-AntonioNeural", velocidade: -4, efeito: true },
  { id: "andrew", nome: "Andrew (sotaque leve, com efeito)", voz: "en-US-AndrewMultilingualNeural", velocidade: -2, efeito: true },
  { id: "antonio", nome: "Antônio (natural)", voz: "pt-BR-AntonioNeural", velocidade: 0, efeito: false },
  { id: "thalita", nome: "Thalita (natural)", voz: "pt-BR-ThalitaMultilingualNeural", velocidade: 0, efeito: false },
];
const CHAVE = "atlas:voz-conversa";
export const lerVozAtlas = (): VozAtlas => {
  try { return VOZES_ATLAS.find((v) => v.id === localStorage.getItem(CHAVE)) ?? VOZES_ATLAS[0]; } catch { return VOZES_ATLAS[0]; }
};
export const salvarVozAtlas = (id: string) => { try { localStorage.setItem(CHAVE, id); } catch { /* sem storage */ } };

let ctx: AudioContext | null = null;
/** Chamar num clique (o navegador só libera o áudio depois de um gesto). */
export function prepararAudio(): AudioContext {
  if (!ctx || ctx.state === "closed") ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

// Sala pequena: ruído que decai rápido (0,7 s), um pouco mais forte num canal para dar largura.
function sala(c: AudioContext) {
  const dur = 0.7, n = Math.floor(c.sampleRate * dur);
  const ir = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2) * (ch ? 0.9 : 1);
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  return conv;
}

let atual: { parar: () => void } | null = null;
export function pararFalaAtlas() { atual?.parar(); atual = null; window.speechSynthesis?.cancel(); }

/** Fala o texto e resolve quando termina. `aoNivel` recebe o volume (0–1) enquanto fala. */
export async function falarAtlas(texto: string, aoNivel?: (n: number) => void, voz = lerVozAtlas()): Promise<void> {
  pararFalaAtlas();
  const fala = textoParaFala(texto);
  if (!fala) return;
  if (!isDesktop()) {
    // Fora do app do Mac: a voz do navegador.
    await new Promise<void>((ok) => {
      const u = new SpeechSynthesisUtterance(fala);
      u.lang = "pt-BR"; u.rate = 1; u.pitch = 0.85;
      u.onend = () => ok(); u.onerror = () => ok();
      window.speechSynthesis.speak(u);
      atual = { parar: () => { window.speechSynthesis.cancel(); ok(); } };
    });
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const mp3 = await invoke<ArrayBuffer>("voz_gerar", { texto: fala, voz: voz.voz, velocidade: voz.velocidade });
  const c = prepararAudio();
  const buffer = await c.decodeAudioData(mp3.slice(0));
  return new Promise<void>((ok) => {
    const fonte = c.createBufferSource();
    fonte.buffer = buffer;
    const saida = c.createGain();
    const medidor = c.createAnalyser();
    medidor.fftSize = 512;
    saida.connect(medidor).connect(c.destination);
    if (voz.efeito) {
      fonte.playbackRate.value = 0.955;                // mais grave (e um tico mais calmo)
      const grave = c.createBiquadFilter(); grave.type = "highpass"; grave.frequency.value = 85;
      const corpo = c.createBiquadFilter(); corpo.type = "lowshelf"; corpo.frequency.value = 220; corpo.gain.value = 2.5;
      const presenca = c.createBiquadFilter(); presenca.type = "peaking"; presenca.frequency.value = 3200; presenca.Q.value = 0.9; presenca.gain.value = 4;
      const brilho = c.createBiquadFilter(); brilho.type = "highshelf"; brilho.frequency.value = 7500; brilho.gain.value = 2;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -22; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.12;
      fonte.connect(grave).connect(corpo).connect(presenca).connect(brilho).connect(comp);
      // Seco
      const seco = c.createGain(); seco.gain.value = 0.9;
      comp.connect(seco).connect(saida);
      // Chorus curto (metálico, bem sutil)
      const atraso = c.createDelay(0.05); atraso.delayTime.value = 0.011;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.35;
      const lfoGanho = c.createGain(); lfoGanho.gain.value = 0.0025;
      lfo.connect(lfoGanho).connect(atraso.delayTime);
      const chorus = c.createGain(); chorus.gain.value = 0.32;
      comp.connect(atraso).connect(chorus).connect(saida);
      lfo.start();
      // Sala
      const rev = sala(c); const molhado = c.createGain(); molhado.gain.value = 0.16;
      comp.connect(rev).connect(molhado).connect(saida);
      fonte.onended = () => { try { lfo.stop(); } catch { /* já parou */ } };
    } else {
      fonte.connect(saida);
    }
    const dados = new Uint8Array(medidor.fftSize);
    let quadro = 0;
    const medir = () => {
      medidor.getByteTimeDomainData(dados);
      let soma = 0;
      for (const v of dados) soma += ((v - 128) / 128) ** 2;
      aoNivel?.(Math.min(1, Math.sqrt(soma / dados.length) * 4));
      quadro = requestAnimationFrame(medir);
    };
    let acabou = false;
    const fim = () => { if (acabou) return; acabou = true; cancelAnimationFrame(quadro); aoNivel?.(0); ok(); };
    fonte.addEventListener("ended", fim);
    atual = { parar: () => { try { fonte.stop(); } catch { /* já parou */ } fim(); } };
    fonte.start();
    medir();
  });
}
