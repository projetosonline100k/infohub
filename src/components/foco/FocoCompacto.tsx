import { Pause, Play } from "lucide-react";
import { useAssistantAtividades } from "@/hooks/useAssistantAtividades";
import { mmss, useFocoTimer } from "@/hooks/useFocoTimer";
import { useWorkspaceTabsOpcional } from "@/components/workspace/WorkspaceTabs";

// Modo Foco dentro das Atividades (28/10, Davi: "o modo foco poderia integrar nessa área de atividades"):
// o mesmo cronômetro da página /foco (mesmo estado), pequeno, com a tarefa em foco. As tarefas da lista ganham
// o botão "Focar" (SemanaView).
export function FocoCompacto() {
  const { tarefas, atrasadas, iniciarTimer, pausarTimer } = useAssistantAtividades();
  const { estado, rodando, restante, total, tocar } = useFocoTimer({ iniciarTimer: (id) => iniciarTimer(id), pausarTimer: (id) => pausarTimer(id) });
  const guias = useWorkspaceTabsOpcional();
  const tarefa = [...tarefas, ...atrasadas].find((t) => t.id === estado.tarefaId);
  const raio = 22, volta = 2 * Math.PI * raio, progresso = total ? 1 - restante / total : 0;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-gradient-to-b from-[#1f3f73] to-[#16305a] p-3 text-white">
      <div className="relative h-14 w-14 shrink-0">
        <svg viewBox="0 0 52 52" className="h-full w-full -rotate-90">
          <circle cx="26" cy="26" r={raio} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
          <circle cx="26" cy="26" r={raio} fill="none" stroke={estado.fase === "foco" ? "#7cc4ff" : "#7fe3b4"} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={volta} strokeDashoffset={volta * (1 - progresso)} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums">{mmss(restante)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">{estado.fase === "foco" ? "Modo Foco" : "Pausa"}</p>
        <p className="truncate text-sm font-medium" title={tarefa?.titulo}>{tarefa?.titulo ?? "Escolha uma tarefa: botão Focar"}</p>
        <button type="button" onClick={() => guias?.openTab("/foco")} className="text-[11px] text-white/70 hover:text-white hover:underline">Abrir o Modo Foco</button>
      </div>
      <button type="button" onClick={tocar} title={rodando ? "Pausar" : "Começar"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#3d7fe0] hover:bg-[#4b8cf0]">
        {rodando ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
      </button>
    </div>
  );
}
