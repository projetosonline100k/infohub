import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/instagramMetricas.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { resumoInstagram } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const linha = (dia, seguidores, alcance = null, visualizacoes = null, erro = null) =>
  ({ dia, username: 'conta', seguidores, alcance, visualizacoes, erro });

test('sem linhas: nada a mostrar', () => {
  const r = resumoInstagram([]);
  assert.equal(r.seguidores, null);
  assert.equal(r.semana.ganho, null);
});

test('ganho da semana usa o dia de 7 dias antes e soma alcance da janela', () => {
  const linhas = [];
  for (let d = 1; d <= 15; d++) linhas.push(linha(`2026-10-${String(d).padStart(2, '0')}`, 1000 + d * 10, 100, 300));
  const r = resumoInstagram(linhas.reverse());
  assert.equal(r.seguidores, 1150);
  assert.equal(r.semana.desde, '2026-10-08');
  assert.equal(r.semana.ganho, 70);
  assert.equal(r.semana.alcance, 700);
  assert.equal(r.semana.visualizacoes, 2100);
  // Mês sem 30 dias de histórico: base é o dia mais antigo.
  assert.equal(r.mes.desde, '2026-10-01');
  assert.equal(r.mes.ganho, 140);
});

test('um dia só: sem ganho ainda; erro de insights pede reconexão', () => {
  const r = resumoInstagram([linha('2026-10-15', 500, null, null, 'insights: permissão')]);
  assert.equal(r.seguidores, 500);
  assert.equal(r.semana.ganho, null);
  assert.equal(r.semana.alcance, null);
  assert.equal(r.semInsights, true);
});
