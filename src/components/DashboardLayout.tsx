import { useEffect, useState } from "react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { GlobalSearchCommand } from "@/components/layout/GlobalSearchCommand";
import { Assistant } from "@/components/assistant/Assistant";
import { DesktopUpdateBanner } from "@/components/DesktopUpdateBanner";
import { isDesktop } from "@/lib/platform";
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

  useEffect(() => {
    syncPath(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search, syncPath]);

  // Avisa a janela `jarvis` (desktop) qual cliente está aberto aqui na
  // `main` — cada janela tem sua própria árvore React Router, então o
  // Assistant renderizado dentro do Jarvis não enxerga essa rota sozinho
  // (ver src/lib/desktop/events.ts). No-op na web/sem cliente selecionado.
  useEffect(() => {
    if (clienteRotaId) void emitClienteAtualMudou(clienteRotaId);
  }, [clienteRotaId]);

  // Item 1 (rodada 3): a janela main já foi mostrada/maximizada/focada por
  // openMainWindow() (chamado de dentro do Jarvis) — aqui só navegamos pra
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
            <main className="flex-1 overflow-auto">
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
