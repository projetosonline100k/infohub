import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/automacoes/instagram.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { bate, separarPalavras, conflitos } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('contém: acha a palavra inteira ignorando caixa, acento e pontuação', () => {
  assert.equal(bate(['QUERO'], 'contem', 'Eu quero!!! 🔥'), true);
  assert.equal(bate(['eu quero'], 'contem', '@fulano EU QUERO muito'), true);
  assert.equal(bate(['QUERO'], 'contem', 'queroo'), false);
  assert.equal(bate(['QUERO'], 'contem', ''), false);
});

test('exata: só dispara quando a frase é a palavra', () => {
  assert.equal(bate(['MENTORIA'], 'exata', 'Mentória!'), true);
  assert.equal(bate(['MENTORIA'], 'exata', 'mentoria por favor'), false);
});

test('separarPalavras tira vazias e repetidas', () => {
  assert.deepEqual(separarPalavras('QUERO, quéro ,, eu quero\nlink'), ['QUERO', 'eu quero', 'link']);
});

test('conflitos só conta automações ativas, de outro id e com gatilho em comum', () => {
  const todas = [
    { id: 'a', nome: 'A', ativo: true, palavras_chave: ['QUERO'], gatilhos: ['comentario'] },
    { id: 'b', nome: 'B', ativo: false, palavras_chave: ['QUERO'], gatilhos: ['comentario'] },
    { id: 'c', nome: 'C', ativo: true, palavras_chave: ['quero'], gatilhos: ['dm'] },
  ];
  assert.deepEqual(conflitos(todas, { palavras_chave: ['Quero'], gatilhos: ['comentario'] }), [{ automacao: 'A', palavra: 'QUERO' }]);
  assert.deepEqual(conflitos(todas, { id: 'a', palavras_chave: ['QUERO'], gatilhos: ['comentario'] }), []);
});

const { funil, serieDiaria, porAutomacao } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const disparo = (extra = {}) => ({ automacao_id: 'a', origem: 'comentario', dm_status: 'enviada', cliques: 0, links: [], respondeu_em: null, criado_em: '2026-10-13T15:00:00', ...extra });

test('funil: clique sobre DMs com link, resposta sobre DMs enviadas', () => {
  const etapas = funil([
    disparo({ links: ['x'], cliques: 2 }),
    disparo({ links: ['x'] }),
    disparo({ respondeu_em: '2026-10-13T16:00:00' }),
    disparo({ dm_status: 'erro' }),
  ]);
  assert.deepEqual(etapas.map((e) => e.valor), [4, 3, 1, 1]);
  assert.equal(etapas[1].doAnterior, 3 / 3);
  assert.equal(etapas[2].doAnterior, 1 / 2);
  assert.equal(etapas[3].doAnterior, 1 / 3);
  assert.equal(etapas[0].doAnterior, null);
});

test('funil vazio não divide por zero', () => {
  assert.deepEqual(funil([]).map((e) => e.doTopo), [0, 0, 0, 0]);
});

test('serieDiaria preenche dias vazios e separa por origem', () => {
  const pontos = serieDiaria([
    disparo(), disparo({ origem: 'dm' }), disparo({ dm_status: 'erro' }),
    disparo({ criado_em: '2026-10-01T10:00:00' }),
  ], 3, new Date(2026, 9, 13, 20));
  assert.deepEqual(pontos.map((p) => p.dia), ['2026-10-11', '2026-10-12', '2026-10-13']);
  assert.deepEqual(pontos[2], { dia: '2026-10-13', comentario: 1, dm: 1, story: 0, falhas: 1 });
  assert.equal(pontos[0].comentario, 0);
});

test('porAutomacao agrupa, nomeia e ordena por envios', () => {
  const linhas = porAutomacao([disparo(), disparo({ automacao_id: 'b' }), disparo({ automacao_id: 'b' }), disparo({ automacao_id: null })],
    new Map([['a', 'A'], ['b', 'B']]));
  assert.deepEqual(linhas.map((l) => [l.nome, l.enviadas]), [['B', 2], ['A', 1], ['Automação apagada', 1]]);
});
