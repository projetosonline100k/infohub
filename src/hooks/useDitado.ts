import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isDesktop } from "@/lib/platform";
import { pararFala } from "@/lib/desktop/voz";
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

export function useDitado(ativo: boolean): EstadoVoz {
  const [estado, setEstado] = useState<EstadoVoz>(null);
  const apertado = useRef(false);
  const cancelado = useRef(false);
  const gravador = useRef<MediaRecorder | null>(null);
  const inicio = useRef(0);

  const processar = useCallback(async (audio: Blob) => {
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
      setEstado(null);
    }
  }, []);

  const comecar = useCallback(async () => {
    if (apertado.current) return;
    apertado.current = true;
    cancelado.current = false;
    void pararFala();
    // Carrega o Whisper enquanto ele fala (se já estiver carregado, não custa nada).
    void import("@tauri-apps/api/core").then(({ invoke }) => invoke("voz_aquecer")).catch(() => {});
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      apertado.current = false;
      toast.error("O Atlas não tem acesso ao microfone.");
      return;
    }
    if (!apertado.current) { stream.getTracks().forEach((t) => t.stop()); return; }   // já soltou
    const tipo = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
    const partes: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const duracao = Date.now() - inicio.current;
      if (cancelado.current || duracao < 600 || !partes.length) { setEstado(null); return; }   // virou atalho ou foi sem querer
      void processar(new Blob(partes, { type: rec.mimeType || "audio/mp4" }));
    };
    gravador.current = rec;
    inicio.current = Date.now();
    rec.start();
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
    let desligar = () => {};
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const a = await listen("ditado-apertado", () => void comecar());
      const b = await listen("ditado-solto", () => parar(false));
      const c = await listen("ditado-cancelado", () => parar(true));
      desligar = () => { a(); b(); c(); };
    });
    return () => desligar();
  }, [ativo, comecar, parar]);

  return estado;
}
