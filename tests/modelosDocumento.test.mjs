import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/documentos/modelos.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { htmlMentoriaCore, MODELOS_DOCUMENTO } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('modelo Mentoria Core tem as informações gerais e os 25 roteiros, em ordem', () => {
  const html = htmlMentoriaCore();
  for (const t of ['MENTORIA CORE – ', '📌 Informações Gerais', 'Instagram: ', 'Copywriter Responsável: Junior Costa', 'Mentor Responsável: ', 'Tempo de Mentoria: 3 meses', 'Plano de Mentoria: ']) {
    assert.ok(html.includes(t), t);
  }
  const roteiros = [...html.matchAll(/ROTEIRO (\d\d)/g)].map((m) => m[1]);
  assert.equal(roteiros.length, 25);
  assert.equal(roteiros[0], '01');
  assert.equal(roteiros[24], '25');
});

test('todo texto do modelo sai em Poppins 16', () => {
  const html = htmlMentoriaCore(2);
  const spans = html.match(/<span style="[^"]*">/g);
  assert.ok(spans.length > 0);
  assert.ok(spans.every((s) => s.includes('font-family: Poppins') && s.includes('font-size: 16px')));
});

test('modelo está registrado', () => {
  assert.equal(MODELOS_DOCUMENTO.find((m) => m.id === 'mentoria-core').titulo, 'MENTORIA CORE – ');
});
