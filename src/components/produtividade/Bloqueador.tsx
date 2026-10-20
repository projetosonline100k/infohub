import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lock, LockOpen, Plus, ShieldBan, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBloqueador } from "@/hooks/useBloqueador";
import { MOTIVO_MINIMO, limparSite, precisaMotivo, textoAte } from "@/lib/bloqueador/regras";
import { isDesktop } from "@/lib/platform";

// Bloqueador (20/10, pedido do Davi): apps e sites; liga na mão ou com o cronômetro de uma
// atividade; desligar antes da hora pede o motivo (fica no histórico).
const SUGESTOES_APPS = ["WhatsApp", "Instagram", "Mensagens", "Telegram", "Discord", "Spotify", "Netflix", "TV"];
const SUGESTOES_SITES = ["instagram.com", "youtube.com", "tiktok.com", "x.com", "facebook.com", "netflix.com", "web.whatsapp.com"];
const DURACOES = [25, 50, 90, 120];

function Lista({ titulo, itens, sugestoes, onMudar, placeholder, limpar }: {
  titulo: string; itens: string[]; sugestoes: string[]; onMudar: (l: string[]) => void; placeholder: string; limpar: (s: string) => string;
}) {
  const [novo, setNovo] = useState("");
  const add = (v: string) => {
    const x = limpar(v);
    if (x && !itens.some((i) => i.toLowerCase() === x.toLowerCase())) onMudar([...itens, x]);
    setNovo("");
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{titulo}</p>
      <div className="flex flex-wrap gap-1.5">
        {itens.map((i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-300">
            {i}
            <button type="button" aria-label={`Tirar ${i}`} onClick={() => onMudar(itens.filter((x) => x !== i))}><X className="h-3 w-3" /></button>
          </span>
        ))}
        {!itens.length && <span className="text-xs text-muted-foreground">Nada na lista ainda.</span>}
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); add(novo); }}>
        <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder={placeholder} className="h-8 text-sm" />
        <Button type="submit" size="sm" variant="outline" disabled={!novo.trim()}><Plus className="h-3.5 w-3.5" /></Button>
      </form>
      <div className="flex flex-wrap gap-1">
        {sugestoes.filter((s) => !itens.some((i) => i.toLowerCase() === s.toLowerCase())).map((s) => (
          <button key={s} type="button" onClick={() => add(s)}
            className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-foreground">+ {s}</button>
        ))}
      </div>
    </div>
  );
}

export function Bloqueador() {
  const { carregado, config, sessoes, ativa, agora, salvarConfig, ligar, desligar } = useBloqueador();
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const vazio = !config.apps.length && !config.sites.length;

  const tentarDesligar = async () => {
    if (ativa && precisaMotivo(ativa, new Date())) { setMotivo(""); setPedindoMotivo(true); return; }
    await desligar();
  };
  const confirmar = async () => {
    const r = await desligar(motivo);
    if (!r.ok) { toast.error(r.erro); return; }
    setPedindoMotivo(false);
    toast.success("Bloqueador desligado. O motivo ficou no histórico.");
  };

  if (!carregado) return <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 ${ativa ? "border-rose-500/40 bg-rose-500/5" : "bg-card"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-full ${ativa ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground"}`}>
            {ativa ? <Lock className="h-5 w-5" /> : <LockOpen className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{ativa ? `Bloqueando ${textoAte(ativa)}` : "Bloqueador desligado"}</p>
            <p className="text-xs text-muted-foreground">
              {ativa
                ? `${ativa.origem === "foco" ? "Ligou sozinho com o cronômetro da atividade" : "Ligado por você"} · barrou ${ativa.bloqueios} vez${ativa.bloqueios === 1 ? "" : "es"}`
                : vazio ? "Monte a lista de apps e sites abaixo para começar." : "Escolha por quanto tempo ligar."}
            </p>
            {!isDesktop() && <p className="mt-1 text-xs text-amber-600">O bloqueio acontece no app do Mac (aqui na web você só configura).</p>}
          </div>
          {ativa ? (
            <Button variant="outline" onClick={() => void tentarDesligar()}>Desligar</Button>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {DURACOES.map((m) => (
                <Button key={m} size="sm" disabled={vazio} onClick={() => void ligar(m)} className="gap-1">
                  <ShieldBan className="h-3.5 w-3.5" /> {m >= 60 ? `${m / 60}h${m % 60 ? m % 60 : ""}` : `${m} min`}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2">
        <Lista titulo="Apps bloqueados" itens={config.apps} sugestoes={SUGESTOES_APPS} placeholder="Nome do app (ex.: WhatsApp)"
          limpar={(s) => s.trim()} onMudar={(apps) => void salvarConfig({ ...config, apps })} />
        <Lista titulo="Sites bloqueados (Chrome e Safari)" itens={config.sites} sugestoes={SUGESTOES_SITES} placeholder="ex.: instagram.com"
          limpar={limparSite} onMudar={(sites) => void salvarConfig({ ...config, sites })} />
        <label className="flex items-center gap-3 md:col-span-2">
          <Switch checked={config.no_foco} onCheckedChange={(no_foco) => void salvarConfig({ ...config, no_foco })} />
          <span className="text-sm">
            <span className="font-medium">Ligar sozinho no foco</span>
            <span className="block text-xs text-muted-foreground">Quando o cronômetro de uma atividade estiver rodando, bloqueia até você parar.</span>
          </span>
        </label>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="mb-2 text-sm font-semibold">Histórico</p>
        {sessoes.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum bloqueio ainda.</p> : (
          <ul className="divide-y text-sm">
            {sessoes.slice(0, 15).map((s) => {
              const antes = s.encerrado_em && s.fim_previsto && new Date(s.encerrado_em) < new Date(s.fim_previsto);
              return (
                <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                  <span className="font-medium">{format(new Date(s.inicio), "dd/MM HH:mm", { locale: ptBR })}</span>
                  <span className="text-xs text-muted-foreground">{s.origem === "foco" ? "foco" : "manual"} · barrou {s.bloqueios}</span>
                  <span className="text-xs">{!s.encerrado_em && (!s.fim_previsto || new Date(s.fim_previsto) > agora) ? "ligado agora"
                    : antes ? <span className="text-rose-600">desligou antes: “{s.motivo_saida}”</span>
                    : `até ${format(new Date(s.encerrado_em ?? s.fim_previsto!), "HH:mm")}`}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={pedindoMotivo} onOpenChange={setPedindoMotivo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desligar antes da hora?</DialogTitle>
            <DialogDescription>Ainda falta tempo ({ativa ? textoAte(ativa) : ""}). Escreva o motivo: ele fica no seu histórico.</DialogDescription>
          </DialogHeader>
          <Textarea autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: reunião com cliente que precisa do WhatsApp" rows={3} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPedindoMotivo(false)}>Continuar bloqueado</Button>
            <Button variant="destructive" disabled={motivo.trim().length < MOTIVO_MINIMO} onClick={() => void confirmar()}>Desligar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
