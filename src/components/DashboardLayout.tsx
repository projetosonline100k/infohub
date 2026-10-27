import { useEffect, useRef, useState } from "react";
import { AtalhoWhatsapp } from "@/components/layout/AtalhoWhatsapp";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { GlobalSearchCommand } from "@/components/layout/GlobalSearchCommand";
import { Assistant } from "@/components/assistant/Assistant";
import { DesktopUpdateBanner } from "@/components/DesktopUpdateBanner";
import { isDesktop } from "@/lib/platform";
import { abrirJanelaAgenda, abrirJanelaNotas } from "@/lib/desktop/window";
import { onMainNavigate, emitClienteAtualMudou } from "@/lib/desktop/events";
import { useWorkspaceTabs, WorkspaceTabs } from "@/components/workspace/WorkspaceTabs";
import { WorkspacePages } from "@/components/workspace/WorkspacePages";
import { useSomDigitacao } from "@/hooks/useSomDigitacao";
import { useAlarmesAgenda } from "@/hooks/useAlarmesAgenda";
import { useFocoTotal } from "@/hooks/useFocoTimer";
import { cn } from "@/lib/utils";

// Redesign visual (item 3/4): sidebar fixa à esquerda + topbar no
// conteúdo, no lugar do header horizontal antigo. Rotas, autenticação,
// DesktopUpdateBanner, o Assistant flutuante e a ponte onMainNavigate
// (Tauri) continuam exatamente como estavam — só o chrome visual mudou.
export const DashboardLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // O layout fica fora das rotas de página, então lê o id direto do caminho.
  const clienteRotaId = matchPath("/clientes/:id", location.pathname)?.params.id;
  const [buscaAberta, setBuscaAberta] = useState(false);
  const { syncPath, tabs, activeId, openTab } = useWorkspaceTabs();
  // Foco total (27/10, Davi: "a guia do Modo Foco não fica isolada"): só o Modo Foco na janela — sem guias,
  // lateral nem busca — e a janela encostada no canto direito (também quando o app abre com o foco ligado).
  const focoIsolado = useFocoTotal() && isDesktop();
  useEffect(() => {
    if (!focoIsolado) return;
    if (location.pathname !== "/foco") openTab("/foco");
    let telaCheia = false;
    try { telaCheia = localStorage.getItem("modo-foco:tela-cheia") === "1"; } catch { /* */ }
    if (!telaCheia) void import("@tauri-apps/api/core").then(({ invoke }) => invoke("foco_encostar", { ativo: true })).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoIsolado]);
  // Alarmes da Agenda tocam em qualquer tela do app (não só na Agenda).
  useAlarmesAgenda();

  // ⌘R recarrega o app (no Mac o atalho não fazia nada; 15/10). Com uma janela aberta
  // por cima (ex.: editor de vídeo, onde ⌘R é "apagar e juntar"), o atalho é dela.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "r" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      e.preventDefault();
      window.location.reload();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  // Janela própria de Notas (20/10, Davi: "sempre que abrir o Infopro, já abrir uma parte separada,
  // igual o Notas"): a janela principal abre a de Notas ao ligar (sem roubar o foco; se já está
  // aberta, nada muda) e ⌘⌥N traz ela pra frente.
  useEffect(() => {
    if (!isDesktop()) return;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (getCurrentWindow().label === "main") {
          await abrirJanelaNotas(false);
          // 23/10: a Agenda também abre na própria janela, junto com o app (⌘⌥A traz pra frente).
          await abrirJanelaAgenda(false);
        }
      } catch { /* sem janela nativa */ }
    })();
    const tecla = (e: KeyboardEvent) => {
      if (!e.metaKey || !e.altKey || e.shiftKey || e.ctrlKey || (e.code !== "KeyN" && e.code !== "KeyA")) return;
      e.preventDefault();
      void (e.code === "KeyN" ? abrirJanelaNotas(true) : abrirJanelaAgenda(true));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  useEffect(() => {
    syncPath(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search, syncPath]);

  // Guia ativada sem navegar (openTab: "Novo desenho", ⌘+clique…): o endereço ficava no da guia
  // anterior e clicar na lateral nesse item não fazia nada, deixando outro desenho na tela (24/10).
  // Quando a guia ativa muda, o endereço passa a ser o dela.
  const guiaAnterior = useRef(activeId);
  useEffect(() => {
    if (guiaAnterior.current === activeId) return;
    guiaAnterior.current = activeId;
    const ativa = tabs.find((t) => t.id === activeId);
    if (ativa && ativa.path !== `${location.pathname}${location.search}`) navigate(ativa.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, tabs]);

  // Avisa a janela `jarvis` (desktop) qual cliente está aberto aqui na
  // `main` — cada janela tem sua própria árvore React Router, então o
  // Assistant renderizado dentro do Atlas não enxerga essa rota sozinho
  // (ver src/lib/desktop/events.ts). No-op na web/sem cliente selecionado.
  useEffect(() => {
    if (clienteRotaId) void emitClienteAtualMudou(clienteRotaId);
  }, [clienteRotaId]);

  // Item 1 (rodada 3): a janela main já foi mostrada/maximizada/focada por
  // openMainWindow() (chamado de dentro do Atlas) — aqui só navegamos pra
  // rota que ele pediu (Ver todas, Notas, Expandir, etc). No-op na web
  // (onMainNavigate não faz nada fora do desktop).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onMainNavigate((route) => navigate(route)).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [navigate]);

  const isClienteDetalhe = /^\/clientes\/[^/]+/.test(location.pathname);
  useSomDigitacao();   // som de máquina de escrever nos editores (25/10)

  // 24/10 (Davi: "no modo docs não consigo ver as guias"): ao focar o editor, o navegador rolava as caixas
  // de fora (que têm overflow-hidden, mas aceitam rolagem por código) e a barra de guias subia para fora da
  // janela, deixando uma faixa branca embaixo. Essas caixas nunca rolam: volta para o lugar na hora.
  useEffect(() => {
    const voltar = (e: Event) => {
      const el = e.target;
      if (el === document || el === document.documentElement || el === document.body) {
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
        return;
      }
      if (el instanceof HTMLElement && el.hasAttribute("data-sem-rolagem") && (el.scrollTop || el.scrollLeft)) {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      }
    };
    document.addEventListener("scroll", voltar, true);
    return () => document.removeEventListener("scroll", voltar, true);
  }, []);

  return (
    <div data-sem-rolagem="" className="flex h-svh w-full flex-col overflow-hidden">
      {/* No foco isolado a barra de guias some (fica montada: os atalhos dela continuam valendo) e sobra uma
          faixa para arrastar a janela, onde ficam os botões do Mac. */}
      <div className={cn(focoIsolado && "hidden")}><WorkspaceTabs onNavigate={navigate} /></div>
      {focoIsolado && <div data-tauri-drag-region className="h-8 shrink-0" />}
      <AtalhoWhatsapp clienteId={clienteRotaId} />
      {/* --painel-direita: o chat do documento (⌘I) aberto à direita encolhe só a área abaixo das guias. */}
      <SidebarProvider data-sem-rolagem="" className="min-h-0 min-w-0 flex-1 pr-[var(--painel-direita,0px)]">
        {/* min-w-0 em toda a cadeia: sem isso este item de flex estica até a
            largura da página e é cortado pela janela, e o <main> nunca rola. */}
        <div data-sem-rolagem="" className="flex min-h-0 min-w-0 flex-1">
          {/* 23/10: a barra em árvore aparece também dentro do projeto (com as seções dele). */}
          {/* (Sem embrulho: o SidebarInset depende de ser irmão da lateral.) */}
          {!focoIsolado && <AppSidebar />}
          {/* min-w-0/min-h-0: a área da página não estica além da janela — quem
              rola (inclusive pro lado, em janela estreita) é o <main>. */}
          <SidebarInset data-sem-rolagem="" className="min-h-0 min-w-0">
            {!isClienteDetalhe && !focoIsolado && <AppTopbar onAbrirBusca={() => setBuscaAberta(true)} />}
            <DesktopUpdateBanner />
            {/* Quem rola é cada guia (ou cada metade, com a tela dividida) —
                ver WorkspacePages. */}
            <main data-sem-rolagem="" className="min-h-0 flex-1 overflow-hidden">
              <WorkspacePages />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>

      <GlobalSearchCommand open={buscaAberta} onOpenChange={setBuscaAberta} />

      {/* Assistente virtual flutuante — única instância, visível em toda
          página autenticada (este layout envolve todas as rotas protegidas).
          No desktop esconde aqui: a janela nativa `jarvis` (ver
          src/pages/JarvisWindow.tsx) já cobre esse papel, sem duplicar. */}
      {!isDesktop() && <Assistant />}
    </div>
  );
};
