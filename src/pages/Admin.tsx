import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { ehAdmin } from "@/lib/admin";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, KeyRound, Trash2, ShieldCheck, Copy, Eye, EyeOff } from "lucide-react";

interface Usuario {
  id: string;
  email: string;
  nome: string | null;
  criado_em: string;
  confirmado: boolean;
  ultimo_login: string | null;
  origem: "admin" | "cadastro";
}

const gerarSenhaAleatoria = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const Admin = () => {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);

  const [novoEmail, setNovoEmail] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novaSenha, setNovaSenha] = useState(gerarSenhaAleatoria);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [usuarioSenha, setUsuarioSenha] = useState<Usuario | null>(null);
  const [senhaRedefinida, setSenhaRedefinida] = useState(gerarSenhaAleatoria);

  const podeAdministrar = ehAdmin(user?.email);

  const chamar = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("admin-users", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const carregarUsuarios = async () => {
    setLoading(true);
    try {
      const data = await chamar({ action: "list" });
      setUsuarios(data.usuarios || []);
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (podeAdministrar) carregarUsuarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeAdministrar]);

  if (!podeAdministrar) {
    return (
      <div className="max-w-lg mx-auto mt-24 text-center space-y-2">
        <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto" />
        <p className="text-muted-foreground">Esta área é restrita ao administrador da conta.</p>
      </div>
    );
  }

  const abrirCriacao = () => {
    setNovoEmail("");
    setNovoNome("");
    setNovaSenha(gerarSenhaAleatoria());
    setMostrarSenha(false);
    setCriando(true);
  };

  const criarUsuario = async () => {
    if (!novoEmail.trim() || !novaSenha) return;
    setSalvando(true);
    try {
      await chamar({ action: "create", email: novoEmail.trim(), senha: novaSenha, nome: novoNome });
      toast.success("Usuário criado. Ele já pode entrar com o e-mail e a senha definidos aqui.");
      setCriando(false);
      carregarUsuarios();
    } catch (error) {
      console.error("Erro ao criar usuário:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao criar usuário");
    } finally {
      setSalvando(false);
    }
  };

  const abrirRedefinicao = (usuario: Usuario) => {
    setUsuarioSenha(usuario);
    setSenhaRedefinida(gerarSenhaAleatoria());
  };

  const redefinirSenha = async () => {
    if (!usuarioSenha || !senhaRedefinida) return;
    setSalvando(true);
    try {
      await chamar({ action: "resetPassword", userId: usuarioSenha.id, novaSenha: senhaRedefinida });
      toast.success("Senha redefinida");
      setUsuarioSenha(null);
    } catch (error) {
      console.error("Erro ao redefinir senha:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao redefinir senha");
    } finally {
      setSalvando(false);
    }
  };

  const excluirUsuario = async (usuario: Usuario) => {
    if (!window.confirm(`Excluir a conta de ${usuario.email}? Essa ação não pode ser desfeita.`)) return;
    try {
      await chamar({ action: "delete", userId: usuario.id });
      toast.success("Usuário excluído");
      setUsuarios((prev) => prev.filter((u) => u.id !== usuario.id));
    } catch (error) {
      console.error("Erro ao excluir usuário:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao excluir usuário");
    }
  };

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast.success("Copiado");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Administração</h1>
          <p className="text-muted-foreground">
            Crie contas para sua equipe. Elas nascem sem nenhum acesso — só passam a ver um cliente quando você
            adicionar a pessoa na equipe daquele cliente. Quem se cadastra sozinho (por exemplo, ao aceitar um link
            de documento compartilhado) também aparece aqui, marcado como "Cadastro externo".
          </p>
        </div>
        <Button onClick={abrirCriacao}>
          <Plus className="h-4 w-4 mr-2" />
          Novo usuário
        </Button>
      </div>

      {loading ? (
        <Card className="p-8 shadow-md">
          <p className="text-center text-muted-foreground">Carregando...</p>
        </Card>
      ) : usuarios.length === 0 ? (
        <Card className="p-8 shadow-md">
          <p className="text-center text-muted-foreground">Nenhum usuário criado ainda.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {usuarios.map((usuario) => (
            <Card key={usuario.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground truncate">{usuario.nome || usuario.email}</p>
                  {usuario.origem === "cadastro" && (
                    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
                      Cadastro externo
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">{usuario.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Criado {formatDistanceToNow(new Date(usuario.criado_em), { locale: ptBR, addSuffix: true })}
                  {usuario.ultimo_login &&
                    ` · último acesso ${formatDistanceToNow(new Date(usuario.ultimo_login), { locale: ptBR, addSuffix: true })}`}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => abrirRedefinicao(usuario)}>
                  <KeyRound className="h-4 w-4 mr-1.5" />
                  Redefinir senha
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => excluirUsuario(usuario)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Criar usuário */}
      <Dialog open={criando} onOpenChange={setCriando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome (opcional)</Label>
              <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Como essa pessoa é chamada" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
                placeholder="pessoa@exemplo.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Senha</Label>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Input
                    type={mostrarSenha ? "text" : "password"}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="button" variant="outline" onClick={() => setNovaSenha(gerarSenhaAleatoria())}>
                  Gerar
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => copiar(novaSenha)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Compartilhe e-mail e senha com a pessoa por fora (WhatsApp, etc). Não precisa confirmar e-mail — o
                acesso já entra pronto para usar.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCriando(false)}>
              Cancelar
            </Button>
            <Button onClick={criarUsuario} disabled={salvando || !novoEmail.trim() || novaSenha.length < 6}>
              Criar usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redefinir senha */}
      <Dialog open={!!usuarioSenha} onOpenChange={(o) => !o && setUsuarioSenha(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha de {usuarioSenha?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <div className="flex items-center gap-1.5">
              <Input value={senhaRedefinida} onChange={(e) => setSenhaRedefinida(e.target.value)} />
              <Button type="button" variant="outline" onClick={() => setSenhaRedefinida(gerarSenhaAleatoria())}>
                Gerar
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={() => copiar(senhaRedefinida)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUsuarioSenha(null)}>
              Cancelar
            </Button>
            <Button onClick={redefinirSenha} disabled={salvando || senhaRedefinida.length < 6}>
              Redefinir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
