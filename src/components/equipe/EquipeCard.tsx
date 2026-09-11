import { useAuth } from "@/auth/AuthProvider";
import { FormEvent, useEffect, useState } from 'react';
import { Plus, Pencil, Users, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { areasEquipe, AcaoEquipe, AreaEquipe, lerPermissoes, permissoesVazias } from '@/lib/equipe';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';

type Membro = Tables<'equipe_cliente'>;
export function EquipeCard({ clienteId, permissoesDisponiveis = true }: { clienteId: string; permissoesDisponiveis?: boolean }) {
  const { user } = useAuth();
  const [membros, setMembros] = useState<Membro[]>([]);
  const [clientes, setClientes] = useState<{ id: string; nome_especialista: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Membro | null>(null);
  const [removendo, setRemovendo] = useState<Membro | null>(null);
  const [saving, setSaving] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState('');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [permissoes, setPermissoes] = useState(permissoesVazias);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      supabase.from('equipe_cliente').select('*').eq('cliente_id', clienteId).order('created_at'),
      supabase.from('clientes').select('id,nome_especialista').eq('user_id', user?.id || '').order('nome_especialista'),
    ]).then(([team, clients]) => {
      if (!active) return;
      setLoadError(Boolean(team.error || clients.error));
      setMembros(team.data || []);
      setClientes(clients.data || []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [clienteId, user?.id]);

  function abrir(membro: Membro | null) {
    setEditando(membro);
    setNome(membro?.nome_pessoa || '');
    setEmail(membro?.email || '');
    setPapel(membro?.papel || '');
    setSelecionados(membro?.clientes_permitidos || []);
    setPermissoes(lerPermissoes(membro?.permissoes));
    setErro('');
    setAberto(true);
  }
  function alterar(area: AreaEquipe, acao: AcaoEquipe, checked: boolean) {
    setPermissoes(current => ({ ...current, [area]: acao === 'acessar' && !checked
      ? { acessar: false, criar: false, editar: false }
      : { ...current[area], [acao]: checked, ...(checked ? { acessar: true } : {}) } }));
  }
  async function salvar(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!nome.trim() || !papel.trim() || !email.trim()) { setErro('Preencha nome, e-mail e função.'); return; }
    setSaving(true);
    setErro('');
    const payload = { cliente_id: clienteId, nome_pessoa: nome.trim(), papel: papel.trim(), email: email.trim().toLowerCase(), clientes_permitidos: selecionados, permissoes };
    try {
      const result = editando
        ? await supabase.from('equipe_cliente').update(payload).eq('id', editando.id).eq('cliente_id', clienteId).select().single()
        : await supabase.from('equipe_cliente').insert(payload).select().single();
      if (result.error) throw result.error;
      setMembros(current => editando ? current.map(m => m.id === editando.id ? result.data : m) : [...current, result.data]);
      setAberto(false);
      toast({ title: editando ? 'Permissões atualizadas' : 'Membro adicionado' });
    } catch (error) {
      setErro((error as { code?: string }).code === '23505' ? 'Este e-mail já está cadastrado nesta equipe.' : 'Não foi possível salvar o membro. Verifique sua conexão e tente novamente.');
    } finally { setSaving(false); }
  }
  async function remover() {
    if (!removendo || saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from('equipe_cliente').delete().eq('id', removendo.id).eq('cliente_id', clienteId).select('id').single();
      if (error || !data) throw error;
      setMembros(current => current.filter(m => m.id !== removendo.id));
      setRemovendo(null);
      toast({ title: 'Membro removido desta equipe' });
    } catch { toast({ title: 'Não foi possível remover o membro', variant: 'destructive' }); }
    finally { setSaving(false); }
  }
  return <Card>
    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
      <CardTitle>Equipe</CardTitle>
      <Button size="sm" onClick={() => abrir(null)} disabled={loading || loadError || !permissoesDisponiveis}><Plus className="mr-2 h-4 w-4" />Adicionar membro</Button>
    </CardHeader>
    <CardContent>
      {!permissoesDisponiveis && <p role="status" className="mb-4 text-sm text-muted-foreground">Os membros cadastrados continuam listados abaixo. A configuração de permissões ficará disponível após a atualização do sistema.</p>}
      {loading ? <p className="text-sm text-muted-foreground">Carregando equipe...</p> : loadError ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar a equipe. Recarregue a página para tentar novamente.</p> : membros.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center"><Users className="mx-auto mb-3 h-6 w-6 text-muted-foreground" /><p className="text-sm font-medium">Sua equipe começa aqui</p><p className="mt-1 text-sm text-muted-foreground">Adicione pessoas e escolha o que cada uma pode acessar.</p></div> : <div className="space-y-3">{membros.map(m => <div key={m.id} className="flex items-center gap-3 rounded-lg border p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{m.nome_pessoa.slice(0, 2).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{m.nome_pessoa}</p><p className="truncate text-xs text-muted-foreground">{m.papel}{m.email ? ` · ${m.email}` : ''}</p><p className="mt-1 text-xs text-muted-foreground">{areasEquipe.filter(a => lerPermissoes(m.permissoes)[a.id].acessar).map(a => a.label).join(' · ') || (permissoesDisponiveis ? 'Sem permissões de acesso' : 'Permissões ainda não configuradas')}</p></div>
        <Button variant="ghost" size="icon" disabled={!permissoesDisponiveis} aria-label={`Editar permissões de ${m.nome_pessoa}`} onClick={() => abrir(m)}><Pencil className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" disabled={!permissoesDisponiveis} aria-label={`Remover ${m.nome_pessoa}`} onClick={() => setRemovendo(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>)}</div>}
    </CardContent>
    <Dialog open={aberto} onOpenChange={open => { if (!saving) setAberto(open); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editando ? 'Editar membro e permissões' : 'Adicionar membro'}</DialogTitle><DialogDescription>Defina quais clientes e áreas esta pessoa pode acessar com a conta dela.</DialogDescription></DialogHeader>
        <form onSubmit={salvar} className="space-y-6">
          <fieldset disabled={saving} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="membro-nome">Nome</Label><Input id="membro-nome" required maxLength={120} value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da pessoa" /></div><div className="space-y-2"><Label htmlFor="membro-papel">Função</Label><Input id="membro-papel" required maxLength={120} value={papel} onChange={e => setPapel(e.target.value)} placeholder="Ex.: Copywriter" /></div></div>
            <div className="space-y-2"><Label htmlFor="membro-email">E-mail de acesso</Label><Input id="membro-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="pessoa@exemplo.com" /><p className="text-xs text-muted-foreground">A pessoa deve criar uma conta com este e-mail e confirmá-lo para entrar. Nenhum e-mail é enviado ao salvar.</p></div>
            <div className="space-y-3"><h3 className="text-sm font-semibold">Clientes permitidos</h3><p className="text-xs text-muted-foreground">Este cliente está incluído. Selecione outros clientes para compartilhar as mesmas permissões.</p><div className="max-h-40 space-y-3 overflow-y-auto rounded-lg border p-3">{clientes.map(c => <label key={c.id} className="flex items-center gap-3 text-sm"><Checkbox checked={c.id === clienteId || selecionados.includes(c.id)} disabled={c.id === clienteId} onCheckedChange={checked => setSelecionados(current => checked === true ? [...current, c.id] : current.filter(id => id !== c.id))} />{c.nome_especialista}{c.id === clienteId && <span className="text-xs text-muted-foreground">(atual)</span>}</label>)}</div></div>
            <div className="space-y-3"><h3 className="text-sm font-semibold">Permissões por área</h3><p className="text-xs text-muted-foreground">Criar e editar também liberam a visualização. Excluir registros e gerenciar a equipe são ações do proprietário.</p><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-left">Área</th>{['Acessar', 'Criar', 'Editar'].map(a => <th key={a} className="p-3 text-center">{a}</th>)}</tr></thead><tbody>{areasEquipe.map(area => <tr key={area.id} className="border-t"><th scope="row" className="p-3 text-left font-normal">{area.label}</th>{(['acessar', 'criar', 'editar'] as const).map(acao => <td key={acao} className="p-3 text-center"><Checkbox aria-label={`${acao} ${area.label}`} checked={permissoes[area.id][acao]} onCheckedChange={value => alterar(area.id, acao, value === true)} /></td>)}</tr>)}</tbody></table></div></div>
          </fieldset>
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setAberto(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar membro'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={Boolean(removendo)} onOpenChange={open => { if (!open && !saving) setRemovendo(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remover {removendo?.nome_pessoa}?</AlertDialogTitle><AlertDialogDescription>As permissões concedidas por esta equipe serão revogadas. Permissões de outras equipes continuam válidas.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel><AlertDialogAction disabled={saving} onClick={e => { e.preventDefault(); void remover(); }}>{saving ? 'Removendo...' : 'Remover membro'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </Card>;
}
