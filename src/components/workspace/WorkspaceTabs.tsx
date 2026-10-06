import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isDesktop } from "@/lib/platform";

export interface WorkspaceTab {
  id: string;
  path: string;
  title: string;
}

interface WorkspaceTabsContextValue {
  tabs: WorkspaceTab[];
  activeId: string;
  openTab: (path: string, title?: string) => void;
  syncPath: (path: string, title?: string) => void;
  closeTab: (id: string) => void;
  reorderTabs: (fromId: string, toId: string) => void;
  detachTab: (tab: WorkspaceTab, posicao?: { x: number; y: number }) => Promise<void>;
}

const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | null>(null);

const titleForPath = (path: string) => {
  if (path === "/") return "Painel";
  if (path === "/clientes") return "Projetos";
  if (path === "/atividades") return "Atividades";
  if (path === "/notas") return "Notas";
  if (path === "/produtividade") return "Produtividade";
  if (path === "/agenda") return "Agenda";
  if (path === "/admin") return "Administração";
  if (path.startsWith("/clientes/")) return "Projeto";
  return "Infopro Hub";
};

export function WorkspaceTabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([{ id: "tab-inicial", path: "/", title: "Painel" }]);
  const [activeId, setActiveIdState] = useState("tab-inicial");
  // Ref evita closures velhas: syncPath roda num efeito e precisa da aba ativa atual.
  const activeIdRef = useRef(activeId);
  const setActiveId = useCallback((id: string) => { activeIdRef.current = id; setActiveIdState(id); }, []);

  const openTab = useCallback((path: string, title = titleForPath(path)) => {
    setTabs((current) => {
      const existing = current.find((tab) => tab.path === path);
      if (existing) {
        setActiveId(existing.id);
        return current;
      }
      const tab = { id: `${path}-${Date.now()}`, path, title };
      setActiveId(tab.id);
      return [...current, tab];
    });
  }, [setActiveId]);

  // Navegação comum troca o conteúdo da aba selecionada; não cria uma nova.
  const syncPath = useCallback((path: string, title = titleForPath(path)) => {
    setTabs((current) => {
      const existing = current.find((tab) => tab.path === path);
      if (existing) {
        setActiveId(existing.id);
        return current;
      }
      const ativa = current.find((tab) => tab.id === activeIdRef.current);
      if (!ativa || ativa.path === path) return current;
      // Navegar dentro da aba mantém o título dado ao abrir (ex.: nome do projeto)
      // enquanto continua na mesma página; só troca ao ir pra outra seção.
      const mesmaSecao = ativa.path.split("?")[0] === path.split("?")[0];
      return current.map((tab) => tab.id === ativa.id ? { ...tab, path, title: mesmaSecao ? tab.title : title } : tab);
    });
  }, [setActiveId]);

  const closeTab = (id: string) => setTabs((current) => current.length > 1 ? current.filter((tab) => tab.id !== id) : current);
  const reorderTabs = (fromId: string, toId: string) => setTabs((current) => { const from = current.findIndex((tab) => tab.id === fromId); const to = current.findIndex((tab) => tab.id === toId); if (from < 0 || to < 0 || from === to) return current; const next = [...current]; const [tab] = next.splice(from, 1); next.splice(to, 0, tab); return next; });
  // Destaca a aba numa janela própria (como o Chrome), posicionada sob o cursor.
  const detachTab = async (tab: WorkspaceTab, posicao?: { x: number; y: number }) => {
    const x = posicao ? Math.max(0, Math.round(posicao.x - 120)) : undefined;
    const y = posicao ? Math.max(0, Math.round(posicao.y - 20)) : undefined;
    if (isDesktop()) {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const janela = new WebviewWindow(`tab-${Date.now()}`, { url: tab.path, title: `Infopro Hub — ${tab.title}`, width: 1280, height: 800, minWidth: 400, minHeight: 450, x, y });
      const ok = await new Promise<boolean>((resolve) => {
        void janela.once("tauri://created", () => resolve(true));
        void janela.once("tauri://error", (erro) => { console.error("Falha ao destacar aba", erro); resolve(false); });
      });
      if (!ok) return;
    } else {
      const extras = posicao ? `,left=${x},top=${y}` : "";
      if (!window.open(tab.path, "_blank", `popup,width=1280,height=800${extras}`)) return;
    }
    closeTab(tab.id);
  };

  const value = useMemo(() => ({ tabs, activeId, openTab, syncPath, closeTab, reorderTabs, detachTab }), [tabs, activeId]);
  return <WorkspaceTabsContext.Provider value={value}>{children}</WorkspaceTabsContext.Provider>;
}

export function useWorkspaceTabs() {
  const context = useContext(WorkspaceTabsContext);
  if (!context) throw new Error("useWorkspaceTabs precisa estar dentro de WorkspaceTabsProvider");
  return context;
}

