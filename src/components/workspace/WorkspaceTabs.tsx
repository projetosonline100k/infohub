import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { EVENTO_FECHAR_GUIA } from "@/lib/desktop/desfazer";
import { useSemRespostaWhatsapp } from "@/hooks/useSemRespostaWhatsapp";
import { ArrowLeft, ArrowRight, Columns2, X } from "lucide-react";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { isDesktop } from "@/lib/platform";
import { lerSessao, salvarSessao } from "@/lib/workspace/sessao";
import { iconeDaGuia, nomeDaSecao } from "@/lib/workspace/iconeDaGuia";
import { supabase } from "@/integrations/supabase/client";

export interface WorkspaceTab {
  id: string;
  path: string;
  title: string;
}

interface WorkspaceTabsContextValue {
  tabs: WorkspaceTab[];
  activeId: string;
  /** `nova`: sempre cria outra guia (⌘+clique), mesmo que já exista uma nesse endereço */
  openTab: (path: string, title?: string, opcoes?: { nova?: boolean }) => void;
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
  // Guia NOVA com `path`, logo depois da ativa, e já ativa (⌘T, escolha no ⌘K — 19/10).
  // Quem chama navega para `path`.
  abrirNovaGuia: (path: string, title?: string) => WorkspaceTab;
  juntarGrupos: () => void;
  // Abre `path` ao lado da guia ativa (tela dividida); devolve a guia aberta.
  abrirAoLado: (path: string, title?: string) => WorkspaceTab;
  // Voltar/avançar como no navegador (24/10), com o histórico de CADA guia. Devolvem o endereço para onde
  // ir (quem chama navega) ou null se não há para onde.
  voltar: () => string | null;
  // Nome que aparece na guia para um endereço (25/10: o roteiro aberto mostra o título dele em vez do projeto).
  nomesPorEndereco: Record<string, string>;
  nomearEndereco: (path: string, nome: string | null) => void;
  avancar: () => string | null;
  podeVoltar: boolean;
  podeAvancar: boolean;
}

export const MAX_PAINEIS = 3;
const LARGURA_MINIMA = 0.15;
const iguais = (n: number) => Array.from({ length: n }, () => 1 / n);

const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | null>(null);

