import { useEffect, useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// Substitutos de window.confirm / window.prompt. No app desktop (Tauri) esses
// diálogos do navegador não existem — confirm() devolvia "não" sem mostrar
// nada, então excluir evento, documento, nota etc. simplesmente não fazia
// nada. Estes funcionam igual na web e no Mac, com o visual do app.

type Pedido =
  | { tipo: "confirmar"; mensagem: string; botao: string; destrutivo: boolean; responder: (ok: boolean) => void }
  | { tipo: "texto"; mensagem: string; valor: string; responder: (texto: string | null) => void };

let mostrar: ((pedido: Pedido) => void) | null = null;

// Palavras que indicam ação destrutiva: botão vermelho e rótulo "Excluir".
const DESTRUTIVO = /excluir|apagar|remover|perde/i;

export function confirmar(mensagem: string, opcoes?: { botao?: string; destrutivo?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    if (!mostrar) { resolve(window.confirm(mensagem)); return; }
    const destrutivo = opcoes?.destrutivo ?? DESTRUTIVO.test(mensagem);
    mostrar({ tipo: "confirmar", mensagem, botao: opcoes?.botao ?? (destrutivo ? "Excluir" : "Confirmar"), destrutivo, responder: resolve });
  });
}

export function pedirTexto(mensagem: string, valorInicial = ""): Promise<string | null> {
  return new Promise((resolve) => {
    if (!mostrar) { resolve(window.prompt(mensagem, valorInicial)); return; }
    mostrar({ tipo: "texto", mensagem, valor: valorInicial, responder: resolve });
  });
}

// Montado uma vez na raiz do app (App.tsx).
export function DialogosGlobais() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [texto, setTexto] = useState("");
  const respondido = useRef(false);

  useEffect(() => {
    mostrar = (novo) => {
      respondido.current = false;
      if (novo.tipo === "texto") setTexto(novo.valor);
      setPedido(novo);
    };
    return () => { mostrar = null; };
  }, []);

  const responder = (resposta: boolean) => {
    if (!pedido || respondido.current) return;
    respondido.current = true;
    if (pedido.tipo === "confirmar") pedido.responder(resposta);
    else pedido.responder(resposta ? texto : null);
    setPedido(null);
  };

  return (
    <AlertDialog open={!!pedido} onOpenChange={(aberto) => { if (!aberto) responder(false); }}>
      <AlertDialogContent className="z-[400]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base font-semibold leading-snug">{pedido?.mensagem}</AlertDialogTitle>
          {pedido?.tipo === "confirmar" && pedido.destrutivo && (
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {pedido?.tipo === "texto" && (
          <Input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); responder(true); } }} />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => responder(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => responder(true)}
            className={cn(pedido?.tipo === "confirmar" && pedido.destrutivo && buttonVariants({ variant: "destructive" }))}
          >
            {pedido?.tipo === "confirmar" ? pedido.botao : "OK"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
