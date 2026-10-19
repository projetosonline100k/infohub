import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { isDesktop } from "@/lib/platform";
import { pararFala } from "@/lib/desktop/voz";
import { medirAudio } from "@/lib/desktop/nivelAudio";
import { gravarPorPausas, type GravadorPorPausas } from "@/lib/desktop/gravadorPorPausas";
import type { EstadoVoz } from "@/hooks/useAssistantVoz";

// Ditado (18/10/2026, Davi): segurar ⌘ sozinho = o Atlas escuta; soltar = transcreve
// (Whisper local — 19/10: em pedaços, já enquanto ele fala; gravadorPorPausas), organiza como mensagem amigável de WhatsApp (Claude rápido) e cola
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

// Registro dos passos (~/.infopro-hub/ditado.log, junto com os da tecla): id da janela, para
// ver se duas cópias do Atlas estão agindo, e o tempo de cada etapa.
const ID_JANELA = Math.random().toString(36).slice(2, 6);
const log = (evento: string, detalhe = "") =>
  void import("@tauri-apps/api/core").then(({ invoke }) => invoke("ditado_registrar", { evento, detalhe: `[${ID_JANELA}] ${detalhe}` })).catch(() => {});

// Uma gravação por vez no app inteiro, mesmo que o hook exista em mais de um lugar.
let gravandoAgora = false;

export function useDitado(ativo: boolean): EstadoVoz {
  const [estado, setEstado] = useState<EstadoVoz>(null);
  const apertado = useRef(false);
  const ocupado = useRef(false);   // transcrevendo/organizando: não começa outra gravação
  const gravacao = useRef<{ gravador: GravadorPorPausas; stream: MediaStream; pararMedidor: () => void; pedacos: Promise<string>[]; inicio: number } | null>(null);

  // Cada pedaço (cortado numa pausa) vai para o Whisper na hora — enquanto o Davi ainda fala.
  const transcreverPedaco = useCallback(async (wav: Blob) => {
    const { invoke } = await import("@tauri-apps/api/core");
    try { return (await invoke<string>("voz_transcrever", { base64: await paraBase64(wav), extensao: "wav" })).trim(); }
    catch { return ""; }
  }, []);

  const processar = useCallback(async (pedacos: Promise<string>[], segundos: number) => {
    ocupado.current = true;
    setEstado("entendendo");
    const t0 = performance.now();
    const ms = () => `${Math.round(performance.now() - t0)}ms`;
    log("processar", `${segundos.toFixed(1)}s de fala em ${pedacos.length} pedaço(s)`);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const fala = (await Promise.all(pedacos)).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      log("transcreveu", `${ms()} ${fala.split(/\s+/).length} palavras: ${fala.slice(0, 60)}`);
      if (fala.replace(/[^\p{L}\p{N}]/gu, "").length < 2) { toast("Não entendi o ditado. Pode repetir?"); return; }
      // Fala curta (até ~25 palavras) não precisa organizar: o Whisper já pontua; cola na hora.
      const curta = fala.split(/\s+/).length <= 25;
      if (!curta) setEstado("pensando");
      const texto = curta ? fala : (await invoke<string>("ditado_organizar", { texto: fala })).trim() || fala;
      if (!curta) log("organizou", ms());
      const colou = await invoke<boolean>("ditado_colar", { texto });
      log("colou", `${ms()} colou=${colou}`);
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

  const comecar = useCallback(async () => {
    log("recebeu-apertado", `apertado=${apertado.current} ocupado=${ocupado.current} gravando=${gravandoAgora}`);
    if (apertado.current || ocupado.current || gravandoAgora) return;
    apertado.current = true;
    gravandoAgora = true;
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
    const pedacos: Promise<string>[] = [];
    const gravador = gravarPorPausas(stream, (wav) => { pedacos.push(transcreverPedaco(wav)); });
    gravacao.current = { gravador, stream, pararMedidor: medirAudio(stream), pedacos, inicio: Date.now() };
    // Segurança: soltou e o aviso se perdeu? Para sozinho em 2 min.
    const esta = gravacao.current;
    window.setTimeout(() => { if (gravacao.current === esta) parar(false); }, 120_000);
    bip(990);
    setEstado("ouvindo");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- parar é estável (useCallback sem dependências)
  }, [transcreverPedaco]);

  const parar = useCallback((cancelar: boolean) => {
    apertado.current = false;
    const g = gravacao.current;
    gravacao.current = null;
    if (!g) { if (cancelar) setEstado(null); return; }
    gravandoAgora = false;
    g.pararMedidor();
    const resto = cancelar ? (g.gravador.cancelar(), null) : g.gravador.parar();
    g.stream.getTracks().forEach((t) => t.stop());
    const duracao = Date.now() - g.inicio;
    log("parou", `${duracao}ms cancelado=${cancelar} pedaços já mandados=${g.pedacos.length}`);
    if (cancelar || duracao < 600) { setEstado(null); return; }   // virou atalho ou foi sem querer
    if (resto) g.pedacos.push(transcreverPedaco(resto));
    if (!g.pedacos.length) { setEstado(null); return; }
    void processar(g.pedacos, duracao / 1000);
  }, [processar, transcreverPedaco]);

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