// Grupos de guias (26/10, Davi: "organizar as guias por grupos — as da mesma família ficam separadas; uma cor
// diferente na guia"): o grupo é o projeto (/clientes/<id>). Guia nova de um projeto abre logo depois das
// outras dele e todas levam a cor dele embaixo.
export function grupoDaGuia(caminho: string): string | null {
  return caminho.split("?")[0].match(/^\/clientes\/([^/]+)/)?.[1] ?? null;
}
const CORES_GRUPO = [212, 152, 28, 330, 262, 188, 4, 96];   // matizes bem separados
export function corDoGrupo(grupo: string): string {
  let h = 0;
  for (const ch of grupo) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${CORES_GRUPO[h % CORES_GRUPO.length]} 70% 50%)`;
}
function inserirNoGrupo(lista: WorkspaceTab[], nova: WorkspaceTab): WorkspaceTab[] {
  const grupo = grupoDaGuia(nova.path);
  let ultima = -1;
  if (grupo) lista.forEach((t, i) => { if (grupoDaGuia(t.path) === grupo) ultima = i; });
  if (ultima < 0) return [...lista, nova];
  const next = [...lista];
  next.splice(ultima + 1, 0, nova);
  return next;
}
// Ações que não mudam (26/10, "trocar de guia demora"): páginas que só ABREM guias (projeto, documentos…)
// usam este, que nunca muda; com o contexto inteiro, elas eram redesenhadas a cada troca de guia.
type AcoesGuias = Pick<WorkspaceTabsContextValue, "openTab" | "abrirAoLado">;
const WorkspaceAcoesContext = createContext<AcoesGuias | null>(null);

const titleForPath = (path: string) => {
  if (path === "/") return "Painel";
  if (path === "/clientes") return "Projetos";
  if (path === "/atividades") return "Atividades";
  if (path === "/notas") return "Notas";
  if (path === "/produtividade") return "Produtividade";
  if (path === "/agenda") return "Agenda";
  if (path === "/admin") return "Administração";
  if (path === "/automacoes") return "Automações";
  if (path === "/ponte") return "Ponte";
  if (path === "/foco") return "Modo Foco";
  if (path.startsWith("/clientes/")) return "Projeto";
  return "Infopro Hub";
};

export function WorkspaceTabsProvider({ children }: { children: React.ReactNode }) {
  // Sessão anterior (guias, ativa, tela dividida): só na janela principal do Mac.
  const sessao = useRef(lerSessao()).current;
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => sessao?.tabs ?? [{ id: "tab-inicial", path: "/", title: "Painel" }]);
  const [activeId, setActiveIdState] = useState(() => sessao?.activeId ?? "tab-inicial");
  // Ref evita closures velhas: syncPath roda num efeito e precisa da aba ativa atual.
  const activeIdRef = useRef(activeId);
  const setActiveId = useCallback((id: string) => { activeIdRef.current = id; setActiveIdState(id); }, []);
  // Voltar/avançar: o endereço fica nesta guia, mesmo que outra guia esteja aberta nele.
  const irNaAtivaRef = useRef<string | null>(null);

  const openTab = useCallback((path: string, title = titleForPath(path), opcoes?: { nova?: boolean }) => {
    setTabs((current) => {
      const existing = opcoes?.nova ? undefined : current.find((tab) => tab.path === path);
      if (existing) {
        setActiveId(existing.id);
        return current;
      }
      const tab = { id: `${path}-${Date.now()}`, path, title };
      setActiveId(tab.id);
      return inserirNoGrupo(current, tab);
    });
  }, [setActiveId]);

  // Navegação comum troca o conteúdo da aba selecionada; não cria uma nova.
  const syncPath = useCallback((path: string, title = titleForPath(path)) => {
    setTabs((current) => {
      // A guia ativa já está nesse endereço: fica nela (com a tela dividida
      // pode haver duas guias no mesmo endereço, ex.: dois Painéis).
      if (current.find((tab) => tab.id === activeIdRef.current)?.path === path) return current;
      const doHistorico = irNaAtivaRef.current === path;
      irNaAtivaRef.current = null;
      const existing = doHistorico ? undefined : current.find((tab) => tab.path === path);
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

  // Guia de projeto aberta pelo ⌘K, por atalho ou restaurada mostrava só "Projeto" (19/10, Davi):
  // troca pelo nome do projeto assim que ele chega do banco.
  const nomesProjeto = useRef<Record<string, string>>({});
  useEffect(() => {
    const idDe = (path: string) => path.match(/^\/clientes\/([0-9a-f-]{36})/i)?.[1];
    const faltam = [...new Set(tabs.filter((t) => t.title === "Projeto").map((t) => idDe(t.path)).filter((x): x is string => !!x))];
    if (!faltam.length) return;
    const aplicar = () => setTabs((atual) => {
      const novo = atual.map((t) => {
        const id = idDe(t.path);
        return t.title === "Projeto" && id && nomesProjeto.current[id] ? { ...t, title: nomesProjeto.current[id] } : t;
      });
      return novo.some((t, i) => t !== atual[i]) ? novo : atual;   // sem nome novo: não mexe (evita laço)
    });
    const buscar = faltam.filter((id) => !nomesProjeto.current[id]);
    if (!buscar.length) { aplicar(); return; }
    void supabase.from("clientes").select("id, nome_especialista").in("id", buscar).then(({ data }) => {
      for (const c of data ?? []) if (c.nome_especialista) nomesProjeto.current[c.id] = c.nome_especialista;
      aplicar();
    });
  }, [tabs]);

  const [divisao, setDivisaoState] = useState<string[] | null>(() => sessao?.divisao ?? null);
  const [larguras, setLarguras] = useState<number[]>(() => sessao?.larguras ?? []);
  useEffect(() => { salvarSessao({ tabs, activeId, divisao, larguras }); }, [tabs, activeId, divisao, larguras]);
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
  // Botão direito › "Juntar as guias de cada projeto": as de um mesmo projeto ficam lado a lado, na ordem em
  // que o primeiro aparece; as outras ficam onde estão.
  const juntarGrupos = () => setTabs((current) => {
    const usados = new Set<string>();
    const next: WorkspaceTab[] = [];
    for (const t of current) {
      const g = grupoDaGuia(t.path);
      if (!g) { next.push(t); continue; }
      if (usados.has(g)) continue;
      usados.add(g);
      next.push(...current.filter((x) => grupoDaGuia(x.path) === g));
    }
    return next;
  });
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

  const abrirNovaGuia = (path: string, title = titleForPath(path)): WorkspaceTab => {
    const nova = { id: `${path}-${Date.now()}`, path, title };
    // 26/10 (Davi: "o ⌘T abre a guia do meu lado; preciso que seja no final"): no fim da barra — ou, se for
    // de um projeto que já tem guias abertas, logo depois delas.
    setTabs((current) => inserirNoGrupo(current, nova));
    setActiveId(nova.id);
    return nova;
  };

  // Histórico de cada guia (24/10, Davi: "seta para voltar ou avançar, igual ao do Google"): os endereços por
  // onde a guia passou e onde ela está agora. Ir para um endereço novo corta o "avançar", como no navegador.
  const historicos = useRef(new Map<string, { pilha: string[]; i: number }>());
  const [versaoHistorico, setVersaoHistorico] = useState(0);
  useEffect(() => {
    const ativa = tabs.find((t) => t.id === activeId);
    if (!ativa) return;
    const h = historicos.current.get(ativa.id);
    if (!h) { historicos.current.set(ativa.id, { pilha: [ativa.path], i: 0 }); setVersaoHistorico((v) => v + 1); return; }
    if (h.pilha[h.i] === ativa.path) return;   // veio do voltar/avançar, ou nada mudou
    h.pilha = [...h.pilha.slice(0, h.i + 1), ativa.path].slice(-50);
    h.i = h.pilha.length - 1;
    setVersaoHistorico((v) => v + 1);
  }, [tabs, activeId]);
  useEffect(() => {
    for (const id of [...historicos.current.keys()]) if (!tabs.some((t) => t.id === id)) historicos.current.delete(id);
  }, [tabs]);
  const andarNoHistorico = useCallback((passo: number) => {
    const h = historicos.current.get(activeIdRef.current);
    if (!h || h.i + passo < 0 || h.i + passo >= h.pilha.length) return null;
    h.i += passo;
    setVersaoHistorico((v) => v + 1);
    irNaAtivaRef.current = h.pilha[h.i];
    return h.pilha[h.i];
  }, []);
  const [nomesPorEndereco, setNomesPorEndereco] = useState<Record<string, string>>({});
  const nomearEndereco = useCallback((path: string, nome: string | null) => setNomesPorEndereco((m) => {
    if ((m[path] ?? null) === nome) return m;
    const n = { ...m };
    if (nome) n[path] = nome; else delete n[path];
    return n;
  }), []);
  const hAtual = historicos.current.get(activeId);
  const podeVoltar = !!hAtual && hAtual.i > 0;
  const podeAvancar = !!hAtual && hAtual.i < hAtual.pilha.length - 1;

  const value = useMemo(() => ({
    tabs, activeId, openTab, syncPath, closeTab, reorderTabs, detachTab,
    divisao, larguras, moverDivisoria, igualarLarguras, dividir, tirarDaDivisao, desfazerDivisao, focarGuia,
    novaGuiaADireita, fecharOutras, abrirAoLado, abrirNovaGuia, juntarGrupos,
    voltar: () => andarNoHistorico(-1), avancar: () => andarNoHistorico(1), podeVoltar, podeAvancar,
    nomesPorEndereco, nomearEndereco,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tabs, activeId, divisao, larguras, versaoHistorico, podeVoltar, podeAvancar, nomesPorEndereco]);
  const valorRef = useRef(value);
  valorRef.current = value;
  const acoes = useMemo<AcoesGuias>(() => ({
    openTab: (...a) => valorRef.current.openTab(...a),
    abrirAoLado: (...a) => valorRef.current.abrirAoLado(...a),
  }), []);
  return (
    <WorkspaceAcoesContext.Provider value={acoes}>
      <WorkspaceTabsContext.Provider value={value}>{children}</WorkspaceTabsContext.Provider>
    </WorkspaceAcoesContext.Provider>
  );
}

/** Só abrir guias (openTab / abrirAoLado), sem redesenhar a página quando a guia ativa muda. */
export function useWorkspaceAcoes() {
  const acoes = useContext(WorkspaceAcoesContext);
  if (!acoes) throw new Error("useWorkspaceAcoes precisa estar dentro de WorkspaceTabsProvider");
  return acoes;
}

/** Igual ao useWorkspaceTabs, mas devolve null fora do provider (ex.: busca usada fora do workspace). */
export function useWorkspaceTabsOpcional() {
  return useContext(WorkspaceTabsContext);
}

export function useWorkspaceTabs() {
  const context = useContext(WorkspaceTabsContext);
  if (!context) throw new Error("useWorkspaceTabs precisa estar dentro de WorkspaceTabsProvider");
  return context;
}

// Guia do WhatsApp de um projeto (/clientes/<id>?secao=conteudo:whatsapp): o ícone leva quantas conversas
// esperam resposta (26/10).
function clienteDoWhatsapp(caminho: string): string | null {
  const [rota, busca = ""] = caminho.split("?");
  const m = rota.match(/^\/clientes\/([^/]+)/);
  return m && new URLSearchParams(busca).get("secao") === "conteudo:whatsapp" ? m[1] : null;
}
function IconeComPendentes({ clienteId, children }: { clienteId: string; children: React.ReactNode }) {
  const n = useSemRespostaWhatsapp(clienteId);
  return (
    <span className={cn("relative inline-flex shrink-0", n > 0 && "mr-2")} title={n ? `${n} ${n === 1 ? "conversa espera" : "conversas esperam"} sua resposta` : undefined}>
      {children}
      {n > 0 && (
        <span className="absolute -right-2 -top-1.5 min-w-[15px] rounded-full bg-orange-500 px-1 text-center text-[9px] font-bold leading-[15px] text-white shadow-sm">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </span>
  );
}

// Arrastar a aba mais que isso para fora da barra a destaca numa janela nova.
const DISTANCIA_DESTACAR = 70;
const LIMIAR_ARRASTO = 5;

interface Arrasto { id: string; inicioX: number; inicioY: number; x: number; y: number; arrastando: boolean; destacando: boolean }

export function WorkspaceTabs({ onNavigate }: { onNavigate: (path: string) => void }) {
  const {
    tabs, activeId, closeTab, reorderTabs, detachTab, divisao, dividir, tirarDaDivisao, desfazerDivisao, novaGuiaADireita, fecharOutras, abrirNovaGuia, juntarGrupos,
    voltar, avancar, podeVoltar, podeAvancar, nomesPorEndereco,
  } = useWorkspaceTabs();
  // Voltar/avançar também pelo teclado (⌘[ e ⌘], como no Chrome) e pelos botões laterais do mouse.
  const voltarRef = useRef(() => { const p = voltar(); if (p) onNavigate(p); });
  voltarRef.current = () => { const p = voltar(); if (p) onNavigate(p); };
  const avancarRef = useRef(() => { const p = avancar(); if (p) onNavigate(p); });
  avancarRef.current = () => { const p = avancar(); if (p) onNavigate(p); };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key === "[") { e.preventDefault(); voltarRef.current(); }
      else if (e.key === "]") { e.preventDefault(); avancarRef.current(); }
    };
    const mouse = (e: MouseEvent) => {
      if (e.button === 3) { e.preventDefault(); voltarRef.current(); }
      else if (e.button === 4) { e.preventDefault(); avancarRef.current(); }
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("mouseup", mouse);
    return () => { window.removeEventListener("keydown", tecla); window.removeEventListener("mouseup", mouse); };
  }, []);
  const navRef = useRef<HTMLElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const [arrasto, setArrastoState] = useState<Arrasto | null>(null);
  // Ref síncrona: pointerup e lostpointercapture chegam no mesmo instante e
  // um não pode destacar a aba de novo depois do outro.
  const arrastoRef = useRef<Arrasto | null>(null);
  const setArrasto = (valor: Arrasto | null) => { arrastoRef.current = valor; setArrastoState(valor); };
  const podeDestacar = tabs.length > 1;

  // ⌘1…⌘8 vão para a aba daquela posição e ⌘9 para a última, como no
  // navegador (pedido do Davi, 15/10). Com a conversa do Atlas aberta, o ⌘1
  // é dela (AssistantConversaTab pega antes, na captura).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || !/^[1-9]$/.test(e.key)) return;
      const n = Number(e.key);
      const alvo = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
      if (!alvo) return;
      e.preventDefault();
      if (alvo.id !== activeId) onNavigate(alvo.path);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [tabs, activeId, onNavigate]);

  // ⌘T: guia nova no Painel, como no navegador (19/10).
  const abrirNovaGuiaRef = useRef(abrirNovaGuia);
  abrirNovaGuiaRef.current = abrirNovaGuia;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "t") return;
      e.preventDefault();
      onNavigate(abrirNovaGuiaRef.current("/").path);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onNavigate]);

  // ⌘W: fecha a guia aberta (26/10). No app do Mac vem do menu "Janela > Fechar guia" (o navegador não
  // deixa a página pegar o ⌘W). Com uma guia só, não fecha nada.
  const fecharAtivaRef = useRef<() => void>(() => {});
  fecharAtivaRef.current = () => {
    const ativa = tabs.find((t) => t.id === activeId);
    if (ativa && tabs.length > 1) fechar(ativa);
  };
  useEffect(() => {
    const aoFechar = () => fecharAtivaRef.current();
    window.addEventListener(EVENTO_FECHAR_GUIA, aoFechar);
    return () => window.removeEventListener(EVENTO_FECHAR_GUIA, aoFechar);
  }, []);

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

  // No Mac as guias moram na barra de título, ao lado dos botões da janela (18/10, Davi: "igual
  // do Chrome"): espaço à esquerda para os três botões e a parte vazia arrasta a janela
  // (data-tauri-drag-region; dois cliques maximizam).
  const naBarraDeTitulo = isDesktop() && /Mac/i.test(navigator.userAgent);
  return <nav ref={navRef} data-tauri-drag-region={naBarraDeTitulo ? "" : undefined} onDragStart={(event) => event.preventDefault()}
    // pointer-events-auto (19/10, Davi: "clico nas guias e não vai, preciso apertar ⌘+número"): com uma
    // janela aberta por cima (ex.: a da Shirley), o resto da tela fica sem clique; as guias continuam clicáveis.
    data-barra-guias=""
    className={cn("pointer-events-auto relative z-[100] flex shrink-0 items-end gap-1 overflow-x-auto border-b bg-background px-3 shadow-sm",
      naBarraDeTitulo ? "h-[42px] pl-[84px] pt-1.5 bg-muted" : "h-10 pt-1")} aria-label="Abas abertas">
    {/* Voltar / avançar desta guia (24/10), como as setas do navegador. */}
    <div className="mb-1 flex shrink-0 items-center gap-0.5 self-center pr-1">
      <button type="button" onClick={() => voltarRef.current()} disabled={!podeVoltar} aria-label="Voltar" title="Voltar (⌘[)"
        className="seta-guia flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-35">
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => avancarRef.current()} disabled={!podeAvancar} aria-label="Avançar" title="Avançar (⌘])"
        className="seta-guia flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-35">
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
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
        className={cn("group relative flex h-9 min-w-28 max-w-52 cursor-default select-none touch-none items-center [-webkit-user-drag:none] gap-1 rounded-t-md border border-b-0 px-2 text-sm", active ? "aba-ativa bg-background font-medium text-foreground" : "aba border-transparent text-muted-foreground hover:bg-muted", naDivisao && !active && "bg-muted/60", sendoArrastada && "opacity-60", arrasto?.destacando && arrasto.id === tab.id && "opacity-30")}
      >
        {(() => { const g = grupoDaGuia(tab.path); return g ? <span aria-hidden className="pointer-events-none absolute inset-x-1.5 bottom-0 h-[3px] rounded-full" style={{ background: corDoGrupo(g), opacity: active ? 1 : 0.75 }} /> : null; })()}
        {naDivisao && <Columns2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Na tela dividida" />}
        {(() => {
          const Icone = iconeDaGuia(tab.path);
          const icone = <Icone className={cn("h-3.5 w-3.5 shrink-0", active ? "text-primary" : "opacity-70")} />;
          const whats = clienteDoWhatsapp(tab.path);
          return whats ? <IconeComPendentes clienteId={whats}>{icone}</IconeComPendentes> : icone;
        })()}
        <span className="min-w-0 flex-1 truncate text-left" title={nomesPorEndereco[tab.path] ? `${nomesPorEndereco[tab.path]} · ${tab.title}` : tab.title}>
          {nomesPorEndereco[tab.path] ?? tab.title}
          {/* Guias com o mesmo nome (ex.: três "Core"): mostra a seção ao lado. */}
          {(() => { const secao = nomeDaSecao(tab.path); return secao && !nomesPorEndereco[tab.path] && !tab.title.includes(secao) && tabs.filter((t) => t.title === tab.title).length > 1 ? <span className="opacity-60"> · {secao}</span> : null; })()}
        </span>
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
          <ContextMenuItem onSelect={juntarGrupos}>Juntar as guias de cada projeto</ContextMenuItem>
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
