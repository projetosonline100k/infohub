import { Card } from "@/components/ui/card";
import { isDesktop } from "@/lib/platform";

interface AtalhoInfo {
  acao: string;
  combinacao: string;
  disponivel: boolean;
}

const ATALHOS: AtalhoInfo[] = [
  { acao: "Abrir Atlas", combinacao: "⌘ Shift J", disponivel: false },
  { acao: "Nova tarefa", combinacao: "⌘ Shift T", disponivel: false },
  { acao: "Nova nota", combinacao: "⌘ Shift N", disponivel: false },
  { acao: "Encolher a lateral", combinacao: "⌘ Shift E", disponivel: true },
];

// Administração → Atlas → Atalhos (item 14). 27/10: o ⌘⇧E deixou de ser o "Encerrar o dia" (o Davi não
// usava) e encolhe a lateral. Os outros 3 aparecem como "Em breve" (item 14 do pedido:
// "se os outros atalhos ainda não existirem, podem aparecer como 'Em
// breve'"). Estrutura já pronta pra ganhar edição de atalho no futuro
// (bastaria trocar a "combinacao" fixa por um valor editável).
export function AdminJarvisAtalhos() {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Atalhos</h2>
        <p className="text-sm text-muted-foreground">
          Atalhos de teclado globais do app desktop — funcionam mesmo com o Infopro Hub em segundo plano.
        </p>
      </div>

      <Card className="divide-y divide-border p-0">
        {ATALHOS.map((atalho) => (
          <div key={atalho.acao} className="flex items-center justify-between gap-4 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{atalho.acao}</p>
              {atalho.disponivel && !isDesktop() && (
                <p className="text-xs text-muted-foreground">Disponível só no app desktop.</p>
              )}
            </div>
            <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {atalho.disponivel ? atalho.combinacao : "Em breve"}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
