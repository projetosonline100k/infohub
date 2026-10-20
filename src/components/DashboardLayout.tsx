import { useEffect, useState } from "react";
import { AtalhoWhatsapp } from "@/components/layout/AtalhoWhatsapp";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { GlobalSearchCommand } from "@/components/layout/GlobalSearchCommand";
import { Assistant } from "@/components/assistant/Assistant";
import { DesktopUpdateBanner } from "@/components/DesktopUpdateBanner";
import { isDesktop } from "@/lib/platform";
import { abrirJanelaNotas } from "@/lib/desktop/window";
import { onMainNavigate, emitClienteAtualMudou } from "@/lib/desktop/events";
import { useWorkspaceTabs, WorkspaceTabs } from "@/components/workspace/WorkspaceTabs";
import { WorkspacePages } from "@/components/workspace/WorkspacePages";
import { useAlarmesAgenda } from "@/hooks/useAlarmesAgenda";

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
  const { syncPath } = useWorkspaceTabs();
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
        if (getCurrentWindow().label === "main") await abrirJanelaNotas(false);
      } catch { /* sem janela nativa */ }
    })();
    const tecla = (e: KeyboardEvent) => {
      if (!e.metaKey || !e.altKey || e.shiftKey || e.ctrlKey || e.code !== "KeyN") return;
      e.preventDefault();
      void abrirJanelaNotas(true);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  useEffect(() => {
    syncPath(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search, syncPath]);

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

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden">
      <WorkspaceTabs onNavigate={navigate} />
      <AtalhoWhatsapp clienteId={clienteRotaId} />
      <SidebarProvider className="min-h-0 min-w-0 flex-1">
        {/* min-w-0 em toda a cadeia: sem isso este item de flex estica até a
            largura da página e é cortado pela janela, e o <main> nunca rola. */}
        <div className="flex min-h-0 min-w-0 flex-1">
          {!isClienteDetalhe && <AppSidebar />}
          {/* min-w-0/min-h-0: a área da página não estica além da janela — quem
              rola (inclusive pro lado, em janela estreita) é o <main>. */}
          <SidebarInset className="min-h-0 min-w-0">
            {!isClienteDetalhe && <AppTopbar onAbrirBusca={() => setBuscaAberta(true)} />}
            <DesktopUpdateBanner />
            {/* Quem rola é cada guia (ou cada metade, com a tela dividida) —
                ver WorkspacePages. */}
            <main className="min-h-0 flex-1 overflow-hidden">
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
