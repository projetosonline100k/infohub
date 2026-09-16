import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/diasSemana.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { detectarDiaSemana } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('reconhece os títulos do quadro com espaços, acentos e maiúsculas', () => {
  ['SEGUNDA FEIRA', 'TERÇA FEIRA', 'QUARTA FEIRA', 'QUINTA FEIRA', 'SEXTA FEIRA', 'SÁBADO', 'DOMINGO']
    .forEach((nome, index) => assert.equal(detectarDiaSemana(nome), index));
});
test('preserva dias abreviados e com hífen', () => {
  assert.equal(detectarDiaSemana('terça-feira'), 1);
  assert.equal(detectarDiaSemana('  Segunda   feira  '), 0);
  assert.equal(detectarDiaSemana('qua'), 2);
});
test('colunas comuns continuam sendo identificadas por status', () => {
  for (const nome of ['Em andamento', 'Backlog', 'Concluído', 'Segunda etapa']) assert.equal(detectarDiaSemana(nome), null);
});
