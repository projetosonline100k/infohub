import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clock, Hourglass, Loader2, Play, RefreshCw, ShieldQuestion, Timer } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { confirmar } from "@/components/DialogosGlobais";
import { capitalizar } from "@/components/assistant/format";
import { useAuth } from "@/auth/AuthProvider";
import { usePontePainel } from "@/hooks/usePontePainel";
import { ehAdmin } from "@/lib/admin";
import {
  STATUS_PONTE, concluidosPorDia, contagemPorStatus, duracaoMs, duracaoTexto, pedidosParados, tempoMedioMs,
  type PontePedido, type PonteStatus,
} from "@/lib/ponte/painel";
import { cn } from "@/lib/utils";

// Cor e ícone de cada coluna (tokens --status-* do app; dourado = em andamento).
const VISUAL: Record<PonteStatus, { icone: typeof Clock; texto: string; fundo: string; barra: string }> = {
  pendente: { icone: Clock, texto: "text-status-info", fundo: "bg-status-info/10", barra: "bg-status-info" },
  aguardando_aprovacao: { icone: ShieldQuestion, texto: "text-status-warning", fundo: "bg-status-warning/10", barra: "bg-status-warning" },
  em_andamento: { icone: Play, texto: "text-primary", fundo: "bg-primary/10", barra: "bg-primary" },
  concluido: { icone: CheckCircle2, texto: "text-status-success", fundo: "bg-status-success/10", barra: "bg-status-success" },
  erro: { icone: AlertTriangle, texto: "text-status-danger", fundo: "bg-status-danger/10", barra: "bg-status-danger" },
};

const PRIORIDADE: Record<PontePedido["prioridade"], { rotulo: string; borda: string; selo: string }> = {
  alta: { rotulo: "Alta", borda: "border-l-status-danger", selo: "bg-status-danger/15 text-status-danger" },
  normal: { rotulo: "Normal", borda: "border-l-primary", selo: "bg-primary/15 text-primary" },
  baixa: { rotulo: "Baixa", borda: "border-l-muted-foreground/40", selo: "bg-muted text-muted-foreground" },
};

const podeAprovar = (p: PontePedido) => !p.aprovado && (p.status === "pendente" || p.status === "aguardando_aprovacao");

