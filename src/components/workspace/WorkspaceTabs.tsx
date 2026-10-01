import { createContext, useContext, useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export interface WorkspaceTab { id: string; path: string; title: string; }
interface WorkspaceTabsContextValue { tabs: WorkspaceTab[]; activeId: string; openTab: (path: string, title?: string) => void; syncPath: (path: string, title?: string) => void; closeTab: (id: string) => void; }
const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | null>(null);
const titleForPath = (path: string) => { if (path === "/") return "Painel"; if (path === "/clientes") return "Projetos"; if (path === "/atividades") return "Atividades"; if (path === "/notas") return "Notas"; if (path === "/produtividade") return "Produtividade"; if (path === "/agenda") return "Agenda"; if (path === "/admin") return "Administração"; if (path.startsWith("/clientes/")) return "Projeto"; return "Infopro Hub"; };
export function WorkspaceTabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([{ id: "tab-inicial", path: "/", title: "Painel" }]);
  const [activeId, setActiveId] = useState("tab-inicial");
  const openTab = (path: string, title = titleForPath(path)) => setTabs((current) => { const existing = current.find((tab) => tab.path === path); if (existing) { setActiveId(existing.id); return current; } const tab = { id: `${path}-${Date.now()}`, path, title }; setActiveId(tab.id); return [...current, tab]; });
  const syncPath = (path: string, title = titleForPath(path)) => setTabs((current) => { const existing = current.find((tab) => tab.path === path); if (existing) { setActiveId(existing.id); return current; } return current.map((tab) => tab.id === activeId ? { ...tab, path, title } : tab); });
  const closeTab = (id: string) => setTabs((current) => current.length > 1 ? current.filter((tab) => tab.id !== id) : current);
  const value = useMemo(() => ({ tabs, activeId, openTab, syncPath, closeTab }), [tabs, activeId]);
  return <WorkspaceTabsContext.Provider value={value}>{children}</WorkspaceTabsContext.Provider>;
}
export function useWorkspaceTabs() { const context = useContext(WorkspaceTabsContext); if (!context) throw new Error("useWorkspaceTabs precisa estar dentro de WorkspaceTabsProvider"); return context; }
export function WorkspaceTabs({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { tabs, activeId, closeTab } = useWorkspaceTabs();
  return <nav className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b bg-muted/20 px-3 pt-1" aria-label="Abas abertas">{tabs.map((tab, index) => { const active = tab.id === activeId; const canClose = tabs.length > 1; return <div key={tab.id} className={cn("group flex h-9 min-w-28 max-w-52 items-center gap-1 rounded-t-md border border-b-0 px-2 text-sm", active ? "bg-background font-medium text-foreground" : "border-transparent text-muted-foreground hover:bg-muted")}><button type="button" onClick={() => onNavigate(tab.path)} className="min-w-0 flex-1 truncate text-left">{tab.title}</button>{canClose && <button type="button" aria-label={`Fechar aba ${tab.title}`} onClick={(event) => { event.stopPropagation(); const fallback = tabs[index - 1] || tabs[index + 1]; closeTab(tab.id); if (active && fallback) onNavigate(fallback.path); }} className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/15 group-hover:opacity-100 focus:opacity-100"><X className="h-3.5 w-3.5" /></button>}</div>; })}</nav>;
}