// Arrastar a aba mais que isso para fora da barra a destaca numa janela nova.
const DISTANCIA_DESTACAR = 70;
const LIMIAR_ARRASTO = 5;

interface Arrasto { id: string; inicioX: number; inicioY: number; x: number; y: number; arrastando: boolean; destacando: boolean }

export function WorkspaceTabs({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { tabs, activeId, closeTab, reorderTabs, detachTab } = useWorkspaceTabs();
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const podeDestacar = tabs.length > 1;

  const fallbackDe = (id: string) => {
    const index = tabs.findIndex((tab) => tab.id === id);
    return tabs[index - 1] || tabs[index + 1];
  };

  const fechar = (tab: WorkspaceTab) => {
    const fallback = fallbackDe(tab.id);
    closeTab(tab.id);
    if (tab.id === activeId && fallback) onNavigate(fallback.path);
  };

  const onPointerDown = (event: React.PointerEvent, tab: WorkspaceTab) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey) return;
    if ((event.target as HTMLElement).closest("[data-fechar-aba]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setArrasto({ id: tab.id, inicioX: event.clientX, inicioY: event.clientY, x: event.clientX, y: event.clientY, arrastando: false, destacando: false });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!arrasto) return;
    const arrastando = arrasto.arrastando || Math.hypot(event.clientX - arrasto.inicioX, event.clientY - arrasto.inicioY) > LIMIAR_ARRASTO;
    if (!arrastando) return;
    const barra = navRef.current?.getBoundingClientRect();
    const longe = !!barra && (event.clientY < barra.top - DISTANCIA_DESTACAR || event.clientY > barra.bottom + DISTANCIA_DESTACAR || event.clientX < -DISTANCIA_DESTACAR || event.clientX > window.innerWidth + DISTANCIA_DESTACAR);
    const destacando = podeDestacar && longe;
    if (!destacando) {
      // Perto da barra: reordena pela aba sob o cursor.
      for (const [id, el] of tabRefs.current) {
        const r = el.getBoundingClientRect();
        if (id !== arrasto.id && event.clientX >= r.left && event.clientX <= r.right) { reorderTabs(arrasto.id, id); break; }
      }
    }
    setArrasto({ ...arrasto, x: event.clientX, y: event.clientY, arrastando, destacando });
  };

  const onPointerUp = (event: React.PointerEvent, tab: WorkspaceTab) => {
    const atual = arrasto;
    setArrasto(null);
    if (!atual || atual.id !== tab.id) return;
    if (!atual.arrastando) { onNavigate(tab.path); return; }
    if (atual.destacando) {
      const fallback = fallbackDe(tab.id);
      const eraAtiva = tab.id === activeId;
      void detachTab(tab, { x: event.screenX, y: event.screenY }).then(() => {
        if (eraAtiva && fallback) onNavigate(fallback.path);
      });
    }
  };

  const tabArrastada = arrasto?.destacando ? tabs.find((tab) => tab.id === arrasto.id) : undefined;

  return <nav ref={navRef} className="relative z-[100] flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b bg-background px-3 pt-1 shadow-sm" aria-label="Abas abertas">
    {tabs.map((tab) => {
      const active = tab.id === activeId;
      const canClose = tabs.length > 1;
      const sendoArrastada = arrasto?.arrastando && arrasto.id === tab.id;
      return <div
        key={tab.id}
        ref={(el) => { if (el) tabRefs.current.set(tab.id, el); else tabRefs.current.delete(tab.id); }}
        role="tab"
        aria-selected={active}
        tabIndex={0}
        onPointerDown={(event) => onPointerDown(event, tab)}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => onPointerUp(event, tab)}
        onPointerCancel={() => setArrasto(null)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate(tab.path); }}
        className={cn("group flex h-9 min-w-28 max-w-52 cursor-default select-none touch-none items-center gap-1 rounded-t-md border border-b-0 px-2 text-sm", active ? "bg-background font-medium text-foreground" : "border-transparent text-muted-foreground hover:bg-muted", sendoArrastada && "opacity-60", arrasto?.destacando && arrasto.id === tab.id && "opacity-30")}
      >
        <span className="min-w-0 flex-1 truncate text-left">{tab.title}</span>
        {canClose && <button type="button" data-fechar-aba aria-label={`Fechar aba ${tab.title}`} onClick={(event) => { event.stopPropagation(); fechar(tab); }} className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/15 group-hover:opacity-100 focus:opacity-100"><X className="h-3.5 w-3.5" /></button>}
      </div>;
    })}
    {tabArrastada && arrasto && <div className="pointer-events-none fixed z-[200] flex h-9 w-52 items-center rounded-md border bg-background px-3 text-sm font-medium shadow-lg" style={{ left: arrasto.x - 40, top: arrasto.y - 18 }}>
      <span className="truncate">{tabArrastada.title}</span>
    </div>}
  </nav>;
}
