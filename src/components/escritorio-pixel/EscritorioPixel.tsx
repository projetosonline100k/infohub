import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircle, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Funcionario3D, Resultado3D } from "@/components/escritorio3d/EscritorioVirtual";
import { criarMundo, type EstadoPixel, type MundoPixel, type PessoaPixel } from "./motor";

// Protótipo do escritório em pixel art (PixiJS desenha o mapa; o React cuida do painel à direita).
// Só roda no `npm run dev`: os sprites gratuitos da LimeZu têm licença não comercial e ficam fora do git.

const ROTULO: Record<EstadoPixel, string> = {
  trabalhando: "Trabalhando", esperando: "Esperando você", problema: "Com problema", parado: "Sem tarefa", reuniao: "Em reunião",
};
const COR: Record<EstadoPixel, string> = {
  trabalhando: "bg-emerald-500", esperando: "bg-amber-500", problema: "bg-rose-500", parado: "bg-slate-400", reuniao: "bg-violet-400",
};

export default function EscritorioPixel({ funcionarios, resultado, onSair, onConversar, onAbrirTarefa }: {
  funcionarios: Funcionario3D[];
  resultado: Resultado3D | null;
  onSair: () => void;
  onConversar: (id: string) => void;
  onAbrirTarefa: (f: Funcionario3D) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const mundo = useRef<MundoPixel | null>(null);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  // Simulação local de estado (para ver o comportamento sem mexer nas tarefas de verdade).
  const [simulado, setSimulado] = useState<Record<string, EstadoPixel>>({});

  const pessoas = useMemo<PessoaPixel[]>(() => funcionarios.map((f) => ({
    id: f.id, nome: f.nome, estado: simulado[f.id] ?? f.sinal, agora: f.agora ?? null,
    sala: f.sala === "audiovisual" ? "audiovisual" : null,
  })), [funcionarios, simulado]);

  useEffect(() => {
    let cancelado = false;
    let criado: MundoPixel | null = null;
    criarMundo(caixa.current!, setSelecionado).then((m) => {
      if (cancelado) { m.destruir(); return; }
      criado = m;
      mundo.current = m;
      setPronto(true);
    }).catch((e) => {
      console.error(e);
      if (!cancelado) setErro("Não consegui carregar os sprites. Eles ficam em public/escritorio-pixel (só no computador do Davi, fora do git).");
    });
    return () => { cancelado = true; criado?.destruir(); mundo.current = null; };
  }, []);

  useEffect(() => { if (pronto) mundo.current?.atualizar(pessoas, resultado); }, [pronto, pessoas, resultado]);
  useEffect(() => { mundo.current?.selecionar(selecionado); }, [pronto, selecionado]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { if (selecionado) setSelecionado(null); else onSair(); } };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [selecionado, onSair]);

  const f = funcionarios.find((x) => x.id === selecionado) ?? null;
  const p = pessoas.find((x) => x.id === selecionado) ?? null;
  const ordem: EstadoPixel[] = ["problema", "esperando", "trabalhando", "reuniao", "parado"];

  return (
    <div className="fixed inset-0 z-[60] flex bg-[#17151f] text-white">
      <div className="relative min-w-0 flex-1">
        <div ref={caixa} className="absolute inset-0" />
        {!pronto && !erro && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Montando o escritório…</div>
        )}
        {erro && <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-rose-300">{erro}</div>}
        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/50 px-2.5 py-1 text-[11px] text-white/70">
          Protótipo em pixel art · Entrada, Área Colaborativa e Audiovisual · sprites gratuitos (LimeZu, uso não comercial)
        </div>
      </div>

      <aside className="flex w-80 shrink-0 flex-col border-l border-white/10 bg-[#1f1c29]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">Escritório</h2>
          <button type="button" onClick={onSair} className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white" title="Sair (Esc)"><X className="h-4 w-4" /></button>
        </div>

        {f && p ? (
          <div className="space-y-4 overflow-y-auto p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-bold">{f.nome}</p>
                {f.ehIa && <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">IA</span>}
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-white/70"><span className={cn("h-2 w-2 rounded-full", COR[p.estado])} />{ROTULO[p.estado]}</p>
            </div>
            {f.agora && <p className="rounded-lg bg-white/5 p-2.5 text-sm text-white/80">{f.agora}</p>}
            <div className="rounded-lg border border-white/10 p-3">
              <p className="text-[11px] uppercase tracking-wide text-white/50">Tarefa atual</p>
              {f.tarefa ? (
                <>
                  <p className="mt-1 text-sm font-medium">{f.tarefa.titulo}</p>
                  {f.tarefa.progresso != null && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(f.tarefa.progresso)}%` }} /></div>
                  )}
                  <p className="mt-1.5 text-xs text-white/60">
                    {f.tarefa.progresso != null ? `${Math.round(f.tarefa.progresso)}%` : "Sem progresso medido"}
                    {f.tarefa.minutosRestantes != null && ` · faltam ~${f.tarefa.minutosRestantes} min`}
                  </p>
                </>
              ) : <p className="mt-1 text-sm text-white/60">Nenhuma tarefa agora.</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={!f.tarefa} onClick={() => onAbrirTarefa(f)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-40"><Play className="h-3.5 w-3.5" />Abrir tarefa</button>
              <button type="button" disabled={f.clicavel === false} onClick={() => onConversar(f.id)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-40"><MessageCircle className="h-3.5 w-3.5" />Conversar</button>
            </div>
            <div className="border-t border-white/10 pt-3">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-white/50">Simular estado (só no protótipo)</p>
              <div className="flex flex-wrap gap-1.5">
                {ordem.map((e) => (
                  <button key={e} type="button" onClick={() => setSimulado((s) => ({ ...s, [f.id]: e }))}
                    className={cn("rounded-full border px-2 py-0.5 text-[11px]", p.estado === e ? "border-white/60 bg-white/15" : "border-white/15 text-white/70 hover:bg-white/10")}>{ROTULO[e]}</button>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => setSelecionado(null)} className="text-xs text-white/50 hover:text-white">← Ver toda a equipe</button>
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto p-4">
            {ordem.map((estado) => {
              const grupo = pessoas.filter((x) => x.estado === estado);
              if (!grupo.length) return null;
              return (
                <div key={estado}>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/50"><span className={cn("h-2 w-2 rounded-full", COR[estado])} />{ROTULO[estado]} · {grupo.length}</p>
                  <div className="space-y-1">
                    {grupo.map((x) => (
                      <button key={x.id} type="button" onClick={() => setSelecionado(x.id)}
                        className="block w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/10">
                        <span className="font-medium">{x.nome}</span>
                        {x.agora && <span className="text-white/50"> · {x.agora}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!pessoas.length && <p className="text-sm text-white/60">Ninguém na equipe ainda.</p>}
            <p className="text-[11px] leading-relaxed text-white/40">Clique num funcionário no mapa para ver a tarefa. Quem trabalha fica na mesa; quem espera você vai para a área comum com “!”; sem tarefa vai para o sofá ou a copa.</p>
          </div>
        )}
      </aside>
    </div>
  );
}
