import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Globe, LayoutDashboard, Loader2, RotateCw, Search } from "lucide-react";
import { isDesktop } from "@/lib/platform";
import { useAbaAtiva } from "@/lib/workspace/abaAtiva";
import { abrirLinkExterno } from "@/lib/abrirLink";
import { paraEndereco } from "@/lib/navegador/endereco";
import { SidebarTrigger } from "@/components/ui/sidebar";

// Guia de navegador (27/10, Davi: "⌘T ... quero que me pergunte se eu quero navegar e aí acessar a internet,
// normal, igual o Chrome"). Sem endereço é a "Nova guia" (pesquisar/digitar ou voltar ao Painel). Com
// endereço, no app do Mac, um navegador de verdade (src-tauri/src/navegador.rs) fica por cima da área da
// página; aqui só dizemos onde ele fica e o escondemos quando a guia sai da frente ou abre uma janela do app
// por cima (ele é nativo e taparia o diálogo). Na web, o site abre numa aba do navegador.

const ATALHOS = [
  { nome: "Google", url: "https://www.google.com" },
  { nome: "YouTube", url: "https://www.youtube.com" },
  { nome: "Instagram", url: "https://www.instagram.com" },
  { nome: "Gmail", url: "https://mail.google.com" },
  { nome: "ChatGPT", url: "https://chatgpt.com" },
  { nome: "Drive", url: "https://drive.google.com" },
];
/** Algo do app aberto por cima (diálogo, menu, lista de opções): o navegador nativo some enquanto isso. */
const SOBREPOSICAO = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper]';

async function invocar(comando: string, args?: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke(comando, args);
}

export default function Navegador() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const visivel = useAbaAtiva();
  const url = new URLSearchParams(search).get("url") ?? "";
  const desktop = isDesktop();

  const ir = (texto: string) => {
    const destino = paraEndereco(texto);
    if (!destino) return;
    if (!desktop) { void abrirLinkExterno(destino); return; }
    navigate(`/navegar?url=${encodeURIComponent(destino)}`);
  };

  if (!url || !desktop) return <NovaGuia aoIr={ir} aoPainel={() => navigate("/")} />;
  return <Pagina url={url} visivel={visivel} aoIr={ir}
    aoMudarUrl={(u) => { if (visivel) navigate(`/navegar?url=${encodeURIComponent(u)}`, { replace: true }); }} />;
}

function NovaGuia({ aoIr, aoPainel }: { aoIr: (t: string) => void; aoPainel: () => void }) {
  const [texto, setTexto] = useState("");
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-4 pb-24">
      <div className="flex items-center gap-2 text-muted-foreground"><Globe className="h-5 w-5" /><span className="text-sm font-medium">Nova guia</span></div>
      <h1 className="text-center text-2xl font-semibold">Quer navegar na internet?</h1>
      <form className="flex w-full max-w-xl items-center gap-2 rounded-2xl border bg-card px-4 py-3 shadow-sm focus-within:border-primary/50"
        onSubmit={(e) => { e.preventDefault(); aoIr(texto); }}>
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pesquisar no Google ou digitar um endereço"
          className="min-w-0 flex-1 bg-transparent text-base outline-none" />
      </form>
      <div className="flex max-w-xl flex-wrap justify-center gap-2">
        {ATALHOS.map((a) => (
          <button key={a.nome} type="button" onClick={() => aoIr(a.url)}
            className="rounded-full border bg-card px-3 py-1.5 text-sm hover:border-primary/40 hover:bg-muted">{a.nome}</button>
        ))}
      </div>
      <button type="button" onClick={aoPainel} className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
        <LayoutDashboard className="h-4 w-4" />Não, abrir o Painel do Infopro
      </button>
    </div>
  );
}

