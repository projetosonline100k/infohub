import { useEffect, useState } from "react";
import { isDesktop } from "@/lib/platform";
import { liberarEspacoHistoricos } from "@/hooks/usePersistentHistory";

// Voz do Jarvis (opção grátis): no Mac usa as vozes do sistema pelo comando
// `say` (src-tauri/src/voz.rs); fora do app desktop, a voz do navegador
// (speechSynthesis). Configuração por aparelho (localStorage), compartilhada
// entre a janela principal e a do Jarvis.
export interface ConfigVoz { ligada: boolean; voz: string; velocidade: number }

const CHAVE = "jarvis:voz";
// Thalita: voz neural da Microsoft (escolhida pelo Davi). Precisa do edge-tts
// instalado (ver src-tauri/src/voz.rs); sem ele, o Mac usa a voz padrão.
const VOZ_PADRAO = "edge:pt-BR-ThalitaMultilingualNeural";
const VOZ_ANTIGA_PADRAO = "Reed (Português (Brasil))";
const PADRAO: ConfigVoz = { ligada: false, voz: VOZ_PADRAO, velocidade: 185 };

// Nome amigável pra lista de vozes.
export function nomeDaVoz(voz: string): string {
  if (voz.startsWith("edge:")) {
    const nome = voz.replace("edge:pt-BR-", "").replace(/(Multilingual)?Neural$/, "");
    return `${nome} (natural · precisa de internet)`;
  }
  return voz.replace(/ \(Português \(Brasil\)\)/, "").replace(/ \(Português \(Portugal\)\)/, " (Portugal)") + " (Mac)";
}
const EVENTO = "jarvis-voz-config";

export function lerConfigVoz(): ConfigVoz {
  try {
    const config = { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || "{}") } as ConfigVoz;
    // Quem ficou com a voz robótica antiga (o padrão de antes) passa pra Thalita.
    if (config.voz === VOZ_ANTIGA_PADRAO) config.voz = VOZ_PADRAO;
    return config;
  } catch {
    return PADRAO;
  }
}

export function salvarConfigVoz(config: ConfigVoz) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(config));
  } catch {
    // Armazenamento cheio (históricos de desfazer grandes): libera e tenta de novo.
    liberarEspacoHistoricos(0);
    try { localStorage.setItem(CHAVE, JSON.stringify(config)); } catch { /* sem storage */ }
  }
  window.dispatchEvent(new Event(EVENTO));
}

// Acompanha a configuração (mudou aqui ou em outra janela do app).
export function useConfigVoz(): [ConfigVoz, (c: ConfigVoz) => void] {
  const [config, setConfig] = useState(lerConfigVoz);
  useEffect(() => {
    const atualizar = () => setConfig(lerConfigVoz());
    window.addEventListener(EVENTO, atualizar);
    window.addEventListener("storage", atualizar);
    return () => { window.removeEventListener(EVENTO, atualizar); window.removeEventListener("storage", atualizar); };
  }, []);
  return [config, salvarConfigVoz];
}

const ehMac = () => /Mac/i.test(navigator.platform || navigator.userAgent);

// Tira markdown/emoji/links pra fala soar natural.
export function textoParaFala(texto: string): string {
  return texto
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/^\s*([-*•]|\d+[.)])\s+/gm, "")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function falar(texto: string, forcar = false, config = lerConfigVoz()) {
  if (!config.ligada && !forcar) return;
  const fala = textoParaFala(texto);
  if (!fala) return;
  if (isDesktop() && ehMac()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("voz_falar", { texto: fala, voz: config.voz, velocidade: config.velocidade });
      return;
    } catch { /* cai pra voz do navegador */ }
  }
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(fala);
  u.lang = "pt-BR";
  u.rate = config.velocidade / 185;
  const voz = window.speechSynthesis.getVoices().find((v) => v.name === config.voz) || window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("pt"));
  if (voz) u.voice = voz;
  window.speechSynthesis.speak(u);
}

export async function pararFala() {
  if (isDesktop() && ehMac()) {
    try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("voz_parar"); } catch { /* ignora */ }
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export async function listarVozes(): Promise<string[]> {
  if (isDesktop() && ehMac()) {
    try { const { invoke } = await import("@tauri-apps/api/core"); return await invoke<string[]>("voz_listar"); } catch { /* segue */ }
  }
  if (!("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("pt")).map((v) => v.name);
}

