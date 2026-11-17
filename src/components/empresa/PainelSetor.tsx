import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ehDark } from "@/lib/empresa/visaoGeral";
import type { MembroResumo } from "@/lib/empresa/visaoGeral";
import { cn } from "@/lib/utils";
import { CabecaBoneco } from "./BonecoMesa";
import { BriefingTarefa } from "./BriefingTarefa";
import { criarTarefaParaMembro } from "./FilaPessoa";
import { DashDanilo } from "./DashDanilo";
import { DashDark } from "./DashDark";
import { DashKdu } from "./DashKdu";
import type { EdicaoResumo } from "./EditorVideo";

// Painel do setor (17/11/2026, Davi: "quando eu clicar no audiovisual, quero que abra todos os modelos juntos daquela área, Danilo, Roy, Dalila, Lauro… por guias,
// assim eu não preciso abrir agente por agente"): uma janela com uma guia por funcionário (IA) do setor. Quem tem dash (Danilo, Lauro, Kdu) mostra o dash;
// os outros (Roy, Dalila…) mostram a conversa deles.
const nomeBaixo = (m: MembroResumo) => m.nome.trim().toLowerCase();

export function PainelSetor({ clienteId, setorNome, membros, aberto, onFechar, onMudou, onAbrirEdicao }: {
  clienteId: string; setorNome: string; membros: MembroResumo[]; aberto: boolean; onFechar: () => void; onMudou: () => void; onAbrirEdicao: (e: EdicaoResumo) => void;
}) {
  const ias = membros.filter((m) => m.eh_ia);
  const [aba, setAba] = useState<string | null>(null);
  useEffect(() => { if (aberto && !ias.some((m) => m.id === aba)) setAba(ias[0]?.id ?? null); }, [aberto, aba, ias]);
  const atual = ias.find((m) => m.id === aba) ?? null;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="dark max-h-[94vh] w-[97vw] max-w-[1400px] gap-3 overflow-y-auto border-white/10 bg-[#050912] p-4 text-white sm:p-5 [&>button]:text-white/70">
        <DialogTitle className="text-lg font-bold">{setorNome}</DialogTitle>
        <DialogDescription className="sr-only">Todos os funcionários de IA do setor, uma guia para cada um</DialogDescription>
        <div className="flex flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-[#0c1320] p-1.5">
          {ias.map((m) => (
            <button key={m.id} type="button" onClick={() => setAba(m.id)}
              className={cn("flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm", aba === m.id ? "bg-violet-500 font-bold text-white" : "text-white/70 hover:bg-white/10 hover:text-white")}>
              <span className="h-6 w-6 overflow-hidden rounded-full bg-white/10"><CabecaBoneco nome={m.nome} ehIa className="h-full w-full" /></span>{m.nome}
            </button>))}
        </div>
        {atual && (ehDark(atual)
          ? <DashDark key={atual.id} embutido membro={atual} aberto={aberto} onFechar={onFechar} escritorioId={clienteId} onConversar={() => setAba(atual.id)} />
          : nomeBaixo(atual) === "danilo"
            ? <DashDanilo key={atual.id} embutido membro={atual} aberto={aberto} onFechar={onFechar} escritorioId={clienteId} onConversar={() => setAba(atual.id)} onAbrirEdicao={onAbrirEdicao} />
            : nomeBaixo(atual) === "kdu"
              ? <DashKdu key={atual.id} embutido membro={atual} aberto={aberto} onFechar={onFechar} escritorioId={clienteId} onConversar={() => setAba(atual.id)} />
              : (
                <div className="h-[70vh] overflow-hidden rounded-2xl border border-white/10 bg-card text-foreground">
                  <BriefingTarefa key={atual.id} messenger clienteId={clienteId} membro={atual}
                    onCriarTarefa={async (t) => { const id = await criarTarefaParaMembro(clienteId, atual.id, t); onMudou(); return id; }} />
                </div>))}
        {ias.length === 0 && <p className="py-10 text-center text-sm text-white/50">Este setor ainda não tem funcionário de IA.</p>}
      </DialogContent>
    </Dialog>
  );
}
