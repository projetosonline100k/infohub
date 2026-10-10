import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Columns2, X } from "lucide-react";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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
  // Visualização dividida (como no Chrome, até 3 guias lado a lado): as
  // guias ficam nessa ordem, da esquerda pra direita; a ativa é a última
  // clicada. `larguras` = fração da largura de cada uma (soma 1).
  divisao: string[] | null;
  larguras: number[];
  // Divisória `indice` (entre o painel indice e indice+1) foi arrastada até
  // a fração `x` da largura total.
  moverDivisoria: (indice: number, x: number) => void;
  igualarLarguras: () => void;
  // Divide `tabId` com `outroId` (ou com uma guia nova). Se `tabId` já está
  // numa tela dividida com menos de 3, a outra entra como mais um painel.
  // Devolve a guia que ficou ativa — quem chama navega pra ela.
  dividir: (tabId: string, outroId?: string) => WorkspaceTab;
  // Tira uma guia da tela dividida (se sobrar só uma, desfaz a divisão).
  tirarDaDivisao: (tabId: string) => void;
  desfazerDivisao: () => void;
  focarGuia: (id: string) => void;
  // Guia nova (Painel) logo depois de `tabId`; devolve a guia criada.
  novaGuiaADireita: (tabId: string) => WorkspaceTab;
  fecharOutras: (id: string) => void;
  // Abre `path` ao lado da guia ativa (tela dividida); devolve a guia aberta.
  abrirAoLado: (path: string, title?: string) => WorkspaceTab;
}

