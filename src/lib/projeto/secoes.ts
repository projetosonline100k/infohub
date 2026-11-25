import {
  BookOpen, Brain, Building2, CalendarRange, FileText, Info, Lightbulb, ListChecks, LayoutTemplate, MessageCircle, Contact, Handshake, Megaphone, Video, Youtube, type LucideIcon,
} from "lucide-react";

// Seções de um projeto (as mesmas da página do projeto): usadas pela barra lateral em árvore e pelo ⌘K.
export interface SecaoProjeto { secao: string; titulo: string; icone: LucideIcon }
export const SECOES: SecaoProjeto[] = [
  { secao: "conteudo:visao-geral", titulo: "Escritório", icone: Building2 },
  { secao: "atividades", titulo: "Atividades", icone: ListChecks },
  { secao: "documentos", titulo: "Documentos", icone: FileText },
  { secao: "cerebro", titulo: "Cérebro", icone: Brain },
];
// 24/10 (Davi): dentro do Escritório, os mesmos itens das abas de cima, na mesma ordem.
export const SECOES_ESCRITORIO: SecaoProjeto[] = [
  { secao: "informacoes", titulo: "Informações gerais", icone: Info },
  { secao: "conteudo:vertical", titulo: "Vertical", icone: Video },
  { secao: "conteudo:youtube", titulo: "Youtube", icone: Youtube },
  { secao: "conteudo:brainstorm", titulo: "Brainstorm", icone: Lightbulb },
  { secao: "conteudo:cronograma", titulo: "Cronograma", icone: CalendarRange },
  { secao: "conteudo:conhecimento", titulo: "Fonte de conhecimento", icone: BookOpen },
  { secao: "conteudo:whatsapp", titulo: "WhatsApp", icone: MessageCircle },
  { secao: "conteudo:crm", titulo: "CRM", icone: Contact },
  { secao: "conteudo:embaixadores", titulo: "Embaixadores", icone: Handshake },
  { secao: "conteudo:trafego", titulo: "Tráfego", icone: Megaphone },
  { secao: "conteudo:paginas", titulo: "Páginas", icone: LayoutTemplate },
];
