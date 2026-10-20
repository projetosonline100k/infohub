import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/metaSeguidores.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { corridaMeta, marcosDaPista, numeroCurto } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const serie = [
  { dia: '2026-10-12', seguidores: 32_500 }, { dia: '2026-10-14', seguidores: 32_908 },
  { dia: '2026-10-19', seguidores: 33_916 },
];

test('ritmo da última semana, quanto falta e quando chega', () => {
  const c = corridaMeta(serie, 100_000, { desde: '2026-10-14', hoje: new Date('2026-10-20T12:00:00') });
  assert.equal(c.largada, 32_908);
  assert.equal(c.atual, 33_916);
  assert.equal(c.faltam, 66_084);
  assert.equal(c.ritmoDia, 1416 / 7);
  assert.equal(c.previsao, '2027-09-11');   // 66.084 ÷ ~202/dia = 327 dias
  assert.ok(c.pct > 33.9 && c.pct < 34);
});

test('com prazo: quanto precisa por dia e se o ritmo dá conta', () => {
  const c = corridaMeta(serie, 100_000, { prazo: '2026-12-31', hoje: new Date('2026-10-20T12:00:00') });
  assert.equal(c.diasAtePrazo, 72);
  assert.equal(c.precisaPorDia, Math.ceil(66_084 / 72));
  assert.equal(c.noRitmo, false);
});

test('meta batida e sem dados', () => {
  assert.equal(corridaMeta(serie, 30_000).chegou, true);
  assert.equal(corridaMeta([], 100_000), null);
});

test('placas redondas no caminho e números curtos', () => {
  assert.deepEqual(marcosDaPista(33_916, 100_000), [20_000, 40_000, 60_000, 80_000].filter((v) => v > 33_916 * 0.5));
  assert.equal(numeroCurto(100_000), '100 mil');
  assert.equal(numeroCurto(33_916), '33,9 mil');
});
