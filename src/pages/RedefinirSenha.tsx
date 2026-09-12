import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, Loader2, LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Chegamos aqui pelo link de "Esqueceu a senha?" do e-mail. O Supabase já
// autentica a sessão sozinho a partir do token na URL; só falta o formulário
// para escolher a senha nova.
export default function RedefinirSenha() {
  const navigate = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [linkValido, setLinkValido] = useState<boolean | null>(null);
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    // O evento PASSWORD_RECOVERY dispara assim que o Supabase processa o
    // token do link; getSession cobre o caso de o evento já ter passado
    // antes deste componente montar.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setLinkValido(true);
        setPronto(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!pronto) {
        setLinkValido(!!data.session);
        setPronto(true);
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (senha.length < 6) {
      setError("A senha precisa ter ao menos 6 caracteres.");
      return;
    }
    if (senha !== confirmarSenha) {
      setError("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: senha });
    setSubmitting(false);
    if (updateError) {
      setError("Não foi possível redefinir a senha. Solicite um novo link e tente de novo.");
      return;
    }
    setSucesso(true);
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      <section className="relative w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl sm:p-10">
        <div className="mb-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <KeyRound className="h-6 w-6" />
          </div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary">Infopro</p>
          <h1 className="text-3xl font-bold tracking-tight text-card-foreground">Nova senha</h1>
        </div>

        {!pronto ? (
          <p className="text-sm text-muted-foreground">Verificando o link...</p>
        ) : sucesso ? (
          <div className="space-y-5">
            <p className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">Senha redefinida com sucesso.</p>
            <Button className="h-11 w-full text-base" onClick={() => navigate("/", { replace: true })}>
              Ir para o painel
            </Button>
          </div>
        ) : !linkValido ? (
          <div className="space-y-5">
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Esse link é inválido ou já expirou. Peça um novo em "Esqueceu a senha?" na tela de login.
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
              Voltar para o login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="senha">Nova senha</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="senha"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmar-senha">Confirmar nova senha</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirmar-senha"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                />
              </div>
            </div>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting} className="h-11 w-full text-base">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {submitting ? "Salvando…" : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
