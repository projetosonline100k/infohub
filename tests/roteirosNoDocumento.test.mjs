import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/conteudo/roteirosNoDocumento.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { roteirosNoDocumento, rotuloRoteiros } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('conta Headline N, Roteiro N e #N, com o título na mesma linha ou na de baixo', () => {
  const doc = [
    'Headline 1: Hábitos 10 de 10 para matar a preguiça',
    'texto do roteiro…',
    '',
    'HEADLINE 2',
    'Chega a ser alucinante o que esses 4 hábitos fazem',
    'mais texto',
    '#3 - O celular está te roubando',
    '**Roteiro 4** — Sono',
    'Isso aqui #5 não conta (não está no começo da linha)',
  ].join('\n');
  const r = roteirosNoDocumento(doc);
  assert.deepEqual(r.map((x) => x.numero), [1, 2, 3, 4]);
  assert.equal(r[0].titulo, 'Hábitos 10 de 10 para matar a preguiça');
  assert.equal(r[1].titulo, 'Chega a ser alucinante o que esses 4 hábitos fazem');
  assert.equal(r[2].titulo, 'O celular está te roubando');
  assert.equal(r[3].titulo, 'Sono');
  assert.equal(rotuloRoteiros(1), '1 roteiro');
  assert.equal(rotuloRoteiros(15), '15 roteiros');
});

test('texto sem marcação e "# Título" de markdown não contam', () => {
  assert.equal(roteirosNoDocumento('# Ideias da semana\nalgum texto').length, 0);
  assert.equal(roteirosNoDocumento(null).length, 0);
});