function Pagina({ url, visivel, aoIr, aoMudarUrl }: { url: string; visivel: boolean; aoIr: (t: string) => void; aoMudarUrl: (u: string) => void }) {
  const rotulo = useRef(`navegador-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`).current;
  const area = useRef<HTMLDivElement>(null);
  const aberto = useRef(false);
  const urlDoNavegador = useRef<string | null>(null);   // onde o navegador está (para não recarregar à toa)
  const [barra, setBarra] = useState(url);
  const [editando, setEditando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [coberto, setCoberto] = useState(false);
  const aoMudarUrlRef = useRef(aoMudarUrl);
  aoMudarUrlRef.current = aoMudarUrl;

  // Eventos do navegador desta guia.
  useEffect(() => {
    let parar: (() => void)[] = [];
    let vivo = true;
    void import("@tauri-apps/api/event").then(async ({ listen }) => {
      const ouvir = await Promise.all([
        listen<{ rotulo: string; valor: string }>("navegador-url", ({ payload }) => {
          if (payload.rotulo !== rotulo || !/^https?:/i.test(payload.valor) || payload.valor === urlDoNavegador.current) return;
          urlDoNavegador.current = payload.valor;
          setBarra(payload.valor);
          aoMudarUrlRef.current(payload.valor);
        }),
        listen<{ rotulo: string; valor: string }>("navegador-carregando", ({ payload }) => {
          if (payload.rotulo === rotulo) setCarregando(payload.valor === "1");
        }),
      ]);
      if (vivo) parar = ouvir; else ouvir.forEach((f) => f());
    });
    return () => { vivo = false; parar.forEach((f) => f()); };
  }, [rotulo]);

  // Endereço novo vindo de fora (barra, atalho, voltar da guia): leva o navegador até ele.
  useEffect(() => {
    if (!editando) setBarra(url);
    if (!aberto.current || url === urlDoNavegador.current) return;
    urlDoNavegador.current = url;
    void invocar("navegador_ir", { rotulo, url }).catch(() => undefined);
  }, [url, rotulo]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Algo do app aberto por cima: esconde o navegador.
  useEffect(() => {
    // Só o que está mesmo na tela: diálogo de uma guia escondida (display: none) não tem caixa e não conta —
    // antes deixava o site em branco (28/10).
    const ver = () => setCoberto(Array.from(document.querySelectorAll(SOBREPOSICAO)).some((el) => el.getClientRects().length > 0));
    ver();
    const obs = new MutationObserver(ver);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "data-state"] });
    return () => obs.disconnect();
  }, []);

  // Abre/posiciona/esconde o navegador conforme a área da página.
  const mostrar = visivel && !coberto;
  useEffect(() => {
    if (!mostrar) {
      if (aberto.current) void invocar("navegador_esconder", { rotulo }).catch(() => undefined);
      return;
    }
    let ultimo = "";
    const posicionar = () => {
      const r = area.current?.getBoundingClientRect();
      if (!r || r.width < 10 || r.height < 10) return;
      const chave = [r.left, r.top, r.width, r.height].map(Math.round).join(",");
      if (chave === ultimo) return;
      ultimo = chave;
      const caixa = { rotulo, x: Math.round(r.left), y: Math.round(r.top), largura: Math.round(r.width), altura: Math.round(r.height) };
      if (!aberto.current) {
        aberto.current = true;
        urlDoNavegador.current = url;
        void invocar("navegador_abrir", { ...caixa, url }).catch(() => { aberto.current = false; ultimo = ""; });
      } else {
        void invocar("navegador_abrir", { ...caixa, url: urlDoNavegador.current ?? url }).catch(() => undefined);
      }
    };
    posicionar();
    const obs = new ResizeObserver(posicionar);
    if (area.current) obs.observe(area.current);
    window.addEventListener("resize", posicionar);
    const t = window.setInterval(posicionar, 400);   // lateral abrindo/fechando muda a posição sem mudar o tamanho
    return () => { obs.disconnect(); window.removeEventListener("resize", posicionar); window.clearInterval(t); };
  }, [mostrar, rotulo]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Guia fechada: fecha o navegador.
  useEffect(() => () => { void invocar("navegador_fechar", { rotulo }).catch(() => undefined); }, [rotulo]);

  const acao = (a: "voltar" | "avancar" | "recarregar") => void invocar("navegador_acao", { rotulo, acao: a }).catch(() => undefined);
  const botao = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b bg-card/60 px-2 py-1.5">
        <SidebarTrigger className="h-8 w-8 shrink-0 text-muted-foreground" title="Abrir/fechar a lateral (⌘⇧B)" />
        <button type="button" className={botao} onClick={() => acao("voltar")} title="Voltar"><ArrowLeft className="h-4 w-4" /></button>
        <button type="button" className={botao} onClick={() => acao("avancar")} title="Avançar"><ArrowRight className="h-4 w-4" /></button>
        <button type="button" className={botao} onClick={() => acao("recarregar")} title="Recarregar">
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
        </button>
        <form className="min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); setEditando(false); (document.activeElement as HTMLElement | null)?.blur(); aoIr(barra); }}>
          <input value={barra} onChange={(e) => setBarra(e.target.value)} onFocus={(e) => { setEditando(true); e.target.select(); }}
            onBlur={() => { setEditando(false); setBarra(urlDoNavegador.current ?? url); }}
            className="w-full rounded-lg border bg-background/70 px-3 py-1.5 text-sm outline-none focus:border-primary/50" />
        </form>
      </div>
      <div ref={area} className="relative min-h-0 flex-1">
        {!mostrar && <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{coberto ? "" : "Carregando…"}</div>}
      </div>
    </div>
  );
}
