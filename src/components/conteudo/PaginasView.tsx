import { useState } from "react";
import { Bot, FileText, HelpCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { QuizzesView } from "./QuizzesView";
import { ChatbotView } from "./ChatbotView";
import { LandpagesView } from "./LandpagesView";

// Páginas (25/11/2026, Davi: "em vez de ter Chatbot e Quiz, vamos juntar em um só"): Quiz, Chatbot e Land page do projeto num lugar só.
// O "+" escolhe o tipo e abre a criação dele; as listas e os editores continuam sendo os de cada tipo.
export type TipoPagina = "quiz" | "chatbot" | "landpage";
const TIPOS: { id: TipoPagina; rotulo: string; icone: typeof Bot; descricao: string }[] = [
  { id: "quiz", rotulo: "Quiz", icone: HelpCircle, descricao: "Perguntas, resultado e oferta" },
  { id: "chatbot", rotulo: "Chatbot", icone: Bot, descricao: "Diagnóstico em conversa" },
  { id: "landpage", rotulo: "Land page", icone: FileText, descricao: "Página comprida com VSL" },
];

export function PaginasView({ clienteId, inicial = "quiz" }: { clienteId: string; inicial?: TipoPagina }) {
  const [tipo, setTipo] = useState<TipoPagina>(inicial);
  const [sinal, setSinal] = useState(0);
  const criar = (t: TipoPagina) => { setTipo(t); setSinal((n) => n + 1); };
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">Páginas</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button className="gap-1.5"><Plus className="h-4 w-4" />Nova página</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            {TIPOS.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => criar(t.id)} className="items-start gap-2.5 py-2">
                <t.icone className="mt-0.5 h-4 w-4 text-primary" />
                <span><b className="block text-sm">{t.rotulo}</b><span className="text-xs text-muted-foreground">{t.descricao}</span></span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
      <div className="flex flex-wrap gap-1.5">
        {TIPOS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTipo(t.id)} className={cn("flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors", tipo === t.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            <t.icone className="h-4 w-4" />{t.rotulo}
          </button>
        ))}
      </div>
      <div key={tipo} className="-mx-4 sm:-mx-6">
        {tipo === "quiz" && <QuizzesView clienteId={clienteId} sinalCriar={sinal} />}
        {tipo === "chatbot" && <ChatbotView clienteId={clienteId} sinalCriar={sinal} />}
        {tipo === "landpage" && <LandpagesView clienteId={clienteId} sinalCriar={sinal} />}
      </div>
    </div>
  );
}
