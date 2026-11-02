import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { isDesktop } from "@/lib/platform";
import { falarAtlas, pararFalaAtlas, prepararAudio } from "@/lib/atlas/falaAtlas";
import { PREFIXO_VOZ, resumoParaFalar } from "@/hooks/useAssistantVoz";

// Conversa por voz com o Atlas, mãos livres (04/11, Davi: "um botão para falar com o Atlas e ele me responder em
// tempo real — e o que eu falar acontece mesmo"). Liga o microfone e fica ouvindo: quando o Davi fala e para
// (~1,2 s de silêncio), o trecho é transcrito no Mac (Whisper, voz_transcrever) e vai para a Conversa do Atlas
// como fala (🎙️). Quem atende é o ouvinte (scripts/jarvis-ouvinte.py, PROMPT_VOZ): roda o Claude com acesso ao
// sistema, consulta dados reais, conserta e executa — e grava a resposta. O Atlas confirma na hora ("deixa
// comigo"), fala o resumo da resposta quando ela chega e volta a ouvir. Enquanto ele fala, o microfone não vale
// (para não ouvir a própria voz).

export type EstadoConversa = "desligada" | "ouvindo" | "gravando" | "entendendo" | "pensando" | "falando";
export interface FalaConversa { id: string; quem: "davi" | "atlas"; texto: string }

const SILENCIO_MS = 1200;
const CONFIRMACOES = ["Deixa comigo.", "Certo, já vejo isso.", "Entendido. Um instante.", "Vou verificar agora.", "Pode deixar."];

