import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/quiz/selecao.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { metaDaSelecao, alternarMarcada } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('meta: padrão 3, aceita 5 quando pedido, nunca passa do número de opções e ignora lixo', () => {
  const ops = (n) => Array.from({ length: n }, () => ({}));
  assert.equal(metaDaSelecao({ opcoes: ops(8) }), 3);
  assert.equal(metaDaSelecao({ meta: 5, opcoes: ops(8) }), 5);
  assert.equal(metaDaSelecao({ meta: 5, opcoes: ops(4) }), 4);
  assert.equal(metaDaSelecao({ meta: 0, opcoes: ops(8) }), 3);
  assert.equal(metaDaSelecao({ meta: -2, opcoes: ops(8) }), 3);
  assert.equal(metaDaSelecao({ meta: NaN, opcoes: ops(8) }), 3);
  assert.equal(metaDaSelecao({ meta: 3.6, opcoes: ops(8) }), 4);
});

test('alternar: marca até o limite; no limite não marca mais, mas desmarcar sempre funciona', () => {
  assert.deepEqual(alternarMarcada([], 2, 3), [2]);
  assert.deepEqual(alternarMarcada([2], 4, 3), [2, 4]);
  assert.deepEqual(alternarMarcada([2, 4, 1], 5, 3), null);   // completo: nada muda
  assert.deepEqual(alternarMarcada([2, 4, 1], 4, 3), [2, 1]);   // desmarcar libera
  assert.deepEqual(alternarMarcada([2, 4], 7), [2, 4, 7]);   // sem limite (perguntas antigas "escolha quantas quiser")
});
