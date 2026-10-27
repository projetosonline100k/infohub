import {
  BookOpen, Brain, Building2, CalendarDays, CalendarRange, Clapperboard, FileText, Folder, HelpCircle, Info, LayoutDashboard,
  Globe, Lightbulb, ListChecks, MessageCircle, PenTool, Timer, ShieldCheck, StickyNote, Target, Users, Youtube, Zap, type LucideIcon,
} from "lucide-react";

// Ícone de cada guia pelo que está aberto nela (24/10, Davi: "quero que as guias tenham ícones, para identificar
// mais rápido" — três guias "Core" ficavam iguais). Vale para as seções do projeto (?secao=), documento aberto
// (?documento=) e as páginas do menu.
const SECOES: Record<string, LucideIcon> = {
  "conteudo:visao-geral": Building2, informacoes: Info, atividades: ListChecks, documentos: Folder, pesquisa: HelpCircle,
  cerebro: Brain, "conteudo:vertical": Clapperboard, "conteudo:youtube": Youtube, "conteudo:brainstorm": Lightbulb,
  "conteudo:cronograma": CalendarRange, "conteudo:conhecimento": BookOpen, "conteudo:quiz": HelpCircle, "conteudo:whatsapp": MessageCircle,
};
const PAGINAS: [RegExp, LucideIcon][] = [
  [/^\/$/, LayoutDashboard], [/^\/agenda/, CalendarDays], [/^\/atividades/, ListChecks], [/^\/notas/, StickyNote],
  [/^\/produtividade/, Target], [/^\/automacoes/, Zap], [/^\/admin/, ShieldCheck], [/^\/clientes\/?$/, Users], [/^\/desenho\//, PenTool], [/^\/foco/, Timer], [/^\/navegar/, Globe],
];

export function iconeDaGuia(caminho: string): LucideIcon {
  const [rota, busca = ""] = caminho.split("?");
  const params = new URLSearchParams(busca);
  if (params.get("documento") || params.get("video")) return FileText;
  if (params.get("atividade")) return ListChecks;
  if (/^\/clientes\/[^/]+/.test(rota)) {
    const secao = params.get("secao") ?? "conteudo:visao-geral";
    return SECOES[secao] ?? SECOES[secao.split(":")[0]] ?? Building2;
  }
  return PAGINAS.find(([re]) => re.test(rota))?.[1] ?? FileText;
}

/** Nome da seção para o título da guia ("Core · Cronograma"), quando ajuda a diferenciar. */
export function nomeDaSecao(caminho: string): string | null {
  const [rota, busca = ""] = caminho.split("?");
  if (!/^\/clientes\/[^/]+/.test(rota)) return null;
  const params = new URLSearchParams(busca);
  if (params.get("documento") || params.get("video")) return null;
  const nomes: Record<string, string> = {
    "conteudo:visao-geral": "Escritório", informacoes: "Informações", atividades: "Atividades", documentos: "Documentos",
    pesquisa: "Pesquisa", cerebro: "Cérebro", "conteudo:vertical": "Vertical", "conteudo:youtube": "Youtube",
    "conteudo:brainstorm": "Brainstorm", "conteudo:cronograma": "Cronograma", "conteudo:conhecimento": "Fonte",
    "conteudo:quiz": "Quiz", "conteudo:whatsapp": "WhatsApp",
  };
  return nomes[params.get("secao") ?? "conteudo:visao-geral"] ?? null;
}
