import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark, CheckCircle2, Download, Film, ImagePlus, Link2, Loader2, Magnet, MessageCircle, MousePointer2, Music, Palette, Pause, Play, Redo2, RotateCcw, Save, Slice,
  Trash2, Undo2, ZoomIn,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { isDesktop } from "@/lib/platform";
import { EVENTO_DESFAZER, EVENTO_REFAZER } from "@/lib/desktop/desfazer";
import { confirmar } from "@/components/DialogosGlobais";
import { ConversaEntrega } from "./ConversaEntrega";
import { cn } from "@/lib/utils";
import {
  COR_NEUTRA, PRESETS_COR, apagarIntervalo, blocosZoom, clipes, dividirLegenda, dividirMidia, dividirZoom, duracaoFinal, fecharLacuna, lacunaEm,
  paraBruto, paraFinal, previaCor, restaurarIntervalo, trechosMantidos, zoomNoFinal,
  type AjusteCor, type BlocoZoom, type Clipe, type ProjetoEdicao,
} from "@/lib/empresa/edicaoVideo";

// Mini editor do Danilo, no jeito do Premiere: player (vertical, à esquerda),
// propriedades e linha do tempo à direita (Legendas, Zoom = camada de ajuste,
// V2 imagens/vídeos, V1 vídeo, A1 voz e A2 música com a forma de onda).
// O corte é AO VIVO: dois players do bruto se revezam — enquanto um toca, o
// outro já espera parado no começo do trecho seguinte, então o corte não
// trava. Zoom e cor também aparecem na prévia (aproximados); o MP4 de verdade
// sai em "Gerar versão" (o serviço do Danilo no Mac monta).

export interface EdicaoResumo {
  id: string; titulo: string; status: string; mensagem: string | null; versao: number; final_drive: string | null; duracao: number | null;
}

type Item =
  | { tipo: "clipe"; inicio: number; fim: number; lacuna?: string }
  | { tipo: "legenda"; id: string } | { tipo: "midia"; id: string } | { tipo: "zoom"; id: string }
  | { tipo: "musica" } | { tipo: "cor" };
type Onda = { por_segundo: number; picos: number[] };
const mesmoItem = (a: Item, b: Item) => {
  if (a.tipo !== b.tipo) return false;
  if (a.tipo === "clipe") return a.inicio === (b as typeof a).inicio;
  return "id" in a ? a.id === (b as typeof a).id : true;
};

const POSICOES = {
  embaixo: { x: 240, y: 1180, w: 600, h: 460, rotulo: "Embaixo (padrão)" },
  dupla_esq: { x: 95, y: 1180, w: 425, h: 450, rotulo: "Embaixo, à esquerda" },
  dupla_dir: { x: 560, y: 1180, w: 425, h: 450, rotulo: "Embaixo, à direita" },
  centro: { x: 140, y: 700, w: 800, h: 560, rotulo: "No meio da tela" },
} as const;
const TIPOS_ZOOM: Record<BlocoZoom["tipo"], string> = { suave: "Suave (entra e sai devagar)", seco: "Seco (punch)", lento: "Lento (vai aproximando)" };
const FPS = 30;
const PREROLL = 0.5;   // s antes do corte em que o segundo player já começa a tocar escondido
const timecode = (t: number) => {
  const s = Math.max(0, t);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}:${String(Math.floor((s % 1) * FPS)).padStart(2, "0")}`;
};
// Cursor de navalha (o mesmo desenho do ícone da lâmina), com contorno pra aparecer no escuro.
const NAVALHA = "M11 16.586V19a1 1 0 0 1-1 1H2L18.37 3.63a1 1 0 1 1 3 3l-9.663 9.663a1 1 0 0 1-1.414 0L8 14";
const CURSOR_NAVALHA = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke-linecap='round' stroke-linejoin='round'><path d='${NAVALHA}' stroke='black' stroke-width='4'/><path d='${NAVALHA}' stroke='white' stroke-width='2'/></svg>`,
)}") 2 20, crosshair`;

function usePref<T>(chave: string, padrao: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(chave); return s == null ? padrao : { ...(typeof padrao === "object" ? padrao : {}), ...JSON.parse(s) } as T; } catch { return padrao; } });
  const gravar = useCallback((n: T) => { setV(n); try { localStorage.setItem(chave, JSON.stringify(n)); } catch { /* sem storage */ } }, [chave]);
  return [v, gravar];
}
function usePrefSimples<T>(chave: string, padrao: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { try { const s = localStorage.getItem(chave); return s == null ? padrao : (JSON.parse(s) as T); } catch { return padrao; } });
  const gravar = useCallback((n: T) => { setV(n); try { localStorage.setItem(chave, JSON.stringify(n)); } catch { /* sem storage */ } }, [chave]);
  return [v, gravar];
}

let baseDanilo: Promise<{ base: string; chave: string } | null> | null = null;
const carregarBase = () => (baseDanilo ??= import("@tauri-apps/api/core")
  .then(({ invoke }) => invoke<{ base: string; chave: string }>("danilo_base")).catch(() => null));

