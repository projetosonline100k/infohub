import { useState } from "react";
import { ArrowLeft, ListTodo, MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MembroResumo, Sinal } from "@/lib/empresa/visaoGeral";
import { CabecaBoneco } from "./BonecoMesa";
import { BriefingTarefa } from "./BriefingTarefa";
import { criarTarefaParaMembro } from "./FilaPessoa";
import { ehCoordenador } from "@/lib/empresa/visaoGeral";

// Gaveta da equipe na lateral direita, no jeito do Messenger (pedido do
// Davi): fechada é uma aba com as carinhas; aberta lista todo mundo com o
// status; clicando em alguém abre a conversa (o mesmo briefing da fila da
// pessoa: ela diz o que entendeu e, confirmando, vira tarefa).
export interface PessoaChat { membro: MembroResumo; sinal: Sinal; atual: string | null }

const STATUS: Record<Sinal, { cor: string; texto: string }> = {
  trabalhando: { cor: "bg-emerald-500", texto: "Online · trabalhando" },
  esperando: { cor: "bg-amber-400", texto: "Precisa de você" },
  problema: { cor: "bg-rose-500", texto: "Com problema" },
  parado: { cor: "bg-zinc-400", texto: "Livre" },
};

export function EquipeMessenger({ clienteId, pessoas, onAbrirFila, onMudou }: {
  clienteId: string; pessoas: PessoaChat[]; onAbrirFila: (m: MembroResumo) => void; onMudou: () => void;
}) {
  const [aberta, setAberta] = useState(false);
  const [conversa, setConversa] = useState<PessoaChat | null>(null);
  // O Atlas conversa pela orbe (⌘J); aqui fica o resto da equipe.
  const lista = pessoas.filter((p) => !ehCoordenador(p.membro));
  const precisam = lista.filter((p) => p.sinal === "esperando").length;
  const atualDaConversa = conversa ? lista.find((p) => p.membro.id === conversa.membro.id) ?? conversa : null;

  if (!aberta) {
    return (
      <button type="button" onClick={() => setAberta(true)} title="Conversar com a equipe"
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-xl border border-r-0 bg-card px-1.5 py-3 shadow-lg transition-colors hover:bg-muted">
        <MessageCircle className="h-4 w-4 text-primary" />
        <span className="flex flex-col -space-y-2">
          {lista.slice(0, 5).map((p) => (
            <span key={p.membro.id} className="relative h-7 w-7 overflow-hidden rounded-full border-2 border-card bg-sky-100 dark:bg-slate-700">
              <CabecaBoneco nome={p.membro.nome} ehIa={p.membro.eh_ia} className="h-full w-full" />
            </span>
          ))}
        </span>
        <span className="text-[10px] font-semibold [writing-mode:vertical-rl]">Equipe</span>
        {precisam > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-slate-900">{precisam}</span>}
      </button>
    );
  }

  return (
    <div className="fixed bottom-3 right-3 top-24 z-40 flex w-[340px] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
      {/* Cabeçalho: lista ou a pessoa da conversa */}
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        {atualDaConversa ? (
          <>
            <button type="button" onClick={() => setConversa(null)} className="rounded-md p-1 hover:bg-muted" aria-label="Voltar para a equipe"><ArrowLeft className="h-4 w-4" /></button>
            <Avatar p={atualDaConversa} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{atualDaConversa.membro.nome}</p>
              <p className="truncate text-[11px] text-muted-foreground">{STATUS[atualDaConversa.sinal].texto}{atualDaConversa.atual ? ` · ${atualDaConversa.atual}` : ""}</p>
            </div>
            <button type="button" title="Ver a fila e o que está fazendo" onClick={() => onAbrirFila(atualDaConversa.membro)} className="rounded-md p-1 hover:bg-muted"><ListTodo className="h-4 w-4" /></button>
          </>
        ) : (
          <>
            <MessageCircle className="h-4 w-4 text-primary" />
            <p className="flex-1 text-sm font-semibold">Equipe</p>
          </>
        )}
        <button type="button" onClick={() => { setAberta(false); setConversa(null); }} className="rounded-md p-1 hover:bg-muted" aria-label="Fechar"><X className="h-4 w-4" /></button>
      </div>

      {atualDaConversa ? (
        <div className="min-h-0 flex-1">
          <BriefingTarefa key={atualDaConversa.membro.id} messenger clienteId={clienteId} membro={atualDaConversa.membro}
            onCriarTarefa={async (t) => { const id = await criarTarefaParaMembro(clienteId, atualDaConversa.membro.id, t); onMudou(); return id; }} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {lista.map((p) => (
            <button key={p.membro.id} type="button" onClick={() => setConversa(p)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted">
              <Avatar p={p} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.membro.nome}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{p.atual ?? STATUS[p.sinal].texto}</span>
              </span>
              <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px]", p.sinal === "esperando" ? "bg-amber-400/20 text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                {p.sinal === "esperando" ? "precisa de você" : p.membro.eh_ia ? "IA" : ""}
              </span>
            </button>
          ))}
          <p className="px-2 pt-2 text-[11px] text-muted-foreground">Converse com alguém: ele diz o que entendeu e, quando você confirma, vira tarefa. Com o Atlas, use a orbe (⌘J).</p>
        </div>
      )}
    </div>
  );
}

function Avatar({ p }: { p: PessoaChat }) {
  return (
    <span className="relative shrink-0">
      <span className="block h-9 w-9 overflow-hidden rounded-full bg-sky-100 dark:bg-slate-700">
        <CabecaBoneco nome={p.membro.nome} ehIa={p.membro.eh_ia} className="h-full w-full" />
      </span>
      <span className={cn("absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card", STATUS[p.sinal].cor)} />
    </span>
  );
}
