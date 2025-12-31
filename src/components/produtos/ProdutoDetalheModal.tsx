import { useState } from "react";
import { X, Info, GitBranch, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProdutoInfoGeral } from "./ProdutoInfoGeral";
import { ProdutoFunil } from "./ProdutoFunil";
import { ProdutoFinanceiro } from "./ProdutoFinanceiro";

interface Produto {
  id: string;
  nome_produto: string;
  preco?: string;
  status: string;
  descricao?: string;
  links_checkout?: any;
  acesso_url?: string;
  acesso_instrucoes?: string;
  ideias?: string;
}

interface ProdutoDetalheModalProps {
  produto: Produto;
  onClose: () => void;
  onUpdate: () => void;
}

type AbaType = "informacoes" | "funil" | "financeiro";

export function ProdutoDetalheModal({ produto, onClose, onUpdate }: ProdutoDetalheModalProps) {
  const [abaAtiva, setAbaAtiva] = useState<AbaType>("informacoes");

  const abas = [
    { id: "informacoes" as AbaType, label: "Informações gerais", icon: Info },
    { id: "funil" as AbaType, label: "Funil de vendas", icon: GitBranch },
    { id: "financeiro" as AbaType, label: "Financeiro", icon: DollarSign },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background flex">
      {/* Sidebar */}
      <div className="w-56 border-r border-border bg-muted/30 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-semibold text-lg truncate">{produto.nome_produto}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="space-y-1">
          {abas.map((aba) => {
            const Icon = aba.icon;
            return (
              <button
                key={aba.id}
                onClick={() => setAbaAtiva(aba.id)}
                className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors flex items-center gap-3 ${
                  abaAtiva === aba.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {aba.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto">
        {abaAtiva === "informacoes" && (
          <ProdutoInfoGeral produto={produto} onUpdate={onUpdate} />
        )}
        {abaAtiva === "funil" && (
          <ProdutoFunil produtoId={produto.id} />
        )}
        {abaAtiva === "financeiro" && (
          <ProdutoFinanceiro produtoId={produto.id} />
        )}
      </div>
    </div>
  );
}
