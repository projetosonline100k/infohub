import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const cfg = { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } };
const cod = (a) => ts.transpileModule(readFileSync(new URL(a, import.meta.url), 'utf8'), cfg).outputText;
const url = (js) => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const puro = url(cod('../supabase/functions/_shared/fluxo.ts'));
const m = await import(url(cod('../src/lib/automacoes/manyhub.ts').replace('"../../../supabase/functions/_shared/fluxo"', `"${puro}"`)));

const no = (id, tipo, dados = {}) => ({ id, tipo, x: 0, y: 0, dados });
const g = { nos: [no('inicio', 'inicio'), no('m1', 'mensagem', { texto: 'Quer o link?', botoes: [{ id: 'sim', titulo: 'Quero', tipo: 'resposta' }, { id: 'nao', titulo: 'Não', tipo: 'resposta' }] }), no('m2', 'mensagem', { texto: 'Aqui está' }), no('fim', 'fim')],
  ligacoes: [{ de: 'inicio', saida: 'proximo', para: 'm1' }, { de: 'm1', saida: 'sim', para: 'm2' }, { de: 'm1', saida: 'nao', para: 'fim' }, { de: 'm2', saida: 'proximo', para: 'fim' }] };
const fluxos = [{ id: 'f1', nome: 'Boas-vindas', grafo: g }];
const ex = (id, contato, estado, historico, extra = {}) => ({ id, fluxo_id: 'f1', contato_id: contato, contato_username: contato, estado, no_atual: null, historico, erro: null, criado_em: '2026-11-14T10:00:00Z', ...extra });

test('pessoas: quem esperando, quem concluiu, quem parou e quem deu erro, com onde parou', () => {
  const execs = [
    ex('1', 'ana', 'aguardando_resposta', [{ no: 'm1', tipo: 'mensagem', em: '2026-11-14T10:01:00Z' }], { no_atual: 'm1' }),
    ex('2', 'bia', 'fim', [{ no: 'm1', tipo: 'mensagem' }, { no: 'm1', tipo: 'resposta:sim' }, { no: 'm2', tipo: 'mensagem' }]),
    ex('3', 'caio', 'fim', [{ no: 'm1', tipo: 'mensagem' }]),
    ex('4', 'duda', 'erro', [], { erro: 'Meta recusou' }),
  ];
  const ps = m.montarPessoas(execs, [], fluxos, new Map());
  const por = Object.fromEntries(ps.map((p) => [p.contatoId, p]));
  assert.equal(por.ana.situacao, 'esperando'); assert.ok(por.ana.resumo.includes('Mensagem 1') && por.ana.resumo.includes('Quer o link'));
  assert.equal(por.bia.situacao, 'concluiu'); assert.equal(por.bia.respondeu, true);
  assert.equal(por.caio.situacao, 'parou');
  assert.equal(por.duda.situacao, 'erro'); assert.ok(por.duda.resumo.includes('Meta recusou'));
  assert.equal(ps[0].contatoId, 'ana');   // a mais recente primeiro
});

test('automação simples entra na lista: clicou/respondeu avança, sem resposta parou; fluxo vence na mesma pessoa só se for mais recente', () => {
  const disparos = [
    { id: 'd1', automacao_id: 'a1', autor_id: 'x', autor_username: 'xis', criado_em: '2026-11-14T09:00:00Z', respondeu_em: null, cliques: 2, dm_status: 'enviada' },
    { id: 'd2', automacao_id: 'a1', autor_id: 'y', autor_username: 'ypsilon', criado_em: '2026-11-14T09:00:00Z', respondeu_em: null, cliques: 0, dm_status: 'enviada' },
    { id: 'd3', automacao_id: 'a1', autor_id: 'z', autor_username: 'zeta', criado_em: '2026-11-14T09:00:00Z', respondeu_em: null, cliques: 0, dm_status: 'erro' },
  ];
  const ps = m.montarPessoas([], disparos, fluxos, new Map([['a1', 'Instalivros']]));
  const por = Object.fromEntries(ps.map((p) => [p.contatoId, p]));
  assert.equal(por.x.situacao, 'avancou'); assert.equal(por.x.clicou, true); assert.equal(por.x.origem.nome, 'Instalivros');
  assert.equal(por.y.situacao, 'parou'); assert.equal(por.z.situacao, 'erro');
});

test('funil do fluxo: quantas pessoas chegaram em cada mensagem e por qual botão seguiram', () => {
  const execs = [
    { historico: [{ no: 'm1', tipo: 'mensagem' }, { no: 'm1', tipo: 'resposta:sim' }, { no: 'm2', tipo: 'mensagem' }] },
    { historico: [{ no: 'm1', tipo: 'mensagem' }, { no: 'm1', tipo: 'resposta:nao' }] },
    { historico: [{ no: 'm1', tipo: 'mensagem' }] },
  ];
  const f = m.funilDoFluxo(g, execs);
  assert.deepEqual(f.map((l) => [l.rotulo, l.chegaram, l.responderam]), [['Mensagem 1', 3, 2], ['Mensagem 2', 1, 0]]);
  assert.deepEqual(f[0].ramos, [{ titulo: 'Quero', n: 1 }, { titulo: 'Não', n: 1 }]);
});

test('janela de 24 h: só vale a partir da última mensagem da pessoa (comentário não conta)', () => {
  const agora = Date.parse('2026-11-14T12:00:00Z');
  assert.equal(m.podeResponder([{ de_mim: false, tipo: 'texto', enviada_em: '2026-11-14T08:00:00Z' }], agora).pode, true);
  assert.equal(m.podeResponder([{ de_mim: false, tipo: 'texto', enviada_em: '2026-11-13T08:00:00Z' }], agora).pode, false);
  assert.equal(m.podeResponder([{ de_mim: false, tipo: 'comentario', enviada_em: '2026-11-14T11:00:00Z' }], agora).pode, false);
  assert.equal(m.podeResponder([{ de_mim: true, tipo: 'texto', enviada_em: '2026-11-14T11:00:00Z' }], agora).pode, false);
});
