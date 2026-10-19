import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isDesktop } from "@/lib/platform";
import { pararFala } from "@/lib/desktop/voz";
import { medirAudio } from "@/lib/desktop/nivelAudio";
import type { EstadoVoz } from "@/hooks/useAssistantVoz";

// Ditado (18/10/2026, Davi): segurar ⌘ sozinho = o Atlas escuta; soltar = transcreve
// (Whisper local), organiza como mensagem amigável de WhatsApp (Claude rápido) e cola
// onde o cursor estiver (WhatsApp, grupo, o chat do Infopro…). O monitor da tecla fica
// em src-tauri/src/ditado.rs; os estados aparecem na orbe como os do modo voz.
const paraBase64 = (blob: Blob) => new Promise<string>((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.onerror = () => erro(r.error);
  r.readAsDataURL(blob);
});

function bip(freq: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator(), ganho = ctx.createGain();
    osc.frequency.value = freq;
    ganho.gain.setValueAtTime(0.0001, ctx.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01);
    ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(ganho).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.13);
    osc.onended = () => void ctx.close();
  } catch { /* sem áudio */ }
}

// Uma gravação por vez no app inteiro, mesmo que o hook exista em mais de um lugar.
let gravandoAgora = false;

export function useDitado(ativo: boolean): EstadoVoz {
  const [estado, setEstado] = useState<EstadoVoz>(null);
  const apertado = useRef(false);
  const cancelado = useRef(false);
  const gravador = useRef<MediaRecorder | null>(null);
  const inicio = useRef(0);

  const processar = useCallback(async (audio: Blob) => {
    ocupado.current = true;
    setEstado("entendendo");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const extensao = audio.type.includes("webm") ? "webm" : "m4a";
      const fala = (await invoke<string>("voz_transcrever", { base64: await paraBase64(audio), extensao })).trim();
      if (fala.replace(/[^\p{L}\p{N}]/gu, "").length < 2) { toast("Não entendi o ditado. Pode repetir?"); return; }
      // Fala curta (até ~12 palavras) não precisa organizar: cola na hora.
      const curta = fala.split(/\s+/).length <= 12;
      if (!curta) setEstado("pensando");
      const texto = curta ? fala : (await invoke<string>("ditado_organizar", { texto: fala })).trim() || fala;
      const colou = await invoke<boolean>("ditado_colar", { texto });
      bip(660);
      if (colou) toast.success("Texto colado ✓ (também está copiado)", { duration: 2500 });
      else toast("Texto copiado: cole com ⌘V. Para colar sozinho, libere o Infopro em Ajustes → Privacidade → Acessibilidade.", { duration: 7000 });
    } catch (e) {
      toast.error(`Não consegui fazer o ditado: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      ocupado.current = false;
      setEstado(null);
    }
  }, []);

  const ocupado = useRef(false);   // transcrevendo/organizando: não começa outra gravação
  const comecar = useCallback(async () => {
    if (apertado.current || ocupado.current || gravandoAgora) return;
    apertado.current = true;
    gravandoAgora = true;
    cancelado.current = false;
    void pararFala();
    // Carrega o Whisper enquanto ele fala (se já estiver carregado, não custa nada).
    void import("@tauri-apps/api/core").then(({ invoke }) => invoke("voz_aquecer")).catch(() => {});
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      apertado.current = false;
      gravandoAgora = false;
      toast.error("O Atlas não tem acesso ao microfone.");
      return;
    }
    if (!apertado.current) { gravandoAgora = false; stream.getTracks().forEach((t) => t.stop()); return; }   // já soltou
    const tipo = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    const partes: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    const pararMedidor = medirAudio(stream);   // a órbita da orbe vibra com a voz (OndaVoz)
    rec.onstop = () => {
      gravandoAgora = false;
      pararMedidor();
      stream.getTracks().forEach((t) => t.stop());
      const duracao = Date.now() - inicio.current;
      if (cancelado.current || duracao < 600 || !partes.length) { setEstado(null); return; }   // virou atalho ou foi sem querer
      void processar(new Blob(partes, { type: rec.mimeType || "audio/mp4" }));
    };
    gravador.current = rec;
    inicio.current = Date.now();
    rec.start();
    // Segurança: soltou e o aviso se perdeu? Para sozinho em 2 min.
    window.setTimeout(() => { if (gravador.current === rec && rec.state !== "inactive") { gravador.current = null; apertado.current = false; rec.stop(); } }, 120_000);
    bip(990);
    setEstado("ouvindo");
  }, [processar]);

  const parar = useCallback((cancelar: boolean) => {
    apertado.current = false;
    cancelado.current = cancelar;
    const rec = gravador.current;
    gravador.current = null;
    if (rec && rec.state !== "inactive") rec.stop();
    else if (cancelar) setEstado(null);
  }, []);

  useEffect(() => {
    if (!ativo || !isDesktop()) return;
    // 18/10: se o efeito era desfeito antes de o listen terminar (recarga do código, StrictMode),
    // o ouvinte antigo ficava vivo e gravava junto ("solto e ele continua captando").
    let vivo = true;
    const soltar: (() => void)[] = [];
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      for (const [evento, f] of [["ditado-apertado", () => void comecar()], ["ditado-solto", () => parar(false)], ["ditado-cancelado", () => parar(true)]] as const) {
        const u = await listen(evento, f);
        if (vivo) soltar.push(u); else u();
      }
    });
    return () => { vivo = false; soltar.forEach((u) => u()); parar(true); };
  }, [ativo, comecar, parar]);

  return estado;
}
