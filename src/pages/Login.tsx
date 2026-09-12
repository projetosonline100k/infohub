import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound, Loader2, LockKeyhole, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modoRecuperacao, setModoRecuperacao] = useState(false);

  if (authLoading) return <div className="min-h-screen bg-background" />;
  if (session) {
    const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (signInError) {
      if (signInError.code === "email_not_confirmed") {
        setError("Este e-mail ainda não foi confirmado. Verifique sua caixa de entrada.");
      } else {
        setError("Não encontramos uma conta com esses dados. Crie sua conta abaixo ou confira a senha.");
      }
      return;
    }
    navigate("/", { replace: true });
  }

  async function handleSignUp() {
    setError("");
    setNotice("");
    if (!email.trim() || !password) {
      setError("Informe seu e-mail e uma senha para criar a conta.");
      return;
    }
    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message.includes("already registered") ? "Este e-mail já possui uma conta. Use Entrar no painel." : "Não foi possível criar a conta. Verifique os dados e tente novamente.");
      return;
    }
    setNotice(data.session ? "Conta criada! Você já pode acessar o painel." : "Conta criada! Confirme o e-mail recebido para poder entrar.");
  }

  async function handleRecuperarSenha(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Informe o e-mail da conta para receber o link de redefinição.");
      return;
    }
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setSubmitting(false);
    if (resetError) {
      setError("Não foi possível enviar o link de redefinição. Tente novamente em instantes.");
      return;
    }
    setNotice("Se esse e-mail tiver uma conta, enviamos um link para redefinir a senha. Confira a caixa de entrada (e o spam).");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <div className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      <section className="relative w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl sm:p-10">
        <div className="mb-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-primary">Infopro</p>
          <h1 className="text-3xl font-bold tracking-tight text-card-foreground">
            {modoRecuperacao ? "Redefinir senha" : "Bem-vindo de volta"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {modoRecuperacao
              ? "Informe seu e-mail e enviaremos um link para você escolher uma nova senha."
              : "Entre para acessar seu painel do infoprodutor."}
          </p>
        </div>

        {modoRecuperacao ? (
          <form onSubmit={handleRecuperarSenha} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email-recuperacao">E-mail</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email-recuperacao"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className="pl-10"
                />
              </div>
            </div>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{notice}</p>}
            <Button type="submit" disabled={submitting} className="h-11 w-full text-base">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {submitting ? "Enviando…" : "Enviar link de redefinição"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setModoRecuperacao(false);
                setError("");
                setNotice("");
              }}
            >
              Voltar para o login
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" className="pl-10" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <button
                  type="button"
                  onClick={() => {
                    setModoRecuperacao(true);
                    setError("");
                    setNotice("");
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pl-10" />
              </div>
            </div>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="rounded-md bg-accent/10 px-3 py-2 text-sm text-accent">{notice}</p>}
            <Button type="submit" disabled={submitting} className="h-11 w-full text-base">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {submitting ? "Entrando…" : "Entrar no painel"}
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              <span>ou</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button type="button" variant="outline" disabled={submitting} onClick={handleSignUp} className="w-full">
              Criar minha conta
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
