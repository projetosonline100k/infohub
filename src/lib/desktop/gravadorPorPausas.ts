// Gravação em pedaços, cortados nas pausas da fala (19/10/2026, Davi: "quero bem rápido: gravar e,
// se aqui já soltasse…"). Enquanto o Davi fala, cada trecho (≥ 5 s e terminando numa pausa) já vai
// para o Whisper; ao soltar, só o último pedaço falta transcrever. O áudio sai em WAV 16 kHz mono
// (o que o Whisper usa por dentro), sem precisar de ffmpeg para decodificar.

const ALVO_HZ = 16000;
const MIN_FALA_S = 4;        // pedaço mínimo antes de cortar numa pausa
const PAUSA_S = 0.3;         // silêncio que conta como pausa (respiração entre frases)
const MAX_PEDACO_S = 25;     // corta mesmo sem pausa
const MIN_VOZ_S = 0.4;       // pedaço com menos voz que isso é descartado (o Whisper inventa frase no silêncio)

function paraWav(amostras: Float32Array, hzOrigem: number): Blob {
  // Reamostra para 16 kHz (média por janela) e grava PCM 16 bits.
  const passo = hzOrigem / ALVO_HZ;
  const n = Math.floor(amostras.length / passo);
  const dados = new DataView(new ArrayBuffer(44 + n * 2));
  const txt = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dados.setUint8(o + i, s.charCodeAt(i)); };
  txt(0, "RIFF"); dados.setUint32(4, 36 + n * 2, true); txt(8, "WAVE"); txt(12, "fmt ");
  dados.setUint32(16, 16, true); dados.setUint16(20, 1, true); dados.setUint16(22, 1, true);
  dados.setUint32(24, ALVO_HZ, true); dados.setUint32(28, ALVO_HZ * 2, true); dados.setUint16(32, 2, true); dados.setUint16(34, 16, true);
  txt(36, "data"); dados.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const de = Math.floor(i * passo), ate = Math.max(de + 1, Math.floor((i + 1) * passo));
    let soma = 0;
    for (let k = de; k < ate && k < amostras.length; k++) soma += amostras[k];
    const v = Math.max(-1, Math.min(1, soma / (ate - de)));
    dados.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([dados.buffer], { type: "audio/wav" });
}

export interface GravadorPorPausas {
  /** Para e devolve o último pedaço (null se não sobrou voz). */
  parar: () => Blob | null;
  cancelar: () => void;
  /** Segundos gravados até agora. */
  segundos: () => number;
}

export function gravarPorPausas(stream: MediaStream, aoPedaco: (wav: Blob) => void): GravadorPorPausas {
  const ctx = new AudioContext();
  const fonte = ctx.createMediaStreamSource(stream);
  // ScriptProcessor é antigo, mas funciona no WebKit (app do Mac) sem arquivo de worklet à parte.
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const mudo = ctx.createGain();
  mudo.gain.value = 0;
  let pedaco: Float32Array[] = [];
  let amostrasPedaco = 0, amostrasVoz = 0, silencio = 0, total = 0;
  let ruido = 0.004;
  let ativo = true;
  const hz = ctx.sampleRate;

  const juntar = () => {
    const tudo = new Float32Array(amostrasPedaco);
    let o = 0;
    for (const p of pedaco) { tudo.set(p, o); o += p.length; }
    return tudo;
  };
  const fechar = (): Blob | null => {
    const temVoz = amostrasVoz / hz >= MIN_VOZ_S;
    const wav = amostrasPedaco && temVoz ? paraWav(juntar(), hz) : null;
    pedaco = []; amostrasPedaco = 0; amostrasVoz = 0; silencio = 0;
    return wav;
  };

  proc.onaudioprocess = (e) => {
    if (!ativo) return;
    const entrada = e.inputBuffer.getChannelData(0);
    const copia = new Float32Array(entrada);
    let soma = 0;
    for (let i = 0; i < copia.length; i++) soma += copia[i] * copia[i];
    const rms = Math.sqrt(soma / copia.length);
    const limiar = Math.max(0.008, ruido * 3);
    if (rms < limiar) { ruido = ruido * 0.95 + rms * 0.05; silencio += copia.length; }
    else { silencio = 0; amostrasVoz += copia.length; }
    pedaco.push(copia);
    amostrasPedaco += copia.length;
    total += copia.length;
    const s = amostrasPedaco / hz;
    if ((s >= MIN_FALA_S && silencio / hz >= PAUSA_S) || s >= MAX_PEDACO_S) {
      const wav = fechar();
      if (wav) aoPedaco(wav);
    }
  };
  fonte.connect(proc);
  proc.connect(mudo).connect(ctx.destination);

  const desligar = () => {
    ativo = false;
    try { fonte.disconnect(); proc.disconnect(); } catch { /* já desligado */ }
    void ctx.close();
  };
  return {
    parar: () => { const resto = fechar(); desligar(); return resto; },
    cancelar: () => { desligar(); pedaco = []; },
    segundos: () => total / hz,
  };
}
