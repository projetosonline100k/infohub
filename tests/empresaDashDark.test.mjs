import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/empresa/dashDark.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { etapaEsteira, resumirEsteira, ordenarPerfis, atividadeRecente, prontosParados, tituloCurto, sanitizarEstilo, completudeEstilo, estiloVazio } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const HOJE = '2026-11-12';
const ed = (status, perfil = 'A', extra = {}) => ({ id: Math.random().toString(), titulo: 'Versão dark: t', status, cliente_id: perfil, perfil, criado_em: '2026-11-01T00:00:00Z', atualizado_em: '2026-11-01T00:00:00Z', video_status: null, data_postagem: null, ...extra });

test('etapaEsteira: cada status cai na etapa certa; aprovado com data futura é programado; postado e cancelado saem', () => {
  assert.equal(etapaEsteira(ed('na_fila'), HOJE), 'fila');
  assert.equal(etapaEsteira(ed('editando'), HOJE), 'criando');
  assert.equal(etapaEsteira(ed('renderizando'), HOJE), 'edicao');
  assert.equal(etapaEsteira(ed('aprovando'), HOJE), 'edicao');
  assert.equal(etapaEsteira(ed('revisar'), HOJE), 'revisao');
  assert.equal(etapaEsteira(ed('aprovado'), HOJE), 'pronto');
  assert.equal(etapaEsteira(ed('aprovado', 'A', { data_postagem: '2026-11-12' }), HOJE), 'programado');
  assert.equal(etapaEsteira(ed('aprovado', 'A', { data_postagem: '2026-11-11' }), HOJE), 'pronto');
  assert.equal(etapaEsteira(ed('aprovado', 'A', { video_status: 'postado' }), HOJE), 'postado');
  assert.equal(etapaEsteira(ed('cancelado'), HOJE), 'cancelado');
});

const base = (...nomes) => nomes.map((n) => ({ id: `p-${n}`, perfil: n, cliente_id: n }));

test('resumirEsteira: soma geral, ignora cancelados, postado conta mas sai da esteira, e ordena os vídeos do perfil pela esteira', () => {
  const r = resumirEsteira([ed('aprovado', 'A'), ed('editando', 'A'), ed('revisar', 'B'), ed('cancelado', 'B'), ed('aprovado', 'B', { video_status: 'postado' }), ed('aprovado', 'A', { data_postagem: '2026-11-20' })], HOJE, base('A', 'B'));
  assert.equal(r.geral.total, 5);
  assert.equal(r.geral.pronto, 1); assert.equal(r.geral.criando, 1); assert.equal(r.geral.revisao, 1); assert.equal(r.geral.programado, 1); assert.equal(r.geral.postado, 1);
  const a = r.porPerfil.find((p) => p.perfil === 'A');
  assert.deepEqual(a.videos.map((v) => v.etapa), ['criando', 'pronto', 'programado']);
  assert.equal(a.programados, 1);
  assert.equal(r.porPerfil.find((p) => p.perfil === 'B').ativos, 1);   // o postado não entra
});

test('ordenarPerfis: por nome, por quantidade e por mais recente', () => {
  const r = resumirEsteira([ed('aprovado', 'Zé', { atualizado_em: '2026-11-10T00:00:00Z' }), ed('aprovado', 'Ana', { atualizado_em: '2026-11-01T00:00:00Z' }), ed('aprovado', 'Ana', { atualizado_em: '2026-11-02T00:00:00Z' })], HOJE, base('Zé', 'Ana'));
  assert.deepEqual(ordenarPerfis(r.porPerfil, 'nome').map((p) => p.perfil), ['Ana', 'Zé']);
  assert.deepEqual(ordenarPerfis(r.porPerfil, 'videos').map((p) => p.perfil), ['Ana', 'Zé']);
  assert.deepEqual(ordenarPerfis(r.porPerfil, 'recente').map((p) => p.perfil), ['Zé', 'Ana']);
});

test('atividadeRecente: mais novas primeiro, com a frase da etapa, sem cancelados; título sem o prefixo', () => {
  const a = atividadeRecente([ed('revisar', 'A', { atualizado_em: '2026-11-12T10:00:00Z', titulo: 'Versão dark: Instalivros: Reel 01' }), ed('cancelado', 'A', { atualizado_em: '2026-11-12T11:00:00Z' }), ed('aprovado', 'A', { atualizado_em: '2026-11-12T09:00:00Z' })], HOJE);
  assert.deepEqual(a.map((x) => x.frase), ['foi para Em revisão', 'marcado como Pronto']);
  assert.equal(tituloCurto('Versão dark: Instalivros: Reel 01', 'Instalivros'), 'Reel 01');
  assert.equal(a[0].titulo, 'Instalivros: Reel 01');   // perfil "A" não é prefixo: título só perde o "Versão dark:"
});

test('prontosParados conta só pronto antigo (programado e recente não)', () => {
  const agora = new Date('2026-11-12T12:00:00Z');
  assert.equal(prontosParados([ed('aprovado'), ed('aprovado', 'A', { atualizado_em: '2026-11-11T00:00:00Z' }), ed('aprovado', 'A', { data_postagem: '2026-11-20' }), ed('na_fila')], HOJE, agora), 1);
});

test('perfis criados: aparecem mesmo sem vídeo; só as edições do projeto ligado entram; sem perfil ligado, nada conta', () => {
  const perfis = [{ id: 'nova', perfil: 'Nova', cliente_id: null }, { id: 'a', perfil: 'A', cliente_id: 'A' }];
  const r = resumirEsteira([ed('aprovado', 'A'), ed('na_fila', 'Fora'), ed('revisar', 'Fora')], HOJE, perfis);
  assert.deepEqual(r.porPerfil.map((p) => [p.perfil, p.ativos]).sort(), [['A', 1], ['Nova', 0]]);
  assert.equal(r.geral.total, 1);
  assert.equal(r.geral.fila, 0);   // o projeto "Fora" não está ligado a nenhum perfil
  assert.equal(resumirEsteira([ed('aprovado', 'A')], HOJE, []).geral.total, 0);
});

test('estilo do vídeo: limpa o que veio, mede o que falta e guarda as referências', () => {
  const e = sanitizarEstilo({ descricao: '  Vídeo dark com narração  ', gancho: 5, referencias: [' https://a.co ', '', 7, 'https://b.co'], lixo: 'x' });
  assert.equal(e.descricao, 'Vídeo dark com narração');
  assert.equal(e.gancho, '');
  assert.deepEqual(e.referencias, ['https://a.co', 'https://b.co']);
  assert.equal('lixo' in e, false);
  const c = completudeEstilo(e);
  assert.equal(c.feitos, 1);
  assert.equal(c.total, 8);
  assert.ok(c.faltando.includes('o gancho'));
  assert.equal(completudeEstilo({ ...estiloVazio(), descricao: 'a', gancho: 'b', estrutura: 'c', narracao: 'd', visual: 'e', musica: 'f', cta: 'g', regras: 'h' }).feitos, 8);
});