export function useConversaAtlas() {
  const { user } = useAuth();
  const [estado, setEstadoBruto] = useState<EstadoConversa>("desligada");
  const [falas, setFalas] = useState<FalaConversa[]>([]);
  const [nivel, setNivel] = useState(0);
  const estadoRef = useRef<EstadoConversa>("desligada");
  const setEstado = (e: EstadoConversa) => { estadoRef.current = e; setEstadoBruto(e); };
  const pendentes = useRef(new Set<string>());
  const fila = useRef<string[]>([]);          // respostas esperando a vez de falar
  const recursos = useRef<{ stream: MediaStream; analisador: AnalyserNode; timer: number } | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const vad = useRef({ piso: 0.01, quadrosVoz: 0, falou: false, ultimaVoz: 0, inicioGravador: 0, descartar: false });

  const ocioso = () => (pendentes.current.size ? "pensando" : "ouvindo") as EstadoConversa;

  const novoGravador = useCallback(() => {
    const r = recursos.current;
    if (!r) return;
    const tipo = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(r.stream, tipo ? { mimeType: tipo } : undefined);
    const partes: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) partes.push(e.data); };
    rec.onstop = () => {
      const descartar = vad.current.descartar;
      vad.current.descartar = false;
      if (!descartar && partes.length) void enviar(new Blob(partes, { type: rec.mimeType || "audio/mp4" }));
    };
    rec.start();
    gravador.current = rec;
    vad.current.inicioGravador = Date.now();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  /** Troca o gravador: `descartar` joga fora o que foi gravado (silêncio, eco da própria voz). */
  const reiniciarGravador = useCallback((descartar: boolean) => {
    const rec = gravador.current;
    gravador.current = null;
    vad.current.descartar = descartar;
    if (rec && rec.state !== "inactive") rec.stop(); else vad.current.descartar = false;
    if (recursos.current) novoGravador();
  }, [novoGravador]);

  const falar = useCallback(async (texto: string) => {
    setEstado("falando");
    reiniciarGravador(true);
    try { await falarAtlas(texto, setNivel); } catch (e) { toast.error(`O Atlas não conseguiu falar: ${e instanceof Error ? e.message : String(e)}`); }
    if (!recursos.current) return;
    reiniciarGravador(true);   // o que entrou no microfone enquanto ele falava não conta
    vad.current.falou = false;
    const proxima = fila.current.shift();
    if (proxima) { void falar(proxima); return; }
    setEstado(ocioso());
  }, [reiniciarGravador]);    

  const enviar = async (audio: Blob) => {
    if (!recursos.current) return;
    if (estadoRef.current !== "falando") setEstado("entendendo");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const base64 = await new Promise<string>((ok, erro) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(",")[1] ?? "");
        r.onerror = () => erro(r.error);
        r.readAsDataURL(audio);
      });
      const extensao = audio.type.includes("mp4") ? "m4a" : "webm";
      const texto = (await invoke<string>("voz_transcrever", { base64, extensao })).trim();
      if (texto.replace(/[^\p{L}\p{N}]/gu, "").length < 2) { if (estadoRef.current === "entendendo") setEstado(ocioso()); return; }
      const { data, error } = await supabase.from("jarvis_conversa").insert({ papel: "davi", texto: PREFIXO_VOZ + texto, status: "enviada" }).select("id").single();
      if (error || !data) throw error ?? new Error("sem id");
      pendentes.current.add(data.id);
      setFalas((f) => [...f, { id: data.id, quem: "davi" as const, texto }].slice(-30));
      // Resposta imediata enquanto o Claude trabalha.
      if (estadoRef.current !== "falando") void falar(CONFIRMACOES[Math.floor(Math.random() * CONFIRMACOES.length)]);
    } catch (e) {
      if (estadoRef.current === "entendendo") setEstado(ocioso());
      toast.error(`Não consegui mandar sua fala: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const desligar = useCallback(() => {
    const r = recursos.current;
    recursos.current = null;
    if (r) { window.clearInterval(r.timer); r.stream.getTracks().forEach((t) => t.stop()); }
    vad.current.descartar = true;
    const rec = gravador.current;
    gravador.current = null;
    if (rec && rec.state !== "inactive") rec.stop();
    pararFalaAtlas();
    fila.current = [];
    setNivel(0);
    setEstado("desligada");
  }, []);

  const ligar = useCallback(async () => {
    if (recursos.current) return;
    if (!isDesktop()) { toast("A conversa por voz funciona no app do Mac (a transcrição é feita nele)."); return; }
    const ctx = prepararAudio();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      toast.error("O Atlas não tem acesso ao microfone.");
      return;
    }
    const analisador = ctx.createAnalyser();
    analisador.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analisador);
    const dados = new Uint8Array(analisador.fftSize);
    vad.current = { piso: 0.01, quadrosVoz: 0, falou: false, ultimaVoz: 0, inicioGravador: 0, descartar: false };
    const timer = window.setInterval(() => {
      analisador.getByteTimeDomainData(dados);
      let soma = 0;
      for (const v of dados) soma += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(soma / dados.length);
      const v = vad.current;
      const e = estadoRef.current;
      if (e === "falando") return;
      setNivel(Math.min(1, rms * 6));
      if (rms < v.piso * 1.6) v.piso = v.piso * 0.97 + rms * 0.03;   // ruído de fundo
      const limiar = Math.max(0.018, v.piso * 3.2);
      const agora = Date.now();
      if (rms > limiar) {
        v.quadrosVoz++;
        v.ultimaVoz = agora;
        if (!v.falou && v.quadrosVoz >= 3) { v.falou = true; setEstado("gravando"); }
      } else {
        v.quadrosVoz = 0;
        if (v.falou && agora - v.ultimaVoz > SILENCIO_MS) {
          v.falou = false;
          reiniciarGravador(false);            // fecha o trecho (vai para a transcrição) e já começa outro
          return;
        }
      }
      // Muito tempo em silêncio: recomeça a gravação (não acumula áudio à toa).
      if (!v.falou && agora - v.inicioGravador > 15000) reiniciarGravador(true);
    }, 50);
    recursos.current = { stream, analisador, timer };
    novoGravador();
    setEstado(ocioso());
    void falar(falas.length ? "Estou ouvindo." : "Olá, Davi. Estou ouvindo.");
  }, [novoGravador, reiniciarGravador, falar, falas.length]);    

  // Respostas do Claude às falas desta conversa.
  useEffect(() => {
    if (!user?.id) return;
    const canal = supabase.channel("atlas-conversa-voz")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "jarvis_conversa", filter: `user_id=eq.${user.id}` }, (ev) => {
        const nova = ev.new as { id: string; papel: string; texto: string; resposta_a: string | null };
        if (nova.papel === "davi" || !nova.resposta_a || !pendentes.current.has(nova.resposta_a)) return;
        pendentes.current.delete(nova.resposta_a);
        setFalas((f) => [...f, { id: nova.id, quem: "atlas" as const, texto: nova.texto }].slice(-30));
        if (!recursos.current) return;
        const resumo = resumoParaFalar(nova.texto);
        if (estadoRef.current === "falando") fila.current.push(resumo); else void falar(resumo);
      })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [user?.id, falar]);

  useEffect(() => () => desligar(), [desligar]);

  return { estado, falas, nivel, ligar, desligar, pararDeFalar: () => pararFalaAtlas() };
}
