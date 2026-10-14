import { CheckCircle2, XCircle } from "lucide-react";

// Página pública de volta do link de conexão do Instagram (edge function
// instagram-automacoes/callback). Quem chega aqui geralmente é o cliente,
// no celular, sem login no Hub.
export default function InstagramConectado() {
  const params = new URLSearchParams(window.location.search);
  const ok = params.get("ok") === "1";
  const conta = params.get("conta");
  const erro = params.get("erro");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {ok ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h1 className="mt-4 text-xl font-semibold">Instagram conectado!</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {conta ? <>A conta <strong className="text-foreground">@{conta}</strong> está ligada</> : "Sua conta está ligada"} às
              automações do Infopro Hub. Pode fechar esta página.
            </p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-12 w-12 text-destructive" />
            <h1 className="mt-4 text-xl font-semibold">Não deu certo</h1>
            <p className="mt-2 text-sm text-muted-foreground">{erro ?? "Algo deu errado na conexão."}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Confira se você aceitou o convite em Instagram → Configurações → Apps e sites → Convites do testador, e peça um link novo.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
