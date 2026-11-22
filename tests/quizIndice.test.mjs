import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/quiz/indice.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { calcularNotaIndice, perfilDoIndice, beneficiosDoIndice } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const ind = { max: 10, base: 3, teto: 9, faixas: [{ ate: 6, perfil: 'inquieta' }, { ate: 7, perfil: 'curiosa' }, { ate: 10, perfil: 'ascensao' }], beneficios_de: ['impede', 'objetivo'] };
const perguntas = [
  { id: 'objetivo', opcoes: [{ beneficio: { titulo: 'A', texto: 'a' } }, { beneficio: { titulo: 'B', texto: 'b' } }] },
  { id: 'livro', opcoes: [{ nota: 2 }, { nota: 1.5 }, { nota: 0.5 }] },
  { id: 'tela', opcoes: [{ nota: 1.5 }, { nota: 0.5 }] },
  { id: 'impede', opcoes: [{ beneficio: { titulo: 'A', texto: 'a' } }, { beneficio: { titulo: 'C', texto: 'c' } }] },
];

test('nota: base + notas, arredondada', () => {
  assert.equal(calcularNotaIndice(ind, perguntas, { livro: 1, tela: 0 }), 6);   // 3 + 1,5 + 1,5
  assert.equal(calcularNotaIndice(ind, perguntas, { livro: 2, tela: 1 }), 4);   // 3 + 0,5 + 0,5 = 4
  assert.equal(calcularNotaIndice(ind, perguntas, { livro: 1, tela: 1 }), 5);   // 5 (5,0)
  assert.equal(calcularNotaIndice(ind, perguntas, {}), 3);
});
test('nota: nunca passa do teto (9) nem fica abaixo de 0', () => {
  assert.equal(calcularNotaIndice(ind, perguntas, { livro: 0, tela: 0 }), 7);   // 3 + 2 + 1,5 = 6,5 → 7
  assert.equal(calcularNotaIndice({ ...ind, base: 20 }, perguntas, { livro: 0 }), 9);
  assert.equal(calcularNotaIndice({ ...ind, base: -20 }, perguntas, { livro: 0 }), 0);
});
test('perfil: primeira faixa com nota <= ate', () => {
  assert.equal(perfilDoIndice(ind, 4), 'inquieta');
  assert.equal(perfilDoIndice(ind, 6), 'inquieta');
  assert.equal(perfilDoIndice(ind, 7), 'curiosa');
  assert.equal(perfilDoIndice(ind, 9), 'ascensao');
});
test('benefícios: na ordem dada, sem repetir', () => {
  assert.deepEqual(beneficiosDoIndice(ind, perguntas, { impede: 1, objetivo: 1 }).map((b) => b.titulo), ['C', 'B']);
  assert.deepEqual(beneficiosDoIndice(ind, perguntas, { impede: 0, objetivo: 0 }).map((b) => b.titulo), ['A']);
  assert.deepEqual(beneficiosDoIndice(ind, perguntas, {}), []);
});
