import { useMemo, useState } from "react";
import { AlertTriangle, Calendar, CalendarClock, Clock, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  categoriaTarefa,
  type AssistantCategoria,
  type AssistantTarefa,
  type ColunaAtividade,
  type NovaAtividadeInput,
} from "@/hooks/useAssistantAtividades";
import type { AssistantProjetoOpcao } from "@/hooks/useAssistantProjeto";
import { StartDayCreateActivityForm } from "./StartDayCreateActivityForm";

const TODOS_PROJETOS = "__todos__";
const LIMITE = 3;

const TITULO_SECAO: Record<AssistantCategoria, string> = {
  atrasada: "Atrasadas",
  hoje: "Hoje",
  proxima: "Próximas",
};

const ICONE_SECAO: Record<AssistantCategoria, typeof AlertTriangle> = {
  atrasada: AlertTriangle,
  hoje: Calendar,
  proxima: CalendarClock,
};

interface StartDayActivityPickerProps {
  tarefas: AssistantTarefa[];
  projetos: AssistantProjetoOpcao[];
  projetoIdAtual: string | null;
  selecionadas: string[];
  onAlternar: (id: string) => void;
  colunasDoProjeto: (clienteId: string | null) => Promise<ColunaAtividade[]>;
  onCriarAtividade: (input: NovaAtividadeInput) => Promise<AssistantTarefa>;
  onAtividadeCriada: (id: string) => void;
  // Atividades já selecionadas (ex.: vindas de "Ajustar plano" ou da
  // sugestão de ontem) que por algum motivo não estão em `tarefas` — só pra
  // não sumirem da lista visível de selecionadas.
  atividadesForaDaLista?: { id: string; titulo: string }[];
}

// 80/20: escolher até 3 atividades REAIS que importam hoje — busca, filtro
// de projeto, agrupamento atrasada/hoje/próxima (mesmo critério de
// categoriaTarefa já usado em AssistantHojeTab.tsx), e criação inline de
// uma atividade nova quando nenhuma existente serve.
export function StartDayActivityPicker({
  tarefas,
  projetos,
  projetoIdAtual,
  selecionadas,
  onAlternar,
  colunasDoProjeto,
  onCriarAtividade,
  onAtividadeCriada,
  atividadesForaDaLista,
}: StartDayActivityPickerProps) {
  const [busca, setBusca] = useState("");
  const [filtroProjetoId, setFiltroProjetoId] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const nomeDoProjeto = (clienteId: string | null) => (clienteId ? projetos.find((p) => p.id === clienteId)?.nome ?? "Sem projeto" : "Sem projeto");

  const secoes = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    const filtradas = tarefas.filter(
      (t) => (!buscaLower || t.titulo.toLowerCase().includes(buscaLower)) && (!filtroProjetoId || t.cliente_id === filtroProjetoId)
    );
    const grupos: Record<AssistantCategoria, AssistantTarefa[]> = { atrasada: [], hoje: [], proxima: [] };
    filtradas.forEach((t) => grupos[categoriaTarefa(t)].push(t));
    return (["atrasada", "hoje", "proxima"] as AssistantCategoria[])
      .map((categoria) => ({ categoria, itens: grupos[categoria] }))
      .filter((s) => s.itens.length > 0);
  }, [tarefas, busca, filtroProjetoId]);

  const foraDaLista = (atividadesForaDaLista ?? []).filter((a) => selecionadas.includes(a.id) && !tarefas.some((t) => t.id === a.id));

  if (criando) {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-medium leading-snug">Nova atividade</h3>
        <StartDayCreateActivityForm
          projetos={projetos}
          projetoIdPadrao={projetoIdAtual}
          colunasDoProjeto={colunasDoProjeto}
          onCriar={onCriarAtividade}
          onCriada={(atividade) => {
            onAtividadeCriada(atividade.id);
            setCriando(false);
          }}
          onCancelar={() => setCriando(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-lg font-medium leading-snug">Escolha até 3 atividades que realmente importam hoje</h3>
        <p className="text-xs text-muted-foreground">{selecionadas.length} de {LIMITE} selecionadas</p>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar..." className="h-9 pl-8 text-sm" />
        </div>
        {projetos.length > 0 && (
          <Select value={filtroProjetoId ?? TODOS_PROJETOS} onValueChange={(v) => setFiltroProjetoId(v === TODOS_PROJETOS ? null : v)}>
            <SelectTrigger className="h-9 w-32 shrink-0 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS_PROJETOS}>Todos</SelectItem>
              {projetos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {foraDaLista.length > 0 && (
        <div className="space-y-1">
          {foraDaLista.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAlternar(a.id)}
              className="flex w-full items-center gap-2 rounded-lg border border-primary bg-primary/10 px-2.5 py-2 text-left text-sm text-primary"
            >
              <span aria-hidden="true">✓</span>
              <span className="min-w-0 flex-1 truncate">{a.titulo}</span>
            </button>
          ))}
        </div>
      )}

      <div className="max-h-[260px] space-y-3 overflow-y-auto">
        {secoes.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nenhuma atividade encontrada.</p>
        ) : (
          secoes.map(({ categoria, itens }) => {
            const Icone = ICONE_SECAO[categoria];
            return (
              <div key={categoria} className="space-y-1">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Icone className="h-3.5 w-3.5" />
                  {TITULO_SECAO[categoria]}
                </p>
                <div className="space-y-1">
                  {itens.map((t) => {
                    const marcada = selecionadas.includes(t.id);
                    const desabilitada = !marcada && selecionadas.length >= LIMITE;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={desabilitada}
                        onClick={() => onAlternar(t.id)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors",
                          marcada
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
                        )}
                      >
                        <span aria-hidden="true">{marcada ? "✓" : "○"}</span>
                        <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                        <span className="shrink-0 truncate text-xs text-muted-foreground">{nomeDoProjeto(t.cliente_id)}</span>
                        {t.tempo_estimado && (
                          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {t.tempo_estimado}min
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      <Button type="button" variant="outline" className="w-full gap-1.5" onClick={() => setCriando(true)}>
        <Plus className="h-3.5 w-3.5" />
        Nova atividade
      </Button>
    </div>
  );
}
