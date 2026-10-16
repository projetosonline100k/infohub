import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Link2, Undo2, Zap } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { confirmar } from "@/components/DialogosGlobais";
import { format, parseISO } from "date-fns";

// Faturamento entrando sozinho: o link de webhook do produto (Kiwify/Hotmart) e
// as últimas vendas e reembolsos que chegaram por ele. Cada evento já foi
// somado no dia do produto (edge vendas-webhook + trigger no banco).

type Evento = {
  id: string;
  plataforma: string;
  tipo: string;
  valor: number;
  data: string;
  produto_plataforma: string | null;
};

const URL_WEBHOOK = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vendas-webhook`;

const moeda = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface VendasAutomaticasProps {
  produtoId: string;
  onMudou: () => void;
}

export function VendasAutomaticas({ produtoId, onMudou }: VendasAutomaticasProps) {
  const [link, setLink] = useState<string | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("vendas_plataforma_eventos")
      .select("id, plataforma, tipo, valor, data, produto_plataforma")
      .eq("produto_id", produtoId)
      .order("recebido_em", { ascending: false })
      .limit(10);
    setEventos((data as Evento[]) || []);
  }, [produtoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function mostrarLink() {
    const { data, error } = await supabase.rpc("produto_vendas_webhook_chave", { p_produto: produtoId });
    if (error || !data) {
      toast({ title: "Não deu para gerar o link", description: "Só o dono do projeto pode.", variant: "destructive" });
      return;
    }
    setLink(`${URL_WEBHOOK}?chave=${data}`);
  }

  async function copiar() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast({ title: "Link copiado" });
  }

  async function desfazer(e: Evento) {
    const ok = await confirmar(
      `Desfazer? ${e.tipo === "venda" ? "A venda" : "O reembolso"} de ${moeda(Number(e.valor))} sai do dia ${format(parseISO(e.data), "dd/MM")}.`,
      { botao: "Desfazer", destrutivo: true },
    );
    if (!ok) return;
    const { error } = await supabase.rpc("vendas_plataforma_desfazer", { p_evento: e.id });
    if (error) {
      toast({ title: "Erro ao desfazer", variant: "destructive" });
      return;
    }
    toast({ title: "Lançamento desfeito" });
    carregar();
    onMudou();
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          Vendas automáticas (Kiwify ou Hotmart)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Cole este link no webhook da plataforma, escolhendo só este produto. Cada venda aprovada e cada
          reembolso entra sozinho no dia certo daqui e do Dash geral.
        </p>
        {link ? (
          <div className="flex gap-2">
            <Input readOnly value={link} className="font-mono text-xs" onFocus={(ev) => ev.target.select()} />
            <Button type="button" variant="outline" size="icon" onClick={copiar} title="Copiar link">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={mostrarLink}>
            <Link2 className="h-4 w-4 mr-2" />
            Mostrar link do webhook
          </Button>
        )}

        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma venda chegou pela plataforma ainda.</p>
        ) : (
          <div className="space-y-1">
            <p className="text-sm font-medium">Últimos lançamentos automáticos</p>
            {eventos.map((e) => (
              <div key={e.id} className="flex items-center gap-3 text-sm py-1 border-b last:border-0">
                <span className="w-12 text-muted-foreground">{format(parseISO(e.data), "dd/MM")}</span>
                <span className={e.tipo === "venda" ? "text-green-600 w-24" : "text-red-500 w-24"}>
                  {e.tipo === "venda" ? "Venda" : "Reembolso"}
                </span>
                <span className="w-24">{moeda(Number(e.valor))}</span>
                <span className="flex-1 truncate text-muted-foreground capitalize">
                  {e.plataforma}
                  {e.produto_plataforma ? ` · ${e.produto_plataforma}` : ""}
                </span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Desfazer" onClick={() => desfazer(e)}>
                  <Undo2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
