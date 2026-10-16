import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, Clapperboard, GalleryHorizontal, MessageCircle, Play, Rocket, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { buscarAvisos, type Aviso, type TipoAviso } from "@/lib/empresa/notificacoes";

// Sininho do topo: os avisos da equipe (respostas no chat, quem começou,
// entregou ou concluiu, versões do Danilo, carrosséis do Roy, melhorias do
// Pedro). A cada 20 s busca o que é novo; cada novidade também sobe um aviso
// no canto da tela. Guarda os últimos 60 neste computador.
const CHAVE_LISTA = "avisos-equipe";
const CHAVE_DESDE = "avisos-equipe-desde";
const MAX = 60;
const ICONE: Record<TipoAviso, typeof Bell> = {
  resposta: MessageCircle, comecou: Play, entregou: Send, concluiu: CheckCircle2,
  edicao: Clapperboard, carrossel: GalleryHorizontal, melhoria: Rocket, erro: AlertTriangle,
};

const ler = <T,>(chave: string, padrao: T): T => { try { const v = localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : padrao; } catch { return padrao; } };
const gravar = (chave: string, v: unknown) => { try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* sem storage */ } };

export function AvisosEquipe() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [avisos, setAvisos] = useState<Aviso[]>(() => ler<Aviso[]>(CHAVE_LISTA, []));
  const [aberto, setAberto] = useState(false);
  const desde = useRef<string>(ler<string>(CHAVE_DESDE, new Date().toISOString()));

  const ir = useCallback((a: Aviso) => {
    setAvisos((xs) => { const n = xs.map((x) => (x.id === a.id ? { ...x, lido: true } : x)); gravar(CHAVE_LISTA, n); return n; });
    setAberto(false);
    if (a.clienteId) navigate(`/clientes/${a.clienteId}`);
  }, [navigate]);

  const buscar = useCallback(async () => {
    if (!user?.id) return;
    try {
      const novos = await buscarAvisos(desde.current, user.id);
      if (!novos.length) return;
      desde.current = novos[novos.length - 1].quando;
      gravar(CHAVE_DESDE, desde.current);
      setAvisos((xs) => {
        const conhecidos = new Set(xs.map((x) => x.id));
        const ineditos = novos.filter((n) => !conhecidos.has(n.id));
        // No canto da tela: até 3 de uma vez; o resto vira um resumo.
        ineditos.slice(-3).forEach((a) => toast(a.titulo, {
          description: [a.detalhe, a.projeto].filter(Boolean).join(" · "), duration: 8000,
          action: a.clienteId ? { label: "Ver", onClick: () => ir(a) } : undefined,
        }));
        if (ineditos.length > 3) toast(`+${ineditos.length - 3} novidades da equipe`, { description: "Abra o sininho no topo" });
        const lista = [...ineditos.reverse(), ...xs].slice(0, MAX);
        gravar(CHAVE_LISTA, lista);
        return lista;
      });
    } catch { /* sem rede: tenta no próximo ciclo */ }
  }, [user?.id, ir]);

  useEffect(() => {
    void buscar();
    const t = window.setInterval(() => void buscar(), 20_000);
    return () => window.clearInterval(t);
  }, [buscar]);

  const naoLidos = avisos.filter((a) => !a.lido).length;
  const marcarTodos = () => setAvisos((xs) => { const n = xs.map((x) => ({ ...x, lido: true })); gravar(CHAVE_LISTA, n); return n; });

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Avisos da equipe${naoLidos ? ` (${naoLidos} novos)` : ""}`} title="Avisos da equipe">
          <Bell className="h-4 w-4" />
          {naoLidos > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {naoLidos > 9 ? "9+" : naoLidos}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Avisos da equipe</p>
          {naoLidos > 0 && (
            <button type="button" onClick={marcarTodos} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <CheckCheck className="h-3.5 w-3.5" />Marcar como lidos
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {avisos.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nada novo. Quando alguém da equipe responder, começar ou entregar algo, aparece aqui.</p>
          ) : avisos.map((a) => {
            const Icone = ICONE[a.tipo];
            return (
              <button key={a.id} type="button" onClick={() => ir(a)}
                className={cn("flex w-full gap-2.5 border-b px-3 py-2 text-left last:border-0 hover:bg-muted", !a.lido && "bg-primary/5")}>
                <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  a.tipo === "erro" ? "bg-rose-500/15 text-rose-600" : a.tipo === "entregou" ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary")}>
                  <Icone className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm leading-snug", !a.lido && "font-semibold")}>{a.titulo}</span>
                  {a.detalhe && <span className="line-clamp-2 block text-xs text-muted-foreground">{a.detalhe}</span>}
                  <span className="block text-[10px] text-muted-foreground">
                    {a.projeto ? `${a.projeto} · ` : ""}{formatDistanceToNow(new Date(a.quando), { addSuffix: true, locale: ptBR })}
                  </span>
                </span>
                {!a.lido && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
