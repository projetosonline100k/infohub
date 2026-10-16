import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Gravar um áudio e transcrever no Mac (Whisper local, o mesmo da voz da
// orbe: comando `voz_transcrever`). Só no app do Mac. `onTexto` recebe a fala.
const paraBase64 = (blob: Blob) => new Promise<string>((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.onerror = () => erro(r.error);
  r.readAsDataURL(blob);
});

export function useGravarAudio(onTexto: (texto: string) => void) {
  const [gravandoDesde, setGravandoDesde] = useState<number | null>(null);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const gravador = useRef<MediaRecorder | null>(null);
  const aoTexto = useRef(onTexto);
  aoTexto.current = onTexto;

  useEffect(() => () => { gravador.current?.stop(); }, []);
  useEffect(() => {
    if (gravandoDesde == null) return;
    const t = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [gravandoDesde]);

  const alternar = useCallback(async () => {
    if (gravador.current) { gravador.current.stop(); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { toast.error("Sem acesso ao microfone"); return; }
    const rec = new MediaRecorder(stream);
    const partes: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      gravador.current = null;
      setGravandoDesde(null);
      const audio = new Blob(partes, { type: rec.mimeType || "audio/mp4" });
      if (audio.size < 2000) return;
      setTranscrevendo(true);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const texto = (await invoke<string>("voz_transcrever", { base64: await paraBase64(audio), extensao: audio.type.includes("webm") ? "webm" : "m4a" })).trim();
        if (texto.replace(/[^\p{L}\p{N}]/gu, "").length < 2) { toast("Não entendi o áudio. Pode repetir?"); return; }
        aoTexto.current(texto);
      } catch (e) {
        toast.error(`Não consegui transcrever o áudio: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setTranscrevendo(false);
      }
    };
    gravador.current = rec;
    rec.start();
    setGravandoDesde(Date.now());
  }, []);

  return { gravando: gravandoDesde != null, segundos: gravandoDesde ? Math.floor((agora - gravandoDesde) / 1000) : 0, transcrevendo, alternar };
}
