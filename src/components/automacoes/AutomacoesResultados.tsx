import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { funil, porAutomacao, serieDiaria } from "@/lib/automacoes/instagram";
import type { InstagramAutomacao, InstagramDisparo } from "@/hooks/useInstagramAutomacoes";

const PERIODOS = [7, 30, 90] as const;
// Ordem fixa das origens = ordem fixa das cores (--viz-1..3, validadas p/ daltonismo).
const ORIGENS = [
  { chave: "comentario", rotulo: "Comentário", cor: "var(--viz-1)" },
  { chave: "dm", rotulo: "Direct", cor: "var(--viz-2)" },
  { chave: "story", rotulo: "Story", cor: "var(--viz-3)" },
] as const;

const porcento = (v: number) => `${Math.round(v * 100)}%`;

type Props = { automacoes: InstagramAutomacao[]; disparos: InstagramDisparo[] };

export function AutomacoesResultados({ automacoes, disparos }: Props) {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [automacaoId, setAutomacaoId] = useState("todas");

  const nomes = useMemo(() => new Map(automacoes.map((a) => [a.id, a.nome])), [automacoes]);
  const filtrados = useMemo(() => {
    const desde = Date.now() - dias * 24 * 60 * 60 * 1000;
    return disparos.filter((d) =>
      Date.parse(d.criado_em) >= desde && (automacaoId === "todas" || d.automacao_id === automacaoId));
  }, [disparos, dias, automacaoId]);

  const etapas = useMemo(() => funil(filtrados), [filtrados]);
  const serie = useMemo(() => serieDiaria(filtrados, dias), [filtrados, dias]);
  const linhas = useMemo(() => porAutomacao(filtrados, nomes), [filtrados, nomes]);
  const origensUsadas = ORIGENS.filter((o) => serie.some((p) => p[o.chave] > 0));
  const topo = Math.max(etapas[0]?.valor ?? 0, 1);
  const semLink = filtrados.some((d) => d.dm_status === "enviada") && !filtrados.some((d) => d.links.length > 0);

  return (
    <div className="space-y-4">
      {/* Filtros: uma linha, acima de tudo */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border p-0.5 text-sm" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p} type="button" onClick={() => setDias(p)} aria-pressed={dias === p}
              className={cn("rounded px-3 py-1", dias === p ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}>
              {p} dias
            </button>
          ))}
        </div>
        <select value={automacaoId} onChange={(e) => setAutomacaoId(e.target.value)} aria-label="Automação"
          className="h-8 rounded-md border border-border bg-background px-2 text-sm">
          <option value="todas">Todas as automações</option>
          {automacoes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
      </div>

      {filtrados.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Nenhum disparo nesse período.</Card>
      ) : (
        <>
          {/* Números principais */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {etapas.map((e) => (
              <Card key={e.chave} className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{e.rotulo}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{e.valor}</p>
                <p className="text-xs text-muted-foreground">
                  {e.doAnterior === null ? `em ${dias} dias`
                    : e.chave === "clicaram" ? (semLink ? "nenhuma DM tinha link" : `${porcento(e.doAnterior)} das DMs com link`)
                    : e.chave === "enviadas" ? `${porcento(e.doAnterior)} dos gatilhos`
                    : `${porcento(e.doAnterior)} das DMs`}
                </p>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Funil */}
            <Card className="p-5 lg:col-span-2">
              <h3 className="text-sm font-semibold">Funil</h3>
              <p className="mb-4 text-xs text-muted-foreground">Da palavra-chave até a conversa.</p>
              <div className="space-y-3">
                {etapas.map((e, i) => (
                  <div key={e.chave} title={`${e.rotulo}: ${e.valor} (${porcento(e.doTopo)} dos gatilhos)`}>
                    <div className="mb-1 flex items-baseline justify-between text-sm">
                      <span>{e.rotulo}</span>
                      <span className="tabular-nums">
                        <span className="font-semibold">{e.valor}</span>
                        {i > 0 && <span className="ml-1.5 text-xs text-muted-foreground">{porcento(e.doTopo)}</span>}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.max((e.valor / topo) * 100, e.valor > 0 ? 2 : 0)}%`, opacity: 1 - i * 0.18 }} />
                    </div>
                  </div>
                ))}
              </div>
              {semLink && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Cliques só são medidos em DMs com link (https://…). Ponha um link na mensagem para medir.
                </p>
              )}
              <p className="mt-4 text-[11px] text-muted-foreground">Cliques e respostas são contados desde 14/10.</p>
            </Card>

            {/* DMs por dia */}
            <Card className="p-5 lg:col-span-3">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">DMs enviadas por dia</h3>
                  <p className="text-xs text-muted-foreground">Por gatilho que disparou.</p>
                </div>
                {origensUsadas.length > 1 && (
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {origensUsadas.map((o) => (
                      <span key={o.chave} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: o.cor }} />{o.rotulo}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serie} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap={dias > 30 ? 1 : "20%"}>
                    <CartesianGrid vertical={false} className="stroke-border" strokeOpacity={0.6} />
                    <XAxis dataKey="dia" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(d) => format(parseISO(d), "dd/MM")} minTickGap={16} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as (typeof serie)[number];
                        const total = p.comentario + p.dm + p.story;
                        return (
                          <div className="rounded-lg border border-border bg-background p-2.5 text-xs shadow-lg">
                            <p className="mb-1 font-medium">{format(parseISO(String(label)), "EEEE, dd 'de' MMM", { locale: ptBR })}</p>
                            {ORIGENS.map((o) => p[o.chave] > 0 && (
                              <p key={o.chave} className="flex items-center gap-1.5 text-muted-foreground">
                                <span className="h-2 w-2 rounded-sm" style={{ background: o.cor }} />
                                {o.rotulo}: <span className="font-medium text-foreground">{p[o.chave]}</span>
                              </p>
                            ))}
                            <p className="mt-1 text-foreground">Total: <span className="font-semibold">{total}</span></p>
                            {p.falhas > 0 && <p className="text-destructive">{p.falhas} falha{p.falhas > 1 ? "s" : ""}</p>}
                          </div>
                        );
                      }} />
                    {ORIGENS.map((o, i) => (
                      <Bar key={o.chave} dataKey={o.chave} stackId="dms" fill={o.cor} maxBarSize={28}
                        stroke="hsl(var(--card))" strokeWidth={dias > 30 ? 0 : 1}
                        radius={i === ORIGENS.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {/* Por automação (também é a visão em tabela dos números) */}
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-3 font-medium">Automação</th>
                  <th className="p-3 text-right font-medium">Gatilhos</th>
                  <th className="p-3 text-right font-medium">DMs</th>
                  <th className="p-3 text-right font-medium">Cliques</th>
                  <th className="p-3 text-right font-medium">Respostas</th>
                  <th className="p-3 text-right font-medium">Falhas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td className="p-3 font-medium">{l.nome}</td>
                    <td className="p-3 text-right tabular-nums">{l.gatilhos}</td>
                    <td className="p-3 text-right tabular-nums">{l.enviadas}</td>
                    <td className="p-3 text-right tabular-nums">{l.clicaram} <span className="text-xs text-muted-foreground">{porcento(l.taxaClique)}</span></td>
                    <td className="p-3 text-right tabular-nums">{l.responderam} <span className="text-xs text-muted-foreground">{porcento(l.taxaResposta)}</span></td>
                    <td className={cn("p-3 text-right tabular-nums", l.falhas > 0 && "text-destructive")}>{l.falhas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