export function EditorVideo({ edicao, onFechar }: { edicao: EdicaoResumo | null; onFechar: () => void }) {
  const [cfg, setCfg] = useState<{ base: string; chave: string } | null>(null);
  const [projeto, setProjeto] = useState<ProjetoEdicao | null>(null);
  const [historico, setHistorico] = useState<ProjetoEdicao[]>([]);
  const [futuro, setFuturo] = useState<ProjetoEdicao[]>([]);
  const [mudou, setMudou] = useState(false);
  const [estado, setEstado] = useState<EdicaoResumo | null>(edicao);
  const [selecao, setSelecao] = useState<Item[]>([]);
  const [ferramenta, setFerramenta] = useState<"selecao" | "lamina">("selecao");
  const [juntar, setJuntar] = usePrefSimples<boolean>("editor-video-juntar", false);
  const [ima, setIma] = usePrefSimples<boolean>("editor-video-ima", true);
  const [alturaProps, setAlturaProps] = usePrefSimples<number>("editor-video-props", 200);
  const [pps, setPps] = useState(40);            // pixels por segundo na linha do tempo
  const [tFonte, setTFonte] = useState(0);       // tempo atual no BRUTO
  const [tocando, setTocando] = useState(false);
  const [verVersao, setVerVersao] = useState(false);
  const [larguraTela, setLarguraTela] = useState(300);
  const [onda, setOnda] = useState<Onda | null>(null);
  const [proxyPronto, setProxyPronto] = useState(false);   // cópia leve do bruto pro player (ver servidor.py, proxy)
  const [ondaMusica, setOndaMusica] = useState<Onda | null>(null);
  // Dois players do mesmo bruto: o ativo toca, a reserva espera no começo do próximo trecho.
  const vidA = useRef<HTMLVideoElement>(null);
  const vidB = useRef<HTMLVideoElement>(null);
  const ativoRef = useRef(0);
  const preparadoRef = useRef<number | null>(null);
  const colunaRef = useRef<HTMLDivElement>(null);
  const desktop = isDesktop();
  const escala = larguraTela / 1080;
  const ativo = () => (ativoRef.current === 0 ? vidA.current : vidB.current);
  const reserva = () => (ativoRef.current === 0 ? vidB.current : vidA.current);
  const mostrarAtivo = () => {
    const a = ativo(), r = reserva();
    if (a) a.style.zIndex = "0";
    if (r) { r.style.zIndex = "-1"; r.muted = true; r.playbackRate = 1; }
  };

  useEffect(() => { setEstado(edicao); setMudou(false); setHistorico([]); setFuturo([]); setSelecao([]); setVerVersao(false); setOnda(null); setOndaMusica(null); setProxyPronto(false); }, [edicao]);
  useEffect(() => { if (desktop && edicao) void carregarBase().then(setCfg); }, [desktop, edicao]);
  const url = useCallback((c: string) => (cfg && edicao ? `${cfg.base}/edicoes/${edicao.id}/${c}${c.includes("?") ? "&" : "?"}k=${cfg.chave}` : ""), [cfg, edicao]);
  // O player usa a cópia leve (proxy) quando ela existir; na primeira vez o Danilo gera em ~20 s.
  useEffect(() => {
    if (!cfg || !edicao || proxyPronto) return;
    let vivo = true;
    const ver = () => void fetch(url("proxy")).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!vivo) return;
      if (d?.pronto) setProxyPronto(true); else timer = window.setTimeout(ver, 3000);
    }).catch(() => {});
    let timer = 0;
    ver();
    return () => { vivo = false; window.clearTimeout(timer); };
  }, [cfg, edicao, url, proxyPronto]);

  // Chat com o Danilo dentro do editor (pedido do Davi, 15/10: "é importante para ele aprender
  // o que eu quero, principalmente no começo"). É a conversa da tarefa ligada à edição
  // (ConversaEntrega): o elogio vira aprendizado e o ajuste ele faz na própria edição.
  const [chatAberto, setChatAberto] = usePrefSimples<boolean>("editor-video-chat", true);
  const [conversa, setConversa] = useState<{ tarefaId: string; clienteId: string; membroId: string } | null>(null);
  useEffect(() => {
    setConversa(null);
    if (!edicao) return;
    let vivo = true;
    void (async () => {
      const { data: ed } = await supabase.from("edicoes_video").select("atividade_id, cliente_id").eq("id", edicao.id).maybeSingle();
      if (!ed?.atividade_id) return;
      const { data: d } = await supabase.from("membros").select("id").eq("cliente_id", ed.cliente_id).eq("eh_ia", true).ilike("nome", "danilo").limit(1).maybeSingle();
      if (vivo && d) setConversa({ tarefaId: ed.atividade_id, clienteId: ed.cliente_id, membroId: d.id });
    })();
    return () => { vivo = false; };
  }, [edicao]);
  const [recarga, setRecarga] = useState(0);
  const mudouRef = useRef(mudou);
  mudouRef.current = mudou;
  // O Danilo respondeu: pode ter mexido na edição. Recarrega, se o Davi não tiver mudança sem salvar.
  const danilomudou = useCallback(() => {
    if (mudouRef.current) { toast("O Danilo respondeu e pode ter mudado a edição: salve ou desfaça as suas mudanças para ver a dele."); return; }
    setRecarga((n) => n + 1);
  }, []);

  // Versão nova gerada fora do editor (o Danilo pelo chat, `danilo.py versao`): recarrega também.
  const versaoVista = useRef<number | null>(null);
  useEffect(() => {
    const v = estado?.versao ?? null;
    if (v != null && versaoVista.current != null && v > versaoVista.current) danilomudou();
    versaoVista.current = v;
  }, [estado?.versao, danilomudou]);

  useEffect(() => {
    if (!cfg || !edicao) return;
    void fetch(url(`projeto${recarga ? `?r=${recarga}` : ""}`)).then((r) => (r.ok ? r.json() : null)).then((p: ProjetoEdicao | null) => {
      // Zoom antigo (pontos) vira blocos na hora de abrir.
      if (p) setProjeto({ ...p, zooms: blocosZoom(p) }); else toast.error("Não achei o projeto dessa edição no Mac");
    });
    void fetch(url("ondas")).then((r) => (r.ok ? r.json() : null)).then((o) => { if (o) setOnda(o); }).catch(() => {});
  }, [cfg, edicao, url, recarga]);
  const arquivoMusica = projeto?.musica?.arquivo;
  useEffect(() => {
    if (!cfg || !edicao || !arquivoMusica) { setOndaMusica(null); return; }
    void fetch(url("ondas?musica=1")).then((r) => (r.ok ? r.json() : null)).then((o) => setOndaMusica(o)).catch(() => {});
  }, [cfg, edicao, url, arquivoMusica]);
  useEffect(() => {
    if (!edicao) return;
    const canal = supabase.channel(`edicao-${edicao.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "edicoes_video", filter: `id=eq.${edicao.id}` },
        (ev) => setEstado((a) => ({ ...(a as EdicaoResumo), ...(ev.new as EdicaoResumo) })))
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [edicao]);

  // A tela vertical ocupa a altura toda da coluna da esquerda (o projeto é 1080×1920).
  useEffect(() => {
    const el = colunaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLarguraTela(Math.max(180, ((el.clientHeight - 24 - 40) * 9) / 16)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [projeto, verVersao]);

  const segs = useMemo(() => (projeto ? trechosMantidos(projeto) : []), [projeto]);
  const listaClipes = useMemo(() => (projeto ? clipes(projeto, projeto.divisoes ?? []) : []), [projeto]);
  const durFinal = duracaoFinal(segs);
  const tFinal = projeto ? (paraFinal(segs, tFonte, "inicio") ?? durFinal) : 0;
  const pasta = projeto ? projeto.fonte.replace(/\/[^/]+$/, "") : "";
  const nomeFonte = projeto ? projeto.fonte.split("/").pop()! : "";
  const arquivoPlayer = proxyPronto ? "proxy.mp4" : nomeFonte;
  const tFonteRef = useRef(tFonte); tFonteRef.current = tFonte;
  const relativo = (arq: string) => (arq.startsWith(pasta + "/") ? arq.slice(pasta.length + 1) : null);
  const ocupado = estado?.status === "renderizando" || estado?.status === "aprovando";
  const zoomsFinais = useMemo(() => (projeto?.zooms ?? []).flatMap((z) => {
    const a = paraFinal(segs, z.inicio, "inicio"), b = paraFinal(segs, z.fim, "fim");
    return a != null && b != null && b - a > 0.05 ? [{ a, b, z: z.z, tipo: z.tipo }] : [];
  }), [projeto, segs]);

  // Desfazer / refazer (⌘Z / ⇧⌘Z). Refs pra não ter efeito colateral dentro de setState.
  const projRef = useRef(projeto); projRef.current = projeto;
  const histRef = useRef(historico); histRef.current = historico;
  const futRef = useRef(futuro); futRef.current = futuro;
  const alterar = useCallback((p: ProjetoEdicao) => {
    const atual = projRef.current;
    if (atual === p) return;
    if (atual) setHistorico([...histRef.current.slice(-79), atual]);
    setFuturo([]);
    setProjeto(p);
    setMudou(true);
  }, []);
  const desfazer = useCallback(() => {
    const h = histRef.current, atual = projRef.current;
    if (!h.length || !atual) return;
    setFuturo([...futRef.current, atual]);
    setHistorico(h.slice(0, -1));
    setProjeto(h[h.length - 1]);
    setMudou(true);
  }, []);
  const refazer = useCallback(() => {
    const f = futRef.current, atual = projRef.current;
    if (!f.length || !atual) return;
    setHistorico([...histRef.current, atual]);
    setFuturo(f.slice(0, -1));
    setProjeto(f[f.length - 1]);
    setMudou(true);
  }, []);
  useEffect(() => {
    if (!edicao || verVersao) return;
    const d = () => desfazer(), r = () => refazer();
    window.addEventListener(EVENTO_DESFAZER, d);
    window.addEventListener(EVENTO_REFAZER, r);
    return () => { window.removeEventListener(EVENTO_DESFAZER, d); window.removeEventListener(EVENTO_REFAZER, r); };
  }, [edicao, verVersao, desfazer, refazer]);

  // Montagem: prévia corrida só com os trechos mantidos (servidor.py, montagem).
  // Com ela pronta o player toca direto, sem pular dentro do vídeo — não trava.
  // Logo depois de um corte novo (enquanto o Danilo monta, ~4 s) vale o modo ao vivo.
  const segsQ = useMemo(() => segs.map(([a, b]) => [Math.round(a * FPS) / FPS, Math.round(b * FPS) / FPS] as [number, number]).filter(([a, b]) => b > a), [segs]);
  const chaveSegs = useMemo(() => JSON.stringify(segsQ), [segsQ]);
  const [montagem, setMontagem] = useState<{ chave: string; arquivo: string } | null>(null);
  useEffect(() => {
    if (!cfg || !edicao || !proxyPronto || !segsQ.length) return;
    let vivo = true, timer = 0;
    const pedir = () => void fetch(url("montagem"), { method: "POST", body: JSON.stringify({ segs: segsQ }) })
      .then((r) => (r.ok ? r.json() : null)).then((d) => {
        if (!vivo) return;
        if (d?.pronto) setMontagem({ chave: chaveSegs, arquivo: d.arquivo });
        else timer = window.setTimeout(pedir, 1200);
      }).catch(() => { if (vivo) timer = window.setTimeout(pedir, 3000); });
    timer = window.setTimeout(pedir, 400);
    return () => { vivo = false; window.clearTimeout(timer); };
  }, [cfg, edicao, proxyPronto, url, segsQ, chaveSegs]);
  const modoMontagem = !!montagem && montagem.chave === chaveSegs;
  const modoRef = useRef(modoMontagem); modoRef.current = modoMontagem;
  const segsQRef = useRef(segsQ); segsQRef.current = segsQ;
  const tocandoRef = useRef(tocando); tocandoRef.current = tocando;
  useEffect(() => {   // trocou de modo: o player A assume; a reserva para
    ativoRef.current = 0;
    preparadoRef.current = null;
    vidB.current?.pause();
    mostrarAtivo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoMontagem, montagem?.arquivo]);

  // Player. Com a montagem: toca corrido e converte o tempo dela pro bruto.
  // Sem ela (ao vivo): no fim de cada trecho troca pro outro player (já tocando
  // escondido no começo do trecho seguinte) em vez de pular o mesmo vídeo.
  useEffect(() => {
    if (!tocando || !projeto) return;
    let raf = 0;
    const passo = () => {
      if (modoMontagem) {
        const m = vidA.current;
        if (m) {
          const tb = paraBruto(segsQ, m.currentTime);
          m.muted = !!lacunaEm(projeto, tb);
          setTFonte(tb);
          if (m.ended) setTocando(false);
        }
        raf = requestAnimationFrame(passo);
        return;
      }
      const v = ativo();
      if (v) {
        const t = v.currentTime;
        const i = segs.findIndex(([a, b]) => t >= a - 0.08 && t < b);
        if (i < 0) {
          const prox = segs.find(([a]) => a > t);
          if (prox) v.currentTime = prox[0]; else { v.pause(); setTocando(false); }
        } else {
          const fim = segs[i][1], prox = segs[i + 1];
          const r = reserva();
          if (prox && r) {
            // Meio segundo antes do corte a reserva já começa a tocar (escondida e muda)
            // num ponto que faz ela chegar no começo do próximo trecho junto com o corte;
            // a velocidade dela vai sendo corrigida pra não adiantar nem atrasar.
            const falta = fim - t;
            const alvo = prox[0] - falta;
            if (falta <= PREROLL) {
              if (preparadoRef.current !== prox[0]) {
                r.muted = true;
                r.currentTime = Math.max(0, alvo);
                void r.play().catch(() => {});
                preparadoRef.current = prox[0];
              } else if (!r.paused) {
                r.playbackRate = Math.min(2, Math.max(0.5, 1 - (r.currentTime - alvo) * 3));
              }
            }
            if (falta <= 0.02) {
              if (r.paused || Math.abs(r.currentTime - prox[0]) > 0.15) { r.currentTime = prox[0]; void r.play().catch(() => {}); }
              r.playbackRate = 1;
              r.muted = !!lacunaEm(projeto, r.currentTime);
              v.muted = true;
              v.pause();
              ativoRef.current ^= 1;
              preparadoRef.current = null;
              mostrarAtivo();
            }
          } else if (!prox && t >= fim - 0.02) { v.pause(); setTocando(false); }
        }
        const atual = ativo()!;
        atual.muted = !!lacunaEm(projeto, atual.currentTime);
        setTFonte(atual.currentTime);
      }
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocando, projeto, segs, modoMontagem, segsQ]);
  const irParaFinal = useCallback((tf: number) => {
    const t = paraBruto(segs, Math.max(0, Math.min(durFinal, tf)));
    if (modoRef.current) {
      if (vidA.current) vidA.current.currentTime = paraFinal(segsQRef.current, t, "inicio") ?? 0;
      setTFonte(t);
      return;
    }
    const v = ativoRef.current === 0 ? vidA.current : vidB.current;
    const r = ativoRef.current === 0 ? vidB.current : vidA.current;
    if (v) v.currentTime = t;
    if (r && !r.paused) { r.pause(); r.playbackRate = 1; }   // cancela o preroll da reserva
    preparadoRef.current = null;
    setTFonte(t);
  }, [segs, durFinal]);
  const alternarPlay = useCallback(() => {
    const v = ativo();
    if (!v || !projeto) return;
    if (v.paused) {
      if (modoRef.current) { if (v.ended || v.currentTime >= v.duration - 0.05) v.currentTime = 0; }
      else if (!segs.some(([a, b]) => v.currentTime >= a - 0.08 && v.currentTime < b - 0.03)) irParaFinal(tFinal >= durFinal - 0.05 ? 0 : tFinal);
      void v.play(); setTocando(true);
    } else { vidA.current?.pause(); vidB.current?.pause(); setTocando(false); }
     
  }, [projeto, segs, irParaFinal, tFinal, durFinal]);

  // Navalha num instante do bruto: corta o vídeo e, se `tudo`, legendas, imagens e zooms que passam ali.
  const cortarEm = useCallback((t: number, alvo: Item | "tudo") => {
    const p = projRef.current;
    if (!p) return;
    let q = p;
    if (alvo === "tudo" || alvo.tipo === "clipe") {
      const d = q.divisoes ?? [];
      if (!d.some((x) => Math.abs(x - t) < 0.05)) q = { ...q, divisoes: [...d, t] };
    }
    if (alvo === "tudo") {
      for (const l of q.legendas.filter((x) => t > x.inicio && t < x.fim)) q = dividirLegenda(q, l.id, t);
      for (const m of q.midias.filter((x) => t > x.inicio && t < x.fim)) q = dividirMidia(q, m.id, t);
      for (const z of blocosZoom(q).filter((x) => t > x.inicio && t < x.fim)) q = dividirZoom(q, z.id, t);
    } else if (alvo.tipo === "legenda") q = dividirLegenda(q, alvo.id, t);
    else if (alvo.tipo === "midia") q = dividirMidia(q, alvo.id, t);
    else if (alvo.tipo === "zoom") q = dividirZoom(q, alvo.id, t);
    alterar(q);
  }, [alterar]);

  // Apaga os itens selecionados. Vídeo: junta o resto (ripple) ou deixa buraco; buraco apagado sempre fecha.
  const apagarItens = useCallback((itens: Item[], ripple: boolean) => {
    let p = projRef.current;
    if (!p || !itens.length) return;
    for (const it of itens) {
      if (it.tipo === "clipe") p = it.lacuna ? fecharLacuna(p, it.lacuna) : apagarIntervalo(p, it.inicio, it.fim, ripple);
      else if (it.tipo === "legenda") p = { ...p, legendas: p.legendas.filter((l) => l.id !== it.id) };
      else if (it.tipo === "midia") p = { ...p, midias: p.midias.filter((m) => m.id !== it.id) };
      else if (it.tipo === "zoom") p = { ...p, zooms: blocosZoom(p).filter((z) => z.id !== it.id) };
      else if (it.tipo === "musica") p = { ...p, musica: null };
    }
    alterar(p);
    setSelecao([]);
  }, [alterar]);
  const apagarSelecao = useCallback((ripple = juntar) => apagarItens(selecao, ripple), [apagarItens, selecao, juntar]);

  // Q / R: apaga do começo do trecho até a agulha / da agulha até o fim do trecho.
  const aparar = useCallback((lado: "esq" | "dir") => {
    const p = projRef.current;
    const c = listaClipes.find((k) => !k.lacuna && tFonte >= k.inicio && tFonte < k.fim);
    if (!p || !c) return;
    alterar(lado === "esq" ? apagarIntervalo(p, c.inicio, tFonte, juntar) : apagarIntervalo(p, tFonte, c.fim, juntar));
    setSelecao([]);
  }, [listaClipes, tFonte, juntar, alterar]);
  const marcar = useCallback(() => {
    const p = projRef.current;
    if (!p) return;
    const ms = p.marcadores ?? [];
    const perto = ms.find((m) => Math.abs(m - tFonte) < 0.1);
    alterar({ ...p, marcadores: perto != null ? ms.filter((m) => m !== perto) : [...ms, tFonte] });
  }, [tFonte, alterar]);
  const novoZoom = useCallback(() => {
    const p = projRef.current;
    if (!p) return;
    const z: BlocoZoom = { id: `z${Date.now()}`, inicio: tFonte, fim: paraBruto(segs, Math.min(durFinal, tFinal + 3)), z: 1.1, tipo: "suave" };
    if (z.fim - z.inicio < 0.3) return;
    alterar({ ...p, zooms: [...blocosZoom(p), z] });
    setSelecao([{ tipo: "zoom", id: z.id }]);
  }, [tFonte, segs, durFinal, tFinal, alterar]);

  // Atalhos (como no Premiere): Espaço play · V seleção · C navalha · W corta tudo na agulha · E/Delete apaga
  // · ⌘R apaga e junta · Q/R apara até a agulha · M marcador · D/F zoom da linha do tempo · ←/→ quadro (⇧ = 1 s).
  useEffect(() => {
    if (!edicao || verVersao) return;
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "TEXTAREA" || (alvo.tagName === "INPUT" && (alvo as HTMLInputElement).type !== "range") || alvo.tagName === "SELECT" || alvo.isContentEditable) return;
      const k = e.key.toLowerCase();
      const cmd = e.metaKey || e.ctrlKey;
      const feito = () => { e.preventDefault(); e.stopPropagation(); };
      if (cmd) {
        if (k === "d") { feito(); setPps((v) => Math.min(400, Math.round(v * 1.5))); }
        else if (k === "f") { feito(); setPps((v) => Math.max(4, Math.round(v / 1.5))); }
        else if (k === "r") { feito(); apagarSelecao(true); }
        else if (k === "z" && !desktop) { feito(); if (e.shiftKey) refazer(); else desfazer(); }  // no app, vem pelo menu
        return;
      }
      if (e.code === "Space") { feito(); alternarPlay(); }
      else if (k === "d") { feito(); setPps((v) => Math.min(400, Math.round(v * 1.5))); }
      else if (k === "f") { feito(); setPps((v) => Math.max(4, Math.round(v / 1.5))); }
      else if (k === "v") setFerramenta("selecao");
      else if (k === "c") setFerramenta((f) => (f === "lamina" ? "selecao" : "lamina"));
      else if (k === "w") { cortarEm(tFonte, "tudo"); toast("Cortado na agulha", { duration: 800 }); }
      else if (k === "e" || e.key === "Delete" || e.key === "Backspace") { feito(); apagarSelecao(); }
      else if (k === "q") aparar("esq");
      else if (k === "r") aparar("dir");
      else if (k === "m") marcar();
      else if (e.key === "ArrowRight") irParaFinal(tFinal + (e.shiftKey ? 1 : 1 / FPS));
      else if (e.key === "ArrowLeft") irParaFinal(tFinal - (e.shiftKey ? 1 : 1 / FPS));
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [edicao, verVersao, desktop, alternarPlay, cortarEm, tFonte, apagarSelecao, aparar, marcar, desfazer, refazer, irParaFinal, tFinal]);

  const salvar = async (gerar: boolean) => {
    if (!projeto) return false;
    const r = await fetch(url(`projeto${gerar ? "" : "?previa=0"}`), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(projeto) });
    if (!r.ok) { toast.error("Não consegui salvar no Mac"); return false; }
    setMudou(false);
    if (gerar) setEstado((a) => (a ? { ...a, status: "renderizando", mensagem: "Gerando a versão (zoom, cor e legendas)…" } : a));
    else toast.success("Salvo");
    return true;
  };
  const aprovar = async () => {
    if (!(await confirmar("Aprovar? O Danilo gera o Full HD com tudo (zoom, cor, legendas), entrega no Drive e a tarefa segue.", { botao: "Aprovar" }))) return;
    if (mudou && !(await salvar(false))) return;
    const r = await fetch(url("aprovar"), { method: "POST" });
    if (!r.ok) { toast.error("Não consegui aprovar"); return; }
    setEstado((a) => (a ? { ...a, status: "aprovando", mensagem: "Gerando a versão final…" } : a));
  };
  const fechar = async () => {
    if (mudou && !(await confirmar("Sair sem salvar as mudanças?", { botao: "Sair sem salvar", destrutivo: true }))) return;
    onFechar();
  };
  const subir = async (f: File) => {
    const r = await fetch(url(`midia?nome=${encodeURIComponent(f.name)}`), { method: "POST", body: f });
    if (!r.ok) throw new Error("upload");
    return (await r.json()).arquivo as string;
  };

  // Elementos ativos no instante atual (pra desenhar por cima do player).
  const legAtivas = projeto?.legendas.filter((l) => tFonte >= l.inicio && tFonte < l.fim) ?? [];
  const midAtivas = projeto?.midias.filter((m) => tFonte >= m.inicio && tFonte < m.fim) ?? [];
  const noBuraco = projeto ? !!lacunaEm(projeto, tFonte) : false;
  const nivelZoom = zoomNoFinal(zoomsFinais, tFinal);
  const cor = previaCor(projeto?.cor ?? "cinema", projeto?.ajuste_cor);
  const estiloVideo: React.CSSProperties = { filter: cor.filtro || undefined, transform: `scale(${nivelZoom})`, transformOrigin: "50% 32%" };
  const unico = selecao.length === 1 ? selecao[0] : null;
  const legSel = unico?.tipo === "legenda" ? projeto?.legendas.find((l) => l.id === unico.id) : undefined;
  const midSel = unico?.tipo === "midia" ? projeto?.midias.find((m) => m.id === unico.id) : undefined;
  const zoomSel = unico?.tipo === "zoom" ? projeto?.zooms?.find((z) => z.id === unico.id) : undefined;

  const arrastarDivisoria = (e: React.PointerEvent) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = alturaProps;
    const mover = (ev: PointerEvent) => setAlturaProps(Math.max(70, Math.min(450, h0 + ev.clientY - y0)));
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", () => window.removeEventListener("pointermove", mover), { once: true });
  };

  return (
    <Dialog open={!!edicao} onOpenChange={(a) => { if (!a) void fechar(); }}>
      <DialogContent className="top-[calc(50%+18px)] flex h-[88vh] w-[98vw] max-w-[98vw] flex-col gap-0 overflow-hidden border-zinc-700 bg-[#1e1e1e] p-0 text-zinc-200">
        {/* Barra de cima */}
        <div className="flex items-center gap-3 border-b border-zinc-700 bg-[#252526] px-3 py-2 pr-12">
          <Film className="h-4 w-4 text-sky-400" />
          <DialogTitle className="truncate text-sm font-semibold text-zinc-100">{edicao?.titulo}</DialogTitle>
          <span className={cn("rounded px-2 py-0.5 text-[11px]", ocupado ? "bg-amber-500/20 text-amber-300" : estado?.status === "erro" ? "bg-rose-500/20 text-rose-300" : estado?.status === "aprovado" ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700 text-zinc-300")}>
            {ocupado ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{estado?.mensagem}</span>
              : estado?.status === "erro" ? estado.mensagem : estado?.status === "aprovado" ? "Aprovado e entregue" : `Versão ${estado?.versao}${mudou ? " · não salvo" : ""}`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {conversa && <BotaoBarra onClick={() => setChatAberto(!chatAberto)} ativo={chatAberto}><MessageCircle className="h-3.5 w-3.5" />Danilo</BotaoBarra>}
            <BotaoBarra onClick={() => setVerVersao((v) => !v)} ativo={verVersao}>{verVersao ? "Voltar à montagem" : "Ver versão gerada"}</BotaoBarra>
            <BotaoBarra onClick={() => void salvar(false)} disabled={!mudou}><Save className="h-3.5 w-3.5" />Salvar</BotaoBarra>
            <BotaoBarra onClick={() => void salvar(true)} disabled={ocupado}>Gerar versão</BotaoBarra>
            <a href={url(`arquivo/${estado?.status === "aprovado" ? "final.mp4" : "previa.mp4"}`)} download className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-700"><Download className="h-3.5 w-3.5" />Baixar</a>
            <button type="button" onClick={() => void aprovar()} disabled={ocupado || estado?.status === "aprovado"}
              className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">
              <CheckCircle2 className="h-3.5 w-3.5" />Aprovar e enviar
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!desktop ? <Aviso>O editor funciona no app do Mac (o vídeo e a montagem ficam nele).</Aviso>
          : !cfg ? <Aviso>O serviço do Danilo não está ligado neste Mac.</Aviso>
          : !projeto ? <div className="flex flex-1 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          : verVersao ? (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-4">
              <video key={estado?.versao} src={url(`arquivo/previa.mp4?v=${estado?.versao}`)} controls className="h-full max-h-full rounded" />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              {/* Monitor (vertical, altura toda) */}
              <div ref={colunaRef} className="flex shrink-0 flex-col items-center border-r border-zinc-700 bg-[#151515] p-3" style={{ width: larguraTela + 24 }}>
                <div className="relative isolate shrink-0 overflow-hidden rounded bg-black" style={{ width: larguraTela, height: (larguraTela * 16) / 9 }} onClick={alternarPlay}>
                  {[vidA, vidB].map((ref, i) => (
                    <video key={i} ref={ref} src={url(`arquivo/${i === 0 && modoMontagem ? montagem!.arquivo : arquivoPlayer}`)} className="absolute inset-0 h-full w-full object-cover" preload="auto" muted={i === 1}
                      style={{ ...estiloVideo, zIndex: i === ativoRef.current ? 0 : -1 }}
                      onLoadedMetadata={(e) => {
                        const v = e.currentTarget;
                        if (i === 0 && modoRef.current) v.currentTime = paraFinal(segsQRef.current, tFonteRef.current, "inicio") ?? 0;
                        else v.currentTime = tFonteRef.current > 0 ? tFonteRef.current : segs[0]?.[0] ?? 0;
                        if (i === ativoRef.current && tocandoRef.current) void v.play().catch(() => {});   // trocou de arquivo no meio do play
                      }}
                      onEnded={() => { if (i === ativoRef.current) setTocando(false); }} />
                  ))}
                  {cor.quente !== 0 && (
                    <div className="pointer-events-none absolute inset-0"
                      style={{ background: cor.quente > 0 ? `rgba(255,150,40,${(cor.quente * 0.35).toFixed(3)})` : `rgba(40,140,255,${(-cor.quente * 0.35).toFixed(3)})`, mixBlendMode: "soft-light" }} />
                  )}
                  {noBuraco && <div className="absolute inset-0 bg-black" />}
                  {midAtivas.map((m) => {
                    const rel = relativo(m.arquivo);
                    return m.tipo === "imagem" && rel ? (
                      <img key={m.id} src={url(`arquivo/${rel}`)} alt="" className="absolute object-cover"
                        style={{ left: m.x * escala, top: m.y * escala, width: m.w * escala, height: m.h * escala, borderRadius: 34 * escala }} />
                    ) : (
                      <div key={m.id} className="absolute flex items-center justify-center bg-black/60 text-xs" style={{ left: m.x * escala, top: m.y * escala, width: m.w * escala, height: m.h * escala, borderRadius: 34 * escala }}>
                        <Film className="h-5 w-5" />
                      </div>
                    );
                  })}
                  {legAtivas.map((l) => (
                    <div key={l.id} className="pointer-events-none absolute left-0 right-0 whitespace-pre-line px-[6%] text-center font-bold leading-tight text-white"
                      style={{
                        ...(l.tipo === "head" ? { bottom: (1920 - 1110) * escala } : { top: 1080 * escala, transform: "translateY(-50%)" }),
                        fontSize: (l.tipo === "head" ? 74 : 58) * escala * 0.92,
                        textShadow: "0 0 3px #111, 0 0 3px #111, 1px 1px 2px #000, -1px -1px 2px #000",
                        fontFamily: "Arial, Helvetica, sans-serif",
                      }}>{l.texto}</div>
                  ))}
                </div>
                <div className="mt-2 flex h-8 items-center gap-3 text-xs">
                  <button type="button" onClick={() => irParaFinal(tFinal - 5)} className="rounded p-1 hover:bg-zinc-700" title="-5 s">-5s</button>
                  <button type="button" onClick={alternarPlay} className="rounded-full bg-zinc-200 p-1.5 text-zinc-900" title="Espaço">{tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
                  <button type="button" onClick={() => irParaFinal(tFinal + 5)} className="rounded p-1 hover:bg-zinc-700" title="+5 s">+5s</button>
                  <span className="font-mono text-sky-300">{timecode(tFinal)}</span><span className="font-mono text-zinc-500">/ {timecode(durFinal)}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px]", modoMontagem ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}
                    title={modoMontagem ? "Tocando a prévia já montada com os cortes (liso)" : "Montando a prévia com os cortes novos (alguns segundos); até lá pode engasgar nos cortes"}>
                    {modoMontagem ? "liso" : <span className="inline-flex items-center gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" />montando</span>}
                  </span>
                </div>
              </div>

              {/* Propriedades + linha do tempo (a divisória entre os dois arrasta) */}
              <div className="flex min-w-0 flex-1 flex-col">
                <Propriedades
                  altura={alturaProps} projeto={projeto} selecao={selecao} legSel={legSel} midSel={midSel} zoomSel={zoomSel} alterar={alterar} apagar={() => apagarSelecao()}
                  relativo={relativo} url={url} irParaFinal={irParaFinal} segs={segs} restaurarTudoEm={(a, b) => alterar(restaurarIntervalo(projeto, a, b))}
                />
                <div onPointerDown={arrastarDivisoria} title="Arraste pra aumentar a linha do tempo"
                  className="h-1.5 shrink-0 cursor-row-resize border-y border-zinc-700 bg-[#2d2d30] hover:bg-sky-600/60" />
                <LinhaDoTempo
                  projeto={projeto} segs={segs} clipes={listaClipes} durFinal={durFinal} tFinal={tFinal} pps={pps} setPps={setPps} onda={onda} ondaMusica={ondaMusica}
                  ferramenta={ferramenta} setFerramenta={setFerramenta} selecao={selecao} setSelecao={setSelecao}
                  irParaFinal={irParaFinal} cortarEm={cortarEm} alterar={alterar} desfazer={desfazer} refazer={refazer}
                  podeDesfazer={historico.length > 0} podeRefazer={futuro.length > 0} marcar={marcar} novoZoom={novoZoom}
                  juntar={juntar} setJuntar={setJuntar} ima={ima} setIma={setIma} tFonte={tFonte} subir={subir}
                />
              </div>
            </div>
          )}
        </div>
        {conversa && chatAberto && (
          // "dark": o chat segue o tema escuro do editor.
          <aside className="dark w-[330px] shrink-0 border-l border-zinc-700 bg-[#1e1e1e] p-2 text-zinc-100">
            <ConversaEntrega key={conversa.tarefaId} clienteId={conversa.clienteId} tarefaId={conversa.tarefaId} membroId={conversa.membroId}
              nome="Danilo" onDocumentoMudou={danilomudou} />
          </aside>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BotaoBarra({ children, onClick, disabled, ativo }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; ativo?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn("inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-40", ativo && "bg-zinc-700")}>{children}</button>
  );
}
function Aviso({ children }: { children: React.ReactNode }) {
  return <p className="flex flex-1 items-center justify-center text-sm text-zinc-400">{children}</p>;
}

// ---------------------------------------------------------------- propriedades
function Propriedades({ altura, projeto, selecao, legSel, midSel, zoomSel, alterar, apagar, relativo, url, irParaFinal, segs, restaurarTudoEm }: {
  altura: number; projeto: ProjetoEdicao; selecao: Item[]; legSel?: ProjetoEdicao["legendas"][number]; midSel?: ProjetoEdicao["midias"][number]; zoomSel?: BlocoZoom;
  alterar: (p: ProjetoEdicao) => void; apagar: () => void; relativo: (a: string) => string | null; url: (c: string) => string;
  irParaFinal: (t: number) => void; segs: [number, number][]; restaurarTudoEm: (a: number, b: number) => void;
}) {
  const fora = [...projeto.remocoes].sort((a, b) => a.inicio - b.inicio);
  const unico = selecao.length === 1 ? selecao[0] : null;
  const ajuste = projeto.ajuste_cor ?? COR_NEUTRA;
  const mudarZoom = (n: Partial<BlocoZoom>) => alterar({ ...projeto, zooms: (projeto.zooms ?? []).map((z) => (z.id === zoomSel?.id ? { ...z, ...n } : z)) });
  return (
    <div className="flex shrink-0 bg-[#252526] text-xs" style={{ height: altura }}>
      <div className="min-w-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {selecao.length > 1 ? (
          <>
            <p className="font-semibold text-zinc-200">{selecao.length} itens selecionados</p>
            <p className="text-zinc-400">⇧ ou ⌘ + clique soma ou tira da seleção.</p>
            <BotaoApagar onClick={apagar}>Apagar todos (E)</BotaoApagar>
          </>
        ) : unico?.tipo === "cor" ? (
          <>
            <div className="flex items-center gap-3">
              <p className="font-semibold text-fuchsia-300">Cor (Lumetri)</p>
              <select value={projeto.cor ?? "cinema"} onChange={(e) => alterar({ ...projeto, cor: e.target.value })}
                className="rounded border border-zinc-600 bg-[#1e1e1e] p-1">
                {Object.entries(PRESETS_COR).map(([id, p]) => <option key={id} value={id}>{p.rotulo}</option>)}
              </select>
              <button type="button" onClick={() => alterar({ ...projeto, ajuste_cor: COR_NEUTRA })} className="rounded px-2 py-0.5 text-zinc-400 hover:bg-zinc-700">Zerar ajustes</button>
            </div>
            <div className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-2">
              {([["exposicao", "Exposição"], ["contraste", "Contraste"], ["saturacao", "Saturação"], ["temperatura", "Temperatura (frio ↔ quente)"]] as [keyof AjusteCor, string][]).map(([k, r]) => (
                <label key={k} className="block">{r} <span className="text-zinc-500">({ajuste[k] > 0 ? "+" : ""}{ajuste[k]})</span>
                  <input type="range" min={-100} max={100} value={ajuste[k]} className="mt-1 w-full"
                    onDoubleClick={() => alterar({ ...projeto, ajuste_cor: { ...ajuste, [k]: 0 } })}
                    onChange={(e) => alterar({ ...projeto, ajuste_cor: { ...ajuste, [k]: Number(e.target.value) } })} />
                </label>
              ))}
            </div>
            <p className="text-zinc-500">A prévia é aproximada; a cor exata sai em "Gerar versão". Duplo clique no controle volta pro zero.</p>
          </>
        ) : zoomSel ? (
          <>
            <p className="font-semibold text-pink-300">Zoom (camada de ajuste)</p>
            <label className="block max-w-xs">Intensidade ({Math.round(zoomSel.z * 100)}%)
              <input type="range" min={1.02} max={1.5} step={0.01} value={zoomSel.z} className="mt-1 w-full" onChange={(e) => mudarZoom({ z: Number(e.target.value) })} />
            </label>
            <label className="block max-w-xs">Tipo
              <select value={zoomSel.tipo} onChange={(e) => mudarZoom({ tipo: e.target.value as BlocoZoom["tipo"] })} className="mt-1 w-full rounded border border-zinc-600 bg-[#1e1e1e] p-1.5">
                {Object.entries(TIPOS_ZOOM).map(([id, r]) => <option key={id} value={id}>{r}</option>)}
              </select>
            </label>
            <BotaoApagar onClick={apagar}>Tirar zoom</BotaoApagar>
          </>
        ) : legSel ? (
          <>
            <p className="font-semibold text-amber-300">{legSel.tipo === "head" ? "Headline" : "Legenda"}</p>
            <textarea value={legSel.texto} rows={legSel.tipo === "head" ? 3 : 2} autoFocus
              onChange={(e) => alterar({ ...projeto, legendas: projeto.legendas.map((l) => (l.id === legSel.id ? { ...l, texto: e.target.value } : l)) })}
              className="w-full max-w-xl rounded border border-zinc-600 bg-[#1e1e1e] p-2 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none" />
            <p className="text-zinc-500">Arraste as pontas da legenda pra ela entrar antes ou sair depois (trava na vizinha; continue puxando pra passar por cima).</p>
            <BotaoApagar onClick={apagar}>Apagar legenda</BotaoApagar>
          </>
        ) : midSel ? (
          <div className="flex gap-3">
            {midSel.tipo === "imagem" && relativo(midSel.arquivo) && <img src={url(`arquivo/${relativo(midSel.arquivo)}`)} alt="" className="h-36 w-36 shrink-0 rounded object-contain" />}
            <div className="min-w-0 flex-1 space-y-2.5">
              <p className="font-semibold text-violet-300">{midSel.tipo === "imagem" ? "Imagem" : "Vídeo"}</p>
              <p className="truncate text-zinc-400">{midSel.arquivo.split("/").pop()}</p>
              <label className="block">Posição
                <select value={(Object.entries(POSICOES).find(([, p]) => p.x === midSel.x && p.y === midSel.y)?.[0]) ?? "embaixo"}
                  onChange={(e) => { const p = POSICOES[e.target.value as keyof typeof POSICOES]; alterar({ ...projeto, midias: projeto.midias.map((m) => (m.id === midSel.id ? { ...m, x: p.x, y: p.y, w: p.w, h: p.h } : m)) }); }}
                  className="mt-1 w-full max-w-xs rounded border border-zinc-600 bg-[#1e1e1e] p-1.5">
                  {Object.entries(POSICOES).map(([id, p]) => <option key={id} value={id}>{p.rotulo}</option>)}
                </select>
              </label>
              <BotaoApagar onClick={apagar}>Tirar do vídeo</BotaoApagar>
            </div>
          </div>
        ) : unico?.tipo === "musica" && projeto.musica ? (
          <>
            <p className="font-semibold text-emerald-300">Música</p>
            <p className="truncate text-zinc-400">{projeto.musica.arquivo.split("/").pop()}</p>
            <label className="block max-w-xs">Volume ({Math.round((projeto.musica.volume / 0.3) * 100)}%)
              <input type="range" min={0.01} max={0.3} step={0.01} value={projeto.musica.volume} className="mt-1 w-full"
                onChange={(e) => alterar({ ...projeto, musica: { ...projeto.musica!, volume: Number(e.target.value) } })} />
            </label>
            <BotaoApagar onClick={apagar}>Tirar música</BotaoApagar>
          </>
        ) : unico?.tipo === "clipe" ? (
          <>
            <p className="font-semibold text-sky-300">{unico.lacuna ? "Buraco (preto e mudo)" : "Trecho do vídeo"}</p>
            <p className="text-zinc-400">{(unico.fim - unico.inicio).toFixed(1)}s · no bruto em {timecode(unico.inicio)}</p>
            <BotaoApagar onClick={apagar}>{unico.lacuna ? "Fechar o buraco (E)" : "Apagar trecho (E)"}</BotaoApagar>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-zinc-400">
            <p className="col-span-2 font-semibold text-zinc-300">Atalhos</p>
            <p><b>Espaço</b> play/pausa · <b>←/→</b> quadro (<b>⇧</b> 1 s)</p>
            <p><b>V</b> seleção · <b>C</b> navalha</p>
            <p><b>W</b> corta tudo na agulha</p>
            <p><b>E</b> apaga · <b>⌘R</b> apaga e junta</p>
            <p><b>Q</b> apaga até a agulha · <b>R</b> da agulha pra frente</p>
            <p><b>M</b> marcador · <b>D</b>/<b>F</b> zoom +/−</p>
            <p><b>⌘Z</b> desfaz · <b>⇧⌘Z</b> refaz</p>
            <p><b>⇧/⌘ + clique</b> seleciona vários</p>
          </div>
        )}
      </div>
      <div className="w-72 shrink-0 overflow-y-auto border-l border-zinc-700 p-3">
        <p className="mb-1.5 font-semibold text-zinc-300">Fora do vídeo ({fora.length})</p>
        <div className="space-y-1">
          {fora.map((r) => (
            <div key={r.id} className="flex items-center gap-1.5 rounded bg-[#1e1e1e] px-1.5 py-1">
              <span className={cn("rounded px-1 text-[10px]", r.origem === "davi" ? "bg-sky-500/25 text-sky-200" : "bg-zinc-700")}>{r.origem === "davi" ? "você" : "Danilo"}</span>
              <span className="flex-1 truncate">{(r.fim - r.inicio).toFixed(1)}s · {r.motivo}</span>
              <button type="button" title="Restaurar" onClick={() => { restaurarTudoEm(r.inicio, r.fim); const tf = paraFinal(segs, r.inicio, "inicio"); if (tf != null) irParaFinal(tf); }}
                className="rounded p-0.5 hover:bg-zinc-700"><RotateCcw className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function BotaoApagar({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded border border-rose-500/40 px-2 py-1 text-rose-300 hover:bg-rose-500/10"><Trash2 className="h-3 w-3" />{children}</button>;
}

// ---------------------------------------------------------------- linha do tempo
type TipoArraste = "agulha" | "borda-esq" | "borda-dir" | "mover-midia" | "borda-midia" | "leg-esq" | "leg-dir" | "mover-zoom" | "zoom-esq" | "zoom-dir";
type Arraste = { tipo: TipoArraste; alvo: string | Clipe | null; x0: number; base: number; dt: number; limite?: number };
const ROT = 88;   // largura da coluna com o nome das faixas
const TRAVA_PX = 30;   // quanto precisa "insistir" pra passar da legenda vizinha
const ALTURAS = { leg: 36, zoom: 26, v2: 36, v1: 48, a1: 64, a2: 44 };
type Faixas = typeof ALTURAS;

function LinhaDoTempo({
  projeto, segs, clipes: lista, durFinal, tFinal, pps, setPps, onda, ondaMusica, ferramenta, setFerramenta, selecao, setSelecao, irParaFinal, cortarEm, alterar,
  desfazer, refazer, podeDesfazer, podeRefazer, marcar, novoZoom, juntar, setJuntar, ima, setIma, tFonte, subir,
}: {
  projeto: ProjetoEdicao; segs: [number, number][]; clipes: Clipe[]; durFinal: number; tFinal: number; pps: number; setPps: (n: number) => void;
  onda: Onda | null; ondaMusica: Onda | null;
  ferramenta: "selecao" | "lamina"; setFerramenta: (f: "selecao" | "lamina") => void; selecao: Item[]; setSelecao: (s: Item[]) => void;
  irParaFinal: (t: number) => void; cortarEm: (t: number, alvo: Item | "tudo") => void; alterar: (p: ProjetoEdicao) => void;
  desfazer: () => void; refazer: () => void; podeDesfazer: boolean; podeRefazer: boolean; marcar: () => void; novoZoom: () => void;
  juntar: boolean; setJuntar: (v: boolean) => void; ima: boolean; setIma: (v: boolean) => void; tFonte: number; subir: (f: File) => Promise<string>;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [arraste, setArraste] = useState<Arraste | null>(null);
  const [guia, setGuia] = useState<number | null>(null);          // linha amarela do ímã
  const [mira, setMira] = useState<number | null>(null);          // onde a navalha vai cortar
  const [alt, setAlt] = usePref<Faixas>("editor-video-faixas", ALTURAS);
  const largura = Math.max(durFinal * pps + 200, 600);
  const lamina = ferramenta === "lamina";
  const zooms = projeto.zooms ?? [];
  const xParaT = (clientX: number) => {
    const el = areaRef.current!;
    return (clientX - el.getBoundingClientRect().left + el.scrollLeft - ROT) / pps;
  };
  const intervaloFinal = useCallback((a: number, b: number) => {
    const s = paraFinal(segs, a, "inicio"), e = paraFinal(segs, b, "fim");
    return s != null && e != null && e - s > 0.05 ? [s, e] as const : null;
  }, [segs]);

  // Zoom da linha do tempo (D/F, ⌘D/⌘F, régua): fica ancorado na agulha (ou no meio, se ela não estiver na tela).
  const ppsAnt = useRef(pps);
  useLayoutEffect(() => {
    const el = areaRef.current, ant = ppsAnt.current;
    ppsAnt.current = pps;
    if (!el || ant === pps) return;
    const xAgulha = ROT + tFinal * ant - el.scrollLeft;
    const visivel = xAgulha >= ROT && xAgulha <= el.clientWidth;
    const meio = ROT + (el.clientWidth - ROT) / 2;
    const ancora = visivel ? tFinal : (el.scrollLeft + meio - ROT) / ant;
    el.scrollLeft = Math.max(0, ROT + ancora * pps - (visivel ? xAgulha : meio));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pps]);

  // Ímã: pontas de trechos, legendas, imagens, zooms, marcadores e a agulha (no tempo final).
  const pontos = useMemo(() => {
    const ps: number[] = [0, durFinal];
    for (const c of lista) ps.push(c.posFinal, c.posFinal + (c.fim - c.inicio));
    for (const x of [...projeto.legendas, ...projeto.midias, ...(projeto.zooms ?? [])]) { const iv = intervaloFinal(x.inicio, x.fim); if (iv) ps.push(iv[0], iv[1]); }
    for (const m of projeto.marcadores ?? []) { const t = paraFinal(segs, m, "inicio"); if (t != null) ps.push(t); }
    return ps;
  }, [lista, projeto, segs, durFinal, intervaloFinal]);
  const encaixar = (t: number, comAgulha: boolean, ignorar?: number) => {
    if (!ima) return { t, guia: null as number | null };
    let melhor: number | null = null;
    for (const p of comAgulha ? [...pontos, tFinal] : pontos) {
      if (ignorar != null && Math.abs(p - ignorar) < 1e-6) continue;
      if (Math.abs(p - t) * pps <= 8 && (melhor == null || Math.abs(p - t) < Math.abs(melhor - t))) melhor = p;
    }
    return melhor == null ? { t, guia: null } : { t: melhor, guia: melhor };
  };
  const encaixarRef = useRef(encaixar); encaixarRef.current = encaixar;
  const irRef = useRef(irParaFinal); irRef.current = irParaFinal;
  const xParaTRef = useRef(xParaT); xParaTRef.current = xParaT;

  // Agulha acompanha durante o play.
  useEffect(() => {
    const el = areaRef.current;
    if (!el || arraste?.tipo === "agulha") return;
    const x = tFinal * pps + ROT;
    if (x < el.scrollLeft + ROT || x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, x - 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tFinal]);

  // Arrastes: agulha (segurar e mover na régua), pontas, imagens, zooms. Acompanha o mouse e, ao soltar, aplica UMA vez.
  const arrasteRef = useRef(arraste); arrasteRef.current = arraste;
  const aplicarRef = useRef<(a: Arraste) => void>(() => {});
  aplicarRef.current = (a) => {
    if (a.tipo === "agulha" || Math.abs(a.dt) < 0.02) return;
    if (a.tipo === "borda-dir" || a.tipo === "borda-esq") {
      const c = a.alvo as Clipe;
      if (a.tipo === "borda-dir") alterar(a.dt < 0 ? apagarIntervalo(projeto, c.fim + a.dt, c.fim, juntar) : restaurarIntervalo(projeto, c.fim, Math.min(projeto.duracao_fonte, c.fim + a.dt)));
      else alterar(a.dt > 0 ? apagarIntervalo(projeto, c.inicio, c.inicio + a.dt, juntar) : restaurarIntervalo(projeto, Math.max(0, c.inicio + a.dt), c.inicio));
      return;
    }
    const t = paraBruto(segs, Math.max(0, a.base + a.dt));
    if (a.tipo === "leg-esq" || a.tipo === "leg-dir") {
      alterar({ ...projeto, legendas: projeto.legendas.map((l) => (l.id !== a.alvo ? l
        : a.tipo === "leg-esq" ? { ...l, inicio: Math.min(t, l.fim - 0.1) } : { ...l, fim: Math.max(t, l.inicio + 0.1) })) });
      return;
    }
    if (a.tipo === "mover-zoom" || a.tipo === "zoom-esq" || a.tipo === "zoom-dir") {
      alterar({ ...projeto, zooms: zooms.map((z) => {
        if (z.id !== a.alvo) return z;
        if (a.tipo === "zoom-esq") return { ...z, inicio: Math.min(t, z.fim - 0.2) };
        if (a.tipo === "zoom-dir") return { ...z, fim: Math.max(t, z.inicio + 0.2) };
        const iv = intervaloFinal(z.inicio, z.fim);
        if (!iv) return z;
        return { ...z, inicio: t, fim: paraBruto(segs, Math.min(durFinal, a.base + a.dt + (iv[1] - iv[0]))) };
      }) });
      return;
    }
    const m = projeto.midias.find((x) => x.id === a.alvo);
    if (!m) return;
    const novo = a.tipo === "mover-midia" ? { inicio: t, fim: t + (m.fim - m.inicio) } : { fim: Math.max(m.inicio + 0.5, t) };
    alterar({ ...projeto, midias: projeto.midias.map((x) => (x.id === m.id ? { ...x, ...novo } : x)) });
  };
  const arrastando = !!arraste;
  useEffect(() => {
    if (!arrastando) return;
    const mover = (e: PointerEvent) => {
      const a = arrasteRef.current;
      if (!a) return;
      if (a.tipo === "agulha") {
        const { t, guia: g } = encaixarRef.current(Math.max(0, xParaTRef.current(e.clientX)), false);
        setGuia(g);
        irRef.current(t);
        return;
      }
      let { t, guia: g } = encaixarRef.current(a.base + (e.clientX - a.x0) / pps, true, a.base);
      // Legenda trava ao encostar na vizinha; insistindo (TRAVA_PX), passa por cima.
      if (a.limite != null) {
        const passou = a.tipo === "leg-dir" ? t - a.limite : a.limite - t;
        if (passou > 0 && passou * pps < TRAVA_PX) { t = a.limite; g = a.limite; }
      }
      setGuia(g);
      setArraste({ ...a, dt: t - a.base });
    };
    const soltar = () => {
      const a = arrasteRef.current;
      setArraste(null);
      setGuia(null);
      if (a) aplicarRef.current(a);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar, { once: true });
    return () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); };
  }, [arrastando, pps]);

  const segurarAgulha = (e: React.PointerEvent) => {
    e.preventDefault();
    const { t } = encaixar(Math.max(0, xParaT(e.clientX)), false);
    irParaFinal(t);
    setArraste({ tipo: "agulha", alvo: null, x0: e.clientX, base: t, dt: 0 });
  };
  // Clique num item: seleciona (⇧/⌘ soma ou tira) ou, com a navalha, corta ali.
  const clicarItem = (e: React.PointerEvent, it: Item, tBruto?: () => number) => {
    e.stopPropagation();
    if (lamina) {
      if (mira == null) return;
      cortarEm(tBruto ? tBruto() : paraBruto(segs, mira), it);
      return;
    }
    if (e.shiftKey || e.metaKey) setSelecao(selecao.some((s) => mesmoItem(s, it)) ? selecao.filter((s) => !mesmoItem(s, it)) : [...selecao, it]);
    else setSelecao([it]);
  };
  const selecionado = (it: Item) => selecao.some((s) => mesmoItem(s, it));
  // Limite da legenda vizinha (no tempo final) pra trava.
  const limiteLegenda = (id: string, lado: "esq" | "dir", iv: readonly [number, number]) => {
    let lim: number | undefined;
    for (const o of projeto.legendas) {
      if (o.id === id) continue;
      const ov = intervaloFinal(o.inicio, o.fim);
      if (!ov) continue;
      if (lado === "dir" && ov[0] >= iv[1] - 0.01 && (lim == null || ov[0] < lim)) lim = ov[0];
      if (lado === "esq" && ov[1] <= iv[0] + 0.01 && (lim == null || ov[1] > lim)) lim = ov[1];
    }
    return lim;
  };

  // Imagens que entram ao mesmo tempo (ex.: as 2 da abertura) ficam em linhas separadas na V2.
  const linhasMidia = new Map<string, number>();
  const fimDaLinha: number[] = [];
  for (const m of [...projeto.midias].sort((a, b) => a.inicio - b.inicio)) {
    let l = fimDaLinha.findIndex((f) => f <= m.inicio + 0.01);
    if (l < 0) { l = fimDaLinha.length; fimDaLinha.push(0); }
    fimDaLinha[l] = m.fim;
    linhasMidia.set(m.id, l);
  }
  const nLinhasMidia = Math.max(1, fimDaLinha.length);
  const passo = pps >= 120 ? 0.5 : pps >= 60 ? 1 : pps >= 25 ? 2 : pps >= 10 ? 5 : 10;
  const bloco = (ini: number, fim: number) => ({ left: ini * pps, width: Math.max(4, (fim - ini) * pps) });
  const borda = "absolute top-0 z-10 h-full w-2 cursor-ew-resize hover:bg-white/50";
  const faixa = (k: keyof Faixas, nome: string, filhos: React.ReactNode) => (
    <Faixa nome={nome} altura={alt[k]} onAltura={(h) => setAlt({ ...alt, [k]: h })}>{filhos}</Faixa>
  );
  const laneH = (alt.v2 - 4) / nLinhasMidia;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#1e1e1e]">
      {/* Ferramentas */}
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-700 bg-[#252526] px-2 py-1 text-xs">
        <BotaoFerr ativo={!lamina} onClick={() => setFerramenta("selecao")} titulo="Seleção (V)"><MousePointer2 className="h-3.5 w-3.5" /></BotaoFerr>
        <BotaoFerr ativo={lamina} onClick={() => setFerramenta(lamina ? "selecao" : "lamina")} titulo="Navalha (C): cada clique corta ali. W corta tudo na agulha."><Slice className="h-3.5 w-3.5" /></BotaoFerr>
        <BotaoFerr onClick={desfazer} titulo="Desfazer (⌘Z)" desativado={!podeDesfazer}><Undo2 className="h-3.5 w-3.5" /></BotaoFerr>
        <BotaoFerr onClick={refazer} titulo="Refazer (⇧⌘Z)" desativado={!podeRefazer}><Redo2 className="h-3.5 w-3.5" /></BotaoFerr>
        <span className="mx-1.5 h-4 w-px bg-zinc-700" />
        <BotaoLiga ligado={juntar} onClick={() => setJuntar(!juntar)} titulo="Ligado: ao apagar, o resto do vídeo encosta. Desligado: fica um buraco preto (⌘R sempre junta).">
          <Link2 className="h-3.5 w-3.5" />Juntar ao apagar
        </BotaoLiga>
        <BotaoLiga ligado={ima} onClick={() => setIma(!ima)} titulo="Ímã: a agulha e as pontas grudam no começo/fim dos trechos e nos marcadores">
          <Magnet className="h-3.5 w-3.5" />Ímã
        </BotaoLiga>
        <BotaoFerr onClick={marcar} titulo="Marcador na agulha (M)"><Bookmark className="h-3.5 w-3.5" /></BotaoFerr>
        <span className="mx-1.5 h-4 w-px bg-zinc-700" />
        <button type="button" onClick={novoZoom} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-zinc-700" title="Zoom de 3 s a partir da agulha"><ZoomIn className="h-3.5 w-3.5" />Zoom</button>
        <button type="button" onClick={() => setSelecao([{ tipo: "cor" }])} className={cn("inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-zinc-700", selecionado({ tipo: "cor" }) && "bg-zinc-700")} title="Cor do vídeo (Lumetri)"><Palette className="h-3.5 w-3.5" />Cor</button>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 hover:bg-zinc-700" title="Entra onde a agulha está">
          <ImagePlus className="h-3.5 w-3.5" />Imagem / vídeo
          <input type="file" accept="image/*,video/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try {
              const arquivo = await subir(f);
              alterar({ ...projeto, midias: [...projeto.midias, { id: `u${Date.now()}`, tipo: f.type.startsWith("video") ? "video" : "imagem", arquivo, inicio: tFonte, fim: tFonte + 5, ...POSICOES.embaixo }] });
            } catch { toast.error("Não consegui enviar o arquivo"); }
            e.target.value = "";
          }} />
        </label>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 hover:bg-zinc-700">
          <Music className="h-3.5 w-3.5" />{projeto.musica ? "Trocar música" : "Música"}
          <input type="file" accept="audio/*" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try { const arquivo = await subir(f); alterar({ ...projeto, musica: { arquivo, volume: projeto.musica?.volume ?? 0.07 } }); }
            catch { toast.error("Não consegui enviar a música"); }
            e.target.value = "";
          }} />
        </label>
        <div className="ml-auto flex items-center gap-2 text-zinc-400" title="D aproxima · F afasta">Zoom
          <input type="range" min={4} max={400} value={pps} onChange={(e) => setPps(Number(e.target.value))} className="w-28" />
        </div>
      </div>

      {/* Régua + faixas */}
      <div ref={areaRef} className="relative min-h-0 flex-1 overflow-auto"
        style={lamina ? { cursor: CURSOR_NAVALHA } : undefined}
        onPointerMove={(e) => { if (lamina && !arraste) { const r = encaixar(Math.max(0, xParaT(e.clientX)), true); setMira(r.t); setGuia(r.guia); } }}
        onPointerLeave={() => { if (lamina) { setMira(null); setGuia(null); } }}
        onPointerDown={(e) => {
          if (!(e.target as HTMLElement).dataset.fundo) return;
          if (!e.shiftKey && !e.metaKey) setSelecao([]);
          segurarAgulha(e);
        }}>
        <div style={{ width: largura + ROT }} className="relative select-none">
          <div className="sticky top-0 z-30 flex h-7 border-b border-zinc-700 bg-[#252526]">
            <div className="sticky left-0 z-20 w-[88px] shrink-0 border-r border-zinc-700 bg-[#252526]" />
            <div className="relative flex-1 cursor-ew-resize" onPointerDown={(e) => { e.stopPropagation(); segurarAgulha(e); }}>
              {Array.from({ length: Math.ceil(durFinal / passo) + 1 }, (_, i) => (
                <span key={i} className="pointer-events-none absolute bottom-0 h-full border-l border-zinc-600 pl-1 text-[10px] text-zinc-500" style={{ left: i * passo * pps }}>
                  {timecode(i * passo).slice(passo < 1 ? 3 : 0, passo < 1 ? 8 : 5)}
                </span>
              ))}
              {(projeto.marcadores ?? []).map((m) => {
                const t = paraFinal(segs, m, "inicio");
                return t == null ? null : (
                  <span key={m} className="pointer-events-none absolute top-0 -ml-[5px] h-3 w-[11px] bg-emerald-400" title="Marcador (M na agulha tira)"
                    style={{ left: t * pps, clipPath: "polygon(0 0,100% 0,100% 60%,50% 100%,0 60%)" }} />
                );
              })}
            </div>
          </div>
          {faixa("leg", "Legendas", projeto.legendas.map((l) => {
            const iv = intervaloFinal(l.inicio, l.fim);
            if (!iv) return null;
            const it: Item = { tipo: "legenda", id: l.id };
            const esq = arraste?.tipo === "leg-esq" && arraste.alvo === l.id ? arraste.dt : 0;
            const dir = arraste?.tipo === "leg-dir" && arraste.alvo === l.id ? arraste.dt : 0;
            return (
              <div key={l.id} onPointerDown={(e) => clicarItem(e, it)}
                className={cn("absolute bottom-1 top-1 flex items-center truncate rounded-sm px-1.5 text-left text-[10px] font-medium text-zinc-900", l.tipo === "head" ? "bg-amber-400" : "bg-amber-300/90", selecionado(it) && "ring-2 ring-white", (esq || dir) && "z-20 opacity-90")}
                style={bloco(iv[0] + esq, iv[1] + dir)} title={l.texto}>
                <span className="truncate">{l.texto}</span>
                {!lamina && <>
                  <span className={cn(borda, "left-0")} title="Arraste pra legenda entrar antes/depois"
                    onPointerDown={(e) => { e.stopPropagation(); setArraste({ tipo: "leg-esq", alvo: l.id, x0: e.clientX, base: iv[0], dt: 0, limite: limiteLegenda(l.id, "esq", iv) }); }} />
                  <span className={cn(borda, "right-0")} title="Arraste pra legenda sair antes/depois"
                    onPointerDown={(e) => { e.stopPropagation(); setArraste({ tipo: "leg-dir", alvo: l.id, x0: e.clientX, base: iv[1], dt: 0, limite: limiteLegenda(l.id, "dir", iv) }); }} />
                </>}
              </div>
            );
          }))}
          {faixa("zoom", "Zoom", zooms.map((z) => {
            const iv = intervaloFinal(z.inicio, z.fim);
            if (!iv) return null;
            const it: Item = { tipo: "zoom", id: z.id };
            const d = arraste && arraste.alvo === z.id ? arraste.dt : 0;
            const ini = iv[0] + (arraste?.tipo === "mover-zoom" || arraste?.tipo === "zoom-esq" ? d : 0);
            const fim = iv[1] + (arraste?.tipo === "mover-zoom" || arraste?.tipo === "zoom-dir" ? d : 0);
            return (
              <div key={z.id} className={cn("absolute bottom-1 top-1 flex items-center overflow-hidden rounded-sm border border-pink-300/40 bg-pink-500/35 text-[10px] text-pink-50", selecionado(it) && "ring-2 ring-white")}
                style={bloco(ini, fim)} title={`${Math.round(z.z * 100)}% · ${TIPOS_ZOOM[z.tipo]}`}
                onPointerDown={(e) => {
                  clicarItem(e, it);
                  if (!lamina && !e.shiftKey && !e.metaKey) setArraste({ tipo: "mover-zoom", alvo: z.id, x0: e.clientX, base: iv[0], dt: 0 });
                }}>
                <span className="pointer-events-none truncate px-1.5">{Math.round(z.z * 100)}% {z.tipo}</span>
                {!lamina && <>
                  <span className={cn(borda, "left-0")} onPointerDown={(e) => { e.stopPropagation(); setArraste({ tipo: "zoom-esq", alvo: z.id, x0: e.clientX, base: iv[0], dt: 0 }); }} />
                  <span className={cn(borda, "right-0")} onPointerDown={(e) => { e.stopPropagation(); setArraste({ tipo: "zoom-dir", alvo: z.id, x0: e.clientX, base: iv[1], dt: 0 }); }} />
                </>}
              </div>
            );
          }))}
          {faixa("v2", "V2 · Imagens", projeto.midias.map((m) => {
            const iv = intervaloFinal(m.inicio, m.fim);
            if (!iv) return null;
            const linha = linhasMidia.get(m.id) ?? 0;
            const it: Item = { tipo: "midia", id: m.id };
            const deslocar = arraste?.tipo === "mover-midia" && arraste.alvo === m.id ? arraste.dt : 0;
            const larguraExtra = arraste?.tipo === "borda-midia" && arraste.alvo === m.id ? arraste.dt : 0;
            return (
              <div key={m.id} className={cn("absolute flex items-center overflow-hidden rounded-sm bg-violet-500/80 text-[10px] text-white", selecionado(it) && "ring-2 ring-white")}
                style={{ top: 2 + linha * laneH, height: laneH - 2, left: (iv[0] + deslocar) * pps, width: Math.max(6, (iv[1] - iv[0] + larguraExtra) * pps) }}
                onPointerDown={(e) => {
                  clicarItem(e, it);
                  if (!lamina && !e.shiftKey && !e.metaKey) setArraste({ tipo: "mover-midia", alvo: m.id, x0: e.clientX, base: iv[0], dt: 0 });
                }}>
                <span className="truncate px-1">{m.arquivo.split("/").pop()}</span>
                {!lamina && <span className={cn(borda, "right-0 w-1.5 bg-white/40")}
                  onPointerDown={(e) => { e.stopPropagation(); setArraste({ tipo: "borda-midia", alvo: m.id, x0: e.clientX, base: iv[1], dt: 0 }); }} />}
              </div>
            );
          }))}
          {faixa("v1", "V1 · Vídeo", lista.map((c, i) => {
            const it: Item = { tipo: "clipe", inicio: c.inicio, fim: c.fim, ...(c.lacuna ? { lacuna: c.lacuna } : {}) };
            const d = arraste && arraste.alvo === c ? arraste.dt : 0;
            const esq = arraste?.tipo === "borda-esq" && arraste.alvo === c ? d : 0;
            const dir = arraste?.tipo === "borda-dir" && arraste.alvo === c ? d : 0;
            const len = c.fim - c.inicio;
            return (
              <div key={`${c.inicio}-${i}`}
                className={cn("absolute bottom-1 top-1 overflow-hidden rounded-sm text-[10px]",
                  c.lacuna ? "border border-dashed border-zinc-600 bg-transparent text-zinc-500" : "border border-sky-900 bg-sky-600/80 text-white",
                  selecionado(it) && "ring-2 ring-white")}
                style={{ left: (c.posFinal + esq) * pps, width: Math.max(4, (len - esq + dir) * pps) }}
                onPointerDown={(e) => clicarItem(e, it, () => c.inicio + ((mira ?? c.posFinal) - c.posFinal))}>
                <span className="pointer-events-none px-1">{c.lacuna ? "buraco" : `${len.toFixed(1)}s`}</span>
                {!lamina && !c.lacuna && <>
                  <span className={cn(borda, "left-0 w-1.5 bg-white/30")} title="Arraste pra aparar / trazer de volta"
                    onPointerDown={(e) => { e.stopPropagation(); setArraste({ tipo: "borda-esq", alvo: c, x0: e.clientX, base: c.posFinal, dt: 0 }); }} />
                  <span className={cn(borda, "right-0 w-1.5 bg-white/30")} title="Arraste pra aparar / trazer de volta"
                    onPointerDown={(e) => { e.stopPropagation(); setArraste({ tipo: "borda-dir", alvo: c, x0: e.clientX, base: c.posFinal + len, dt: 0 }); }} />
                </>}
              </div>
            );
          }))}
          {faixa("a1", "A1 · Voz", lista.filter((c) => !c.lacuna).map((c, i) => {
            const it: Item = { tipo: "clipe", inicio: c.inicio, fim: c.fim };
            return (
              <div key={i} className={cn("absolute bottom-1 top-1 overflow-hidden rounded-sm border border-emerald-900 bg-emerald-800/60", selecionado(it) && "ring-2 ring-white")}
                style={bloco(c.posFinal, c.posFinal + (c.fim - c.inicio))}
                onPointerDown={(e) => clicarItem(e, it, () => c.inicio + ((mira ?? c.posFinal) - c.posFinal))}>
                <FormaDeOnda onda={onda} inicio={c.inicio} fim={c.fim} pps={pps} altura={alt.a1 - 10} />
              </div>
            );
          }))}
          {faixa("a2", "A2 · Música", projeto.musica && (
            <div onPointerDown={(e) => clicarItem(e, { tipo: "musica" })}
              className={cn("absolute bottom-1 top-1 overflow-hidden rounded-sm border border-teal-900 bg-teal-800/60", selecionado({ tipo: "musica" }) && "ring-2 ring-white")}
              style={bloco(0, durFinal)}>
              <FormaDeOnda onda={ondaMusica} inicio={0} fim={durFinal} pps={pps} altura={alt.a2 - 10} repetir cor="rgba(153, 246, 228, 0.9)" />
              <span className="pointer-events-none absolute left-1 top-0.5 text-[10px] text-white drop-shadow">{projeto.musica.arquivo.split("/").pop()}</span>
            </div>
          ))}
          {/* Navalha: onde vai cortar */}
          {lamina && mira != null && <div className="pointer-events-none absolute bottom-0 top-7 z-30 w-px bg-rose-400" style={{ left: ROT + mira * pps }} />}
          {/* Ímã / trava: linha de encaixe */}
          {guia != null && <div className="pointer-events-none absolute bottom-0 top-0 z-40 w-px bg-yellow-300 shadow-[0_0_4px_#fde047]" style={{ left: ROT + guia * pps }} />}
          {/* Agulha */}
          <div className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-sky-400" style={{ left: ROT + tFinal * pps }}>
            <div className="-ml-[6px] h-3 w-[13px] bg-sky-400" style={{ clipPath: "polygon(0 0,100% 0,100% 55%,50% 100%,0 55%)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Forma de onda entre [inicio, fim] segundos do áudio (pra ver os silêncios). `repetir`: a música toca em loop. */
function FormaDeOnda({ onda, inicio, fim, pps, altura, repetir, cor = "rgba(167, 243, 208, 0.95)" }: {
  onda: Onda | null; inicio: number; fim: number; pps: number; altura: number; repetir?: boolean; cor?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.max(1, Math.round((fim - inicio) * pps));
  const h = Math.max(8, altura);
  useEffect(() => {
    const c = ref.current;
    if (!c || !onda || !onda.picos.length) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 16000 / w);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.fillStyle = cor;
    const ps = onda.por_segundo, n = onda.picos.length, meio = h / 2;
    for (let x = 0; x < w; x++) {
      const i0 = Math.floor((inicio + x / pps) * ps);
      const i1 = Math.max(i0 + 1, Math.floor((inicio + (x + 1) / pps) * ps));
      let m = 0;
      for (let i = i0; i < i1; i++) {
        const j = repetir ? i % n : i;
        if (j < n && onda.picos[j] > m) m = onda.picos[j];
      }
      const a = Math.max(1, m * (h - 4));
      g.fillRect(x, meio - a / 2, 1, a);
    }
  }, [onda, inicio, w, pps, h, repetir, cor]);
  return <canvas ref={ref} className="pointer-events-none block" style={{ width: w, height: h, marginTop: 1 }} />;
}

/** Faixa da linha do tempo; arrastar a borda de baixo do nome muda a altura dela. */
function Faixa({ nome, altura, onAltura, children }: { nome: string; altura: number; onAltura: (h: number) => void; children: React.ReactNode }) {
  const redimensionar = (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const y0 = e.clientY, h0 = altura;
    const mover = (ev: PointerEvent) => onAltura(Math.max(22, Math.min(220, Math.round(h0 + ev.clientY - y0))));
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", () => window.removeEventListener("pointermove", mover), { once: true });
  };
  return (
    <div className="flex" style={{ height: altura }}>
      <div className="sticky left-0 z-20 flex w-[88px] shrink-0 items-center border-b border-r border-zinc-700 bg-[#252526] px-2 text-[11px] font-semibold text-zinc-400">
        {nome}
        <span onPointerDown={redimensionar} title="Arraste pra aumentar/diminuir a faixa"
          className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize hover:bg-sky-500/60" />
      </div>
      <div className="relative flex-1 border-b border-zinc-800" data-fundo="1">{children}</div>
    </div>
  );
}
function BotaoFerr({ children, onClick, ativo, titulo, desativado }: { children: React.ReactNode; onClick: () => void; ativo?: boolean; titulo: string; desativado?: boolean }) {
  return (
    <button type="button" title={titulo} onClick={onClick} disabled={desativado}
      className={cn("rounded p-1.5 hover:bg-zinc-700 disabled:opacity-30", ativo && "bg-sky-600 text-white hover:bg-sky-500")}>{children}</button>
  );
}
function BotaoLiga({ children, onClick, ligado, titulo }: { children: React.ReactNode; onClick: () => void; ligado: boolean; titulo: string }) {
  return (
    <button type="button" title={titulo} onClick={onClick}
      className={cn("inline-flex items-center gap-1 rounded border px-2 py-1", ligado ? "border-sky-500 bg-sky-600/30 text-sky-100" : "border-zinc-600 text-zinc-400 hover:bg-zinc-700")}>
      {children}<span className={cn("ml-0.5 h-1.5 w-1.5 rounded-full", ligado ? "bg-sky-300" : "bg-zinc-600")} />
    </button>
  );
}