// Painel da ponte de voz (Claude de voz → Claude Code, scripts/ponte.py). Só o Davi: os dados vêm das
// funções ponte_painel()/ponte_aprovar(), que conferem o login no servidor.
export default function Ponte() {
  const { user } = useAuth();
  const { pedidos, carregando, erro, atualizadoEm, recarregar, aprovar } = usePontePainel();
  const [agora, setAgora] = useState(() => Date.now());
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [aprovando, setAprovando] = useState<string | null>(null);

  // Relógio de 1s para os cronômetros e a bolinha de saúde.
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const porStatus = useMemo(() => contagemPorStatus(pedidos), [pedidos]);
  const serie = useMemo(() => concluidosPorDia(pedidos, agora, 7).map((d) => ({
    ...d, rotulo: capitalizar(format(parseISO(d.dia), "EEE", { locale: ptBR })),
  })), [pedidos, agora]);
  const medio = useMemo(() => tempoMedioMs(pedidos), [pedidos]);
  const parados = pedidosParados(pedidos, agora);
  const aberto = pedidos.find((p) => p.id === abertoId) ?? null;

  const confirmarAprovacao = async (p: PontePedido) => {
    if (!(await confirmar(`Aprovar “${p.titulo}”? O Claude Code começa a fazer em até 1 minuto.`, { botao: "Aprovar" }))) return;
    setAprovando(p.id);
    try {
      const mudou = await aprovar(p.id);
      if (mudou) toast.success("Aprovado: entra na fila"); else toast.info("Esse pedido já tinha saído da fila");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para aprovar");
    } finally {
      setAprovando(null);
    }
  };

  if (!ehAdmin(user?.email)) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Só o administrador vê a ponte.</p>;
  }
  if (carregando) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const total = Math.max(pedidos.length, 1);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ponte</h1>
          <p className="text-sm text-muted-foreground">Pedidos do Claude de voz para o Claude Code, ao vivo.</p>
        </div>
        <div className="flex items-center gap-3">
          <Saude parados={parados.length} erro={!!erro} atualizadoEm={atualizadoEm} agora={agora} />
          <Button variant="outline" size="icon" onClick={() => void recarregar()} aria-label="Atualizar" title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {erro && (
        <Card className="border-status-danger/40 bg-status-danger/5 p-4 text-sm text-status-danger">Não deu para ler a fila: {erro}</Card>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="p-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pedidos por status</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{pedidos.length}</p>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted">
            {STATUS_PONTE.map((s) => porStatus[s.chave] > 0 && (
              <div key={s.chave} className={cn("h-full transition-all duration-700", VISUAL[s.chave].barra)}
                style={{ width: `${(porStatus[s.chave] / total) * 100}%` }} title={`${s.rotulo}: ${porStatus[s.chave]}`} />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {STATUS_PONTE.map((s) => (
              <li key={s.chave} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-muted-foreground"><span className={cn("h-2 w-2 rounded-full", VISUAL[s.chave].barra)} />{s.rotulo}</span>
                <span className="font-semibold tabular-nums">{porStatus[s.chave]}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5 animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:80ms]">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Concluídos nos últimos 7 dias</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{serie.reduce((a, d) => a + d.total, 0)}</p>
          <div className="mt-2 h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="text-muted-foreground" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} className="text-muted-foreground" />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  content={({ active, payload, label }) => active && payload?.length ? (
                    <div className="rounded-lg border border-border bg-background p-2 text-xs shadow-lg">
                      <p className="font-medium">{label}</p>
                      <p className="text-muted-foreground">{payload[0].value} concluído(s)</p>
                    </div>
                  ) : null}
                />
                <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} animationDuration={600} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="relative overflow-hidden p-5 animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:160ms]">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tempo médio por pedido</p>
          <p className="mt-1 flex items-center gap-2 text-3xl font-bold tabular-nums">
            <Timer className="h-6 w-6 text-primary" />{medio == null ? "—" : duracaoTexto(medio)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Do início até concluir, {porStatus.concluido} pedido(s) concluído(s).</p>
          {porStatus.em_andamento > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> {porStatus.em_andamento} rodando agora
            </p>
          )}
        </Card>
      </div>

      <div className="flex snap-x gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-5 lg:overflow-visible">
        {STATUS_PONTE.map((s) => {
          const lista = pedidos.filter((p) => p.status === s.chave);
          const V = VISUAL[s.chave];
          return (
            <section key={s.chave} className="w-[78vw] max-w-xs shrink-0 snap-start rounded-xl bg-muted/40 p-2 sm:w-64 lg:w-auto lg:max-w-none">
              <header className="mb-2 flex items-center justify-between px-1.5 py-1">
                <span className={cn("flex items-center gap-1.5 text-sm font-semibold", V.texto)}><V.icone className="h-4 w-4" />{s.rotulo}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums", V.fundo, V.texto)}>{lista.length}</span>
              </header>
              <div className="space-y-2">
                {lista.length === 0 && <p className="px-1.5 py-6 text-center text-xs text-muted-foreground">Nada aqui</p>}
                {lista.map((p) => (
                  <CartaoPedido key={p.id} p={p} agora={agora} parado={parados.includes(p)} aprovando={aprovando === p.id}
                    abrir={() => setAbertoId(p.id)} aprovar={() => void confirmarAprovacao(p)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <Sheet open={!!aberto} onOpenChange={(v) => !v && setAbertoId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {aberto && <Detalhe p={aberto} agora={agora} aprovando={aprovando === aberto.id} aprovar={() => void confirmarAprovacao(aberto)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Saude({ parados, erro, atualizadoEm, agora }: { parados: number; erro: boolean; atualizadoEm: number | null; agora: number }) {
  const ruim = parados > 0 || erro;
  const texto = erro ? "Sem conexão com a fila" : parados > 0 ? `Serviço do Mac parado? ${parados} pedido(s) esperando há +5 min` : "Ponte funcionando";
  const desde = atualizadoEm ? Math.round((agora - atualizadoEm) / 1000) : null;
  return (
    <div className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      ruim ? "border-status-danger/40 bg-status-danger/10 text-status-danger" : "border-status-success/40 bg-status-success/10 text-status-success")}
      title={desde != null ? `Atualizado há ${desde}s` : undefined}>
      <span className="relative flex h-2.5 w-2.5">
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", ruim ? "bg-status-danger" : "bg-status-success")} />
        <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", ruim ? "bg-status-danger" : "bg-status-success")} />
      </span>
      {texto}
    </div>
  );
}

function Tempo({ p, agora }: { p: PontePedido; agora: number }) {
  const ms = duracaoMs(p, agora);
  if (p.status === "em_andamento" && ms != null) {
    return <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums text-primary"><Hourglass className="h-3.5 w-3.5 animate-pulse" />{duracaoTexto(ms)}</span>;
  }
  if ((p.status === "concluido" || p.status === "erro") && ms != null) {
    return <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground"><Timer className="h-3.5 w-3.5" />{duracaoTexto(ms)}</span>;
  }
  return <span className="text-xs text-muted-foreground">{formatDistanceToNow(parseISO(p.criado_em), { locale: ptBR, addSuffix: true })}</span>;
}

function CartaoPedido({ p, agora, parado, aprovando, abrir, aprovar }: {
  p: PontePedido; agora: number; parado: boolean; aprovando: boolean; abrir: () => void; aprovar: () => void;
}) {
  const V = VISUAL[p.status];
  const pr = PRIORIDADE[p.prioridade];
  return (
    <div role="button" tabIndex={0} onClick={abrir} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); } }}
      className={cn("group cursor-pointer rounded-lg border border-l-4 bg-card p-3 shadow-sm transition-all duration-300 animate-in fade-in zoom-in-95",
        "hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pr.borda, p.status === "em_andamento" && "ring-1 ring-primary/40", parado && "ring-1 ring-status-danger/60")}>
      <div className="flex items-start gap-2">
        <V.icone className={cn("mt-0.5 h-4 w-4 shrink-0", V.texto, p.status === "em_andamento" && "animate-pulse")} />
        <p className="line-clamp-3 text-sm font-medium leading-snug">{p.titulo}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", pr.selo)}>{pr.rotulo}</span>
        <Tempo p={p} agora={agora} />
      </div>
      {p.aprovado && (p.status === "pendente" || p.status === "aguardando_aprovacao") && (
        <p className={cn("mt-2 text-[11px] font-medium", parado ? "text-status-danger" : "text-status-success")}>
          {parado ? "Aprovado, mas parado há +5 min" : "Aprovado, entra em até 1 min"}
        </p>
      )}
      {podeAprovar(p) && (
        <Button size="sm" className="mt-2 h-7 w-full" disabled={aprovando} onClick={(e) => { e.stopPropagation(); aprovar(); }}>
          {aprovando ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />} Aprovar
        </Button>
      )}
    </div>
  );
}

function Detalhe({ p, agora, aprovando, aprovar }: { p: PontePedido; agora: number; aprovando: boolean; aprovar: () => void }) {
  const V = VISUAL[p.status];
  const pr = PRIORIDADE[p.prioridade];
  const quando = (iso: string | null) => iso ? format(parseISO(iso), "dd/MM HH:mm:ss", { locale: ptBR }) : "—";
  return (
    <div className="space-y-5">
      <SheetHeader className="space-y-2 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", V.fundo, V.texto)}>
            <V.icone className="h-3.5 w-3.5" />{STATUS_PONTE.find((s) => s.chave === p.status)?.rotulo}
          </span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", pr.selo)}>Prioridade {pr.rotulo.toLowerCase()}</span>
          <Tempo p={p} agora={agora} />
        </div>
        <SheetTitle className="text-xl leading-snug">{p.titulo}</SheetTitle>
        <SheetDescription className="font-mono text-xs">{p.id}</SheetDescription>
      </SheetHeader>

      {podeAprovar(p) && (
        <Button className="w-full" disabled={aprovando} onClick={aprovar}>
          {aprovando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />} Aprovar pedido
        </Button>
      )}

      <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-xs">
        <div><dt className="text-muted-foreground">Criado</dt><dd className="font-medium tabular-nums">{quando(p.criado_em)}</dd></div>
        <div><dt className="text-muted-foreground">Começou</dt><dd className="font-medium tabular-nums">{quando(p.iniciado_em)}</dd></div>
        <div><dt className="text-muted-foreground">Terminou</dt><dd className="font-medium tabular-nums">{quando(p.concluido_em)}</dd></div>
      </dl>

      <Bloco titulo="Descrição" texto={p.descricao} />
      {p.erro && <Bloco titulo="Erro" texto={p.erro} className="border-status-danger/40 bg-status-danger/5" />}
      {p.resultado && <Bloco titulo="Resultado" texto={p.resultado} className="border-status-success/40 bg-status-success/5" />}
    </div>
  );
}

function Bloco({ titulo, texto, className }: { titulo: string; texto: string; className?: string }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <div className={cn("whitespace-pre-wrap break-words rounded-lg border p-3 text-sm leading-relaxed", className)}>{texto}</div>
    </section>
  );
}
