import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isDesktop } from "@/lib/platform";
import { falar, pararFala } from "@/lib/desktop/voz";

// Modo voz da orbe: segura ⌥+Espaço (atalho global, src-tauri/src/global_shortcut.rs),
// fala, solta. O áudio é transcrito no Mac (Whisper, voz_transcrever) e vira
// mensagem da Conversa com 🎙️ na frente — o ouvinte (scripts/jarvis-ouvinte.py)
// atende como sessão de trabalho contínua. Quando a resposta chega, a orbe fala
// o primeiro parágrafo (o resumo) com a voz configurada no Jarvis.
export type EstadoVoz = "ouvindo" | "entendendo" | "pensando" | null;
export const PREFIXO_VOZ = "🎙️ ";

function bip(freq: number) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator(), ganho = ctx.createGain();
    osc.frequency.value = freq;
    ganho.gain.setValueAtTime(0.0001, ctx.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
    ganho.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    osc.connect(ganho).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => void ctx.close();
  } catch { /* sem áudio */ }
}

// Só o primeiro parágrafo (o resumo pra ouvir); o resto fica escrito na Conversa.
export function resumoParaFalar(texto: string): string {
  const primeiro = texto.trim().split(/\n\s*\n/)[0] ?? "";
  return primeiro.slice(0, 700);
}

const paraBase64 = (blob: Blob) => new Promise<string>((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1] ?? "");
  r.onerror = () => erro(r.error);
  r.readAsDataURL(blob);
});

export function useAssistantVoz(userId: string | undefined): EstadoVoz {
  const [estado, setEstado] = useState<EstadoVoz>(null);
  const apertado = useRef(false);
  const gravador = useRef<MediaRecorder | null>(null);
  const inicio = useRef(0);
  const pendentes = useRef(new Set<string>());

  const enviar = useCallback(async (audio: Blob) => {
    setEstado("entendendo");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const extensao = audio.type.includes("mp4") ? "m4a" : audio.type.includes("webm") ? "webm" : "m4a";
      const texto = (await invoke<string>("voz_transcrever", { base64: await paraBase64(audio), extensao })).trim();
      if (texto.replace(/[^\p{L}\p{N}]/gu, "").length < 2) {
        setEstado(pendentes.current.size ? "pensando" : null);
        void falar("Não entendi. Pode repetir?", true);
        return;
      }
      const { data, error } = await supabase.from("jarvis_conversa")
        .insert({ papel: "davi", texto: PREFIXO_VOZ + texto, status: "enviada" }).select("id").single();
      if (error || !data) throw error ?? new Error("sem id");
      pendentes.current.add(data.id);
      setEstado("pensando");
      toast(`🎙️ ${texto}`, { duration: 4000 });
    } catch (e) {
      setEstado(pendentes.current.size ? "pensando" : null);
      toast.error(`Não consegui mandar sua fala: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  const comecar = useCallback(async () => {
    if (apertado.current) return;
    apertado.current = true;
    void pararFala();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      apertado.current = false;
      toast.error("O Jarvis não tem acesso ao microfone.");
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
      if (duracao < 500 || !partes.length) { setEstado(pendentes.current.size ? "pensando" : null); return; }   // toque sem querer
      bip(520);
      void enviar(new Blob(partes, { type: rec.mimeType || "audio/mp4" }));
    };
    gravador.current = rec;
    inicio.current = Date.now();
    rec.start();
    bip(880);
    setEstado("ouvindo");
  }, [enviar]);

  const terminar = useCallback(() => {
    apertado.current = false;
    const rec = gravador.current;
    gravador.current = null;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  // Atalho global (só chega na janela do Jarvis).
  useEffect(() => {
    if (!isDesktop()) return;
    let desligar = () => {};
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const a = await listen("voz-apertado", () => void comecar());
      const b = await listen("voz-solto", () => terminar());
      desligar = () => { a(); b(); };
    });
    return () => desligar();
  }, [comecar, terminar]);

  // Resposta do Claude a uma fala: lê o resumo em voz alta.
  useEffect(() => {
    if (!userId || !isDesktop()) return;
    const canal = supabase.channel("jarvis-voz-respostas")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "jarvis_conversa", filter: `user_id=eq.${userId}` }, (ev) => {
        const nova = ev.new as { papel: string; texto: string; resposta_a: string | null };
        if (nova.papel === "davi" || !nova.resposta_a || !pendentes.current.has(nova.resposta_a)) return;
        pendentes.current.delete(nova.resposta_a);
        void falar(resumoParaFalar(nova.texto), true);
        if (!pendentes.current.size) setEstado((e) => (e === "pensando" ? null : e));
      })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [userId]);

  return estado;
}
