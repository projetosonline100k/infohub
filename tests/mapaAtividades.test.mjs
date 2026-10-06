import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/atividades/mapaAtividades.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { agruparPorColuna, estaAtrasadaMapa, zoomNoPonto, enquadrar, COLUNAS_PADRAO } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const a = (id, status, ordem = 0, extra = {}) => ({ id, status, ordem, concluida: false, data_vencimento: null, ...extra });
const ids = (lista) => lista.map((x) => x.id);

test('distribui pelas colunas, ordenado por ordem', () => {
  const g = agruparPorColuna([a('2', 'backlog', 2), a('1', 'backlog', 1), a('3', 'revisao')], COLUNAS_PADRAO);
  assert.deepEqual(ids(g.get('backlog')), ['1', '2']);
  assert.deepEqual(ids(g.get('revisao')), ['3']);
  assert.deepEqual(ids(g.get('finalizado')), []);
});

test('status que não existe no quadro vai pra primeira coluna (ou conclusão se concluída)', () => {
  const g = agruparPorColuna([a('x', 'sumiu'), a('y', 'sumiu', 0, { concluida: true })], COLUNAS_PADRAO);
  assert.deepEqual(ids(g.get('backlog')), ['x']);
  assert.deepEqual(ids(g.get('finalizado')), ['y']);
});

test('atrasada: vencimento antes de hoje e não concluída', () => {
  assert.equal(estaAtrasadaMapa(a('1', 'backlog', 0, { data_vencimento: '2026-10-01' }), '2026-10-04'), true);
  assert.equal(estaAtrasadaMapa(a('1', 'backlog', 0, { data_vencimento: '2026-10-04' }), '2026-10-04'), false);
  assert.equal(estaAtrasadaMapa(a('1', 'backlog', 0, { data_vencimento: '2026-10-01', concluida: true }), '2026-10-04'), false);
});

test('zoom mantém o ponto sob o cursor no lugar', () => {
  const v = zoomNoPonto({ x: 0, y: 0, escala: 1 }, 2, 100, 50);
  // O ponto de conteúdo (100, 50) continua em (100, 50) na tela.
  assert.equal(100 * v.escala + v.x, 100);
  assert.equal(50 * v.escala + v.y, 50);
});

test('zoom respeita os limites', () => {
  assert.equal(zoomNoPonto({ x: 0, y: 0, escala: 1 }, 10, 0, 0).escala, 2);
  assert.equal(zoomNoPonto({ x: 0, y: 0, escala: 1 }, 0.01, 0, 0).escala, 0.1);
});

test('enquadrar cabe o conteúdo e nunca amplia além de 100%', () => {
  const v = enquadrar(2000, 1000, 1000, 600);
  assert.ok(2000 * v.escala <= 1000 - 64 + 0.001);
  assert.equal(enquadrar(100, 100, 1000, 600).escala, 1);
});