export const MAX_PAINEIS = 3;
const LARGURA_MINIMA = 0.15;
const iguais = (n: number) => Array.from({ length: n }, () => 1 / n);

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
      // A guia ativa já está nesse endereço: fica nela (com a tela dividida
      // pode haver duas guias no mesmo endereço, ex.: dois Painéis).
      if (current.find((tab) => tab.id === activeIdRef.current)?.path === path) return current;
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

  const [divisao, setDivisaoState] = useState<string[] | null>(null);
  const [larguras, setLarguras] = useState<number[]>([]);
  // Toda mudança na lista de painéis volta pra larguras iguais (a não ser a
  // de 2 guias, que lembra a última proporção usada).
  const setDivisao = useCallback((ids: string[] | null) => {
    const lista = ids && ids.length >= 2 ? ids.slice(0, MAX_PAINEIS) : null;
    setDivisaoState(lista);
    if (!lista) return;
    if (lista.length === 2) {
      let p = 0.5;
      try { const v = Number(localStorage.getItem("workspace:proporcao-divisao")); if (v >= 0.2 && v <= 0.8) p = v; } catch { /* sem storage */ }
      setLarguras([p, 1 - p]);
    } else {
      setLarguras(iguais(lista.length));
    }
  }, []);

  const moverDivisoria = useCallback((indice: number, x: number) => {
    setLarguras((atual) => {
      const antes = atual.slice(0, indice).reduce((a, b) => a + b, 0);
      const par = atual[indice] + atual[indice + 1];
      const esquerda = Math.min(par - LARGURA_MINIMA, Math.max(LARGURA_MINIMA, x - antes));
      const novo = [...atual];
      novo[indice] = esquerda;
      novo[indice + 1] = par - esquerda;
      if (novo.length === 2) {
        try { localStorage.setItem("workspace:proporcao-divisao", String(novo[0])); } catch { /* sem storage */ }
      }
      return novo;
    });
  }, []);
  const igualarLarguras = useCallback(() => setLarguras((a) => iguais(a.length)), []);

  const closeTab = (id: string) => {
    if (divisao?.includes(id)) setDivisao(divisao.filter((x) => x !== id));
    setTabs((current) => current.length > 1 ? current.filter((tab) => tab.id !== id) : current);
  };

  const criarGuiaDepois = (tabId: string): WorkspaceTab => {
    const nova = { id: `/-${Date.now()}`, path: "/", title: "Painel" };
    setTabs((current) => {
      const i = current.findIndex((t) => t.id === tabId);
      const next = [...current];
      next.splice(i < 0 ? next.length : i + 1, 0, nova);
      return next;
    });
    return nova;
  };

  const novaGuiaADireita = (tabId: string) => {
    const nova = criarGuiaDepois(tabId);
    setActiveId(nova.id);
    return nova;
  };

  // Coloca `alvo` na barra logo depois de `depoisDe` (como no Chrome).
  const posicionarDepois = (alvo: WorkspaceTab, depoisDe: string) => {
    setTabs((current) => {
      const sem = current.filter((t) => t.id !== alvo.id);
      const i = sem.findIndex((t) => t.id === depoisDe);
      sem.splice(i < 0 ? sem.length : i + 1, 0, alvo);
      return sem;
    });
  };

  // Se `base` já está numa divisão com espaço, entra como mais um painel;
  // senão começa uma divisão nova só com as duas.
  const juntarNaDivisao = (base: string, alvoId: string) => {
    if (divisao?.includes(base) && !divisao.includes(alvoId) && divisao.length < MAX_PAINEIS) {
      setDivisao([...divisao, alvoId]);
    } else if (!divisao?.includes(base) || !divisao.includes(alvoId)) {
      setDivisao([base, alvoId]);
    }
  };

  const dividir = (tabId: string, outroId?: string): WorkspaceTab => {
    const outra = outroId ? tabs.find((t) => t.id === outroId) : undefined;
    const ultimo = divisao?.includes(tabId) ? divisao[divisao.length - 1] : tabId;
    const alvo = outra ?? criarGuiaDepois(ultimo);
    if (outra) posicionarDepois(outra, ultimo);
    juntarNaDivisao(tabId, alvo.id);
    setActiveId(alvo.id);
    return alvo;
  };

  const abrirAoLado = (path: string, title = titleForPath(path)): WorkspaceTab => {
    const base = activeIdRef.current;
    const existente = tabs.find((t) => t.path === path && t.id !== base && !divisao?.includes(t.id));
    const alvo = existente ?? { id: `${path}-${Date.now()}`, path, title };
    const ultimo = divisao?.includes(base) ? divisao[divisao.length - 1] : base;
    posicionarDepois(alvo, ultimo);
    juntarNaDivisao(base, alvo.id);
    setActiveId(alvo.id);
    return alvo;
  };

  const tirarDaDivisao = (tabId: string) => { if (divisao) setDivisao(divisao.filter((x) => x !== tabId)); };
  const desfazerDivisao = () => setDivisao(null);
  const focarGuia = (id: string) => setActiveId(id);
  const fecharOutras = (id: string) => {
    setDivisao(null);
    setTabs((current) => current.filter((t) => t.id === id));
    setActiveId(id);
  };
  const reorderTabs = (fromId: string, toId: string) => setTabs((current) => { const from = current.findIndex((tab) => tab.id === fromId); const to = current.findIndex((tab) => tab.id === toId); if (from < 0 || to < 0 || from === to) return current; const next = [...current]; const [tab] = next.splice(from, 1); next.splice(to, 0, tab); return next; });
  // Destaca a aba numa janela própria (como o Chrome), posicionada sob o cursor.
  const detachTab = async (tab: WorkspaceTab, posicao?: { x: number; y: number }) => {
    const x = posicao ? Math.max(0, Math.round(posicao.x - 120)) : undefined;
    const y = posicao ? Math.max(0, Math.round(posicao.y - 20)) : undefined;
    if (isDesktop()) {
      // Criada no Rust (src-tauri/src/janelas.rs): erros vão pro log do terminal.
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("destacar_aba", { caminho: tab.path, titulo: tab.title, x: x ?? null, y: y ?? null });
      } catch (erro) {
        toast.error(`Não consegui abrir a aba numa janela nova: ${String(erro)}`);
        return;
      }
    } else {
      const extras = posicao ? `,left=${x},top=${y}` : "";
      if (!window.open(tab.path, "_blank", `popup,width=1280,height=800${extras}`)) return;
    }
    closeTab(tab.id);
  };

  const value = useMemo(() => ({
    tabs, activeId, openTab, syncPath, closeTab, reorderTabs, detachTab,
    divisao, larguras, moverDivisoria, igualarLarguras, dividir, tirarDaDivisao, desfazerDivisao, focarGuia,
    novaGuiaADireita, fecharOutras, abrirAoLado,
  }), [tabs, activeId, divisao, larguras]);
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
  const {
    tabs, activeId, closeTab, reorderTabs, detachTab, divisao, dividir, tirarDaDivisao, desfazerDivisao, novaGuiaADireita, fecharOutras,
  } = useWorkspaceTabs();
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const [arrasto, setArrastoState] = useState<Arrasto | null>(null);
  // Ref síncrona: pointerup e lostpointercapture chegam no mesmo instante e
  // um não pode destacar a aba de novo depois do outro.
  const arrastoRef = useRef<Arrasto | null>(null);
  const setArrasto = (valor: Arrasto | null) => { arrastoRef.current = valor; setArrastoState(valor); };
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
    // Sem isto o WebView do Mac inicia um arrastar nativo (aparece o
    // "fantasma" com o título e "localhost"), cancela os eventos de ponteiro
    // e a aba nunca chega a ser destacada.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setArrasto({ id: tab.id, inicioX: event.clientX, inicioY: event.clientY, x: event.clientX, y: event.clientY, arrastando: false, destacando: false });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const arrasto = arrastoRef.current;
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
    const atual = arrastoRef.current;
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

  // Soltar fora da janela às vezes não entrega o pointerup (o WebView perde a
  // captura): se estava no modo "destacar", destaca mesmo assim.
  const onLostPointerCapture = (tab: WorkspaceTab) => {
    const atual = arrastoRef.current;
    if (!atual || atual.id !== tab.id || !atual.destacando) return;
    setArrasto(null);
    const fallback = fallbackDe(tab.id);
    const eraAtiva = tab.id === activeId;
    void detachTab(tab, { x: window.screenX + atual.x, y: window.screenY + atual.y }).then(() => {
      if (eraAtiva && fallback) onNavigate(fallback.path);
    });
  };

  const tabArrastada = arrasto?.destacando ? tabs.find((tab) => tab.id === arrasto.id) : undefined;

  return <nav ref={navRef} onDragStart={(event) => event.preventDefault()} className="relative z-[100] flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b bg-background px-3 pt-1 shadow-sm" aria-label="Abas abertas">
    {tabs.map((tab) => {
      const active = tab.id === activeId;
      const canClose = tabs.length > 1;
      const sendoArrastada = arrasto?.arrastando && arrasto.id === tab.id;
      const naDivisao = !!divisao?.includes(tab.id);
      // Cabe mais um painel? (até 3 lado a lado)
      const cabeMais = !naDivisao || divisao!.length < MAX_PAINEIS;
      const outras = tabs.filter((t) => t.id !== tab.id && !(naDivisao && divisao!.includes(t.id)));
      return <ContextMenu key={tab.id}>
        <ContextMenuTrigger asChild>
      <div
        ref={(el) => { if (el) tabRefs.current.set(tab.id, el); else tabRefs.current.delete(tab.id); }}
        role="tab"
        aria-selected={active}
        tabIndex={0}
        onPointerDown={(event) => onPointerDown(event, tab)}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => onPointerUp(event, tab)}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
        onPointerCancel={() => setArrasto(null)}
        onLostPointerCapture={() => onLostPointerCapture(tab)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onNavigate(tab.path); }}
        className={cn("group flex h-9 min-w-28 max-w-52 cursor-default select-none touch-none items-center [-webkit-user-drag:none] gap-1 rounded-t-md border border-b-0 px-2 text-sm", active ? "bg-background font-medium text-foreground" : "border-transparent text-muted-foreground hover:bg-muted", naDivisao && !active && "bg-muted/60", sendoArrastada && "opacity-60", arrasto?.destacando && arrasto.id === tab.id && "opacity-30")}
      >
        {naDivisao && <Columns2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Na tela dividida" />}
        <span className="min-w-0 flex-1 truncate text-left">{tab.title}</span>
        {canClose && <button type="button" data-fechar-aba aria-label={`Fechar aba ${tab.title}`} onClick={(event) => { event.stopPropagation(); fechar(tab); }} className="rounded p-0.5 opacity-0 transition-opacity hover:bg-muted-foreground/15 group-hover:opacity-100 focus:opacity-100"><X className="h-3.5 w-3.5" /></button>}
      </div>
        </ContextMenuTrigger>
        {/* Botão direito na guia: mesmo menu do Chrome (o essencial). */}
        <ContextMenuContent className="z-[300] w-64">
          <ContextMenuItem onSelect={() => onNavigate(novaGuiaADireita(tab.id).path)}>Nova guia à direita</ContextMenuItem>
          {cabeMais && (
            <ContextMenuItem onSelect={() => onNavigate(dividir(tab.id).path)}>
              {naDivisao ? "Adicionar mais uma guia à tela dividida" : "Adicionar guia à visualização dividida"}
            </ContextMenuItem>
          )}
          {cabeMais && outras.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>{naDivisao ? "Colocar também ao lado…" : "Dividir com…"}</ContextMenuSubTrigger>
              <ContextMenuSubContent className="z-[310] max-h-80 w-56 overflow-y-auto">
                {outras.map((o) => (
                  <ContextMenuItem key={o.id} onSelect={() => onNavigate(dividir(tab.id, o.id).path)}>
                    <span className="truncate">{o.title}</span>
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          {naDivisao && divisao!.length > 2 && <ContextMenuItem onSelect={() => tirarDaDivisao(tab.id)}>Tirar esta guia da tela dividida</ContextMenuItem>}
          {naDivisao && <ContextMenuItem onSelect={desfazerDivisao}>Desfazer a tela dividida</ContextMenuItem>}
          {podeDestacar && (
            <ContextMenuItem onSelect={() => {
              const fallback = fallbackDe(tab.id);
              const eraAtiva = tab.id === activeId;
              void detachTab(tab).then(() => { if (eraAtiva && fallback) onNavigate(fallback.path); });
            }}>Mover guia para uma nova janela</ContextMenuItem>
          )}
          <ContextMenuSeparator />
          {canClose && <ContextMenuItem onSelect={() => fechar(tab)}>Fechar</ContextMenuItem>}
          {canClose && <ContextMenuItem onSelect={() => { fecharOutras(tab.id); onNavigate(tab.path); }}>Fechar outras guias</ContextMenuItem>}
        </ContextMenuContent>
      </ContextMenu>;
    })}
    {tabArrastada && arrasto && <div className="pointer-events-none fixed z-[200] flex h-9 w-52 items-center rounded-md border bg-background px-3 text-sm font-medium shadow-lg" style={{ left: arrasto.x - 40, top: arrasto.y - 18 }}>
      <span className="truncate">{tabArrastada.title}</span>
    </div>}
  </nav>;
}
