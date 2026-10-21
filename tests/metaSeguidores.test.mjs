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

test('o que fazer: alcance necessário, formato, repetir, frequência e prazo realista', async () => {
  const { sugestoesMeta } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const c = corridaMeta(serie, 100_000, { prazo: '2026-10-30', hoje: new Date('2026-10-20T12:00:00') });
  const dias = [
    { dia: '2026-10-14', seguidores: 32_908, visualizacoes: 13_930 }, { dia: '2026-10-15', seguidores: 32_956, visualizacoes: 13_495 },
    { dia: '2026-10-19', seguidores: 33_916, visualizacoes: 23_157 },
  ];
  const post = (tipo, v, comp, i) => ({ tipo, formato: tipo === 'REELS' ? 'VIDEO' : 'CAROUSEL_ALBUM', legenda: `Post ${i}\nresto`, permalink: `https://x/${i}`,
    publicado_em: '2026-10-18T10:00:00Z', visualizacoes: v, alcance: v, salvamentos: 1, compartilhamentos: comp });
  const posts = [post('REELS', 3000, 100, 1), post('REELS', 3200, 50, 2), post('REELS', 3100, 10, 3),
    post('FEED', 1000, 2, 4), post('FEED', 1100, 1, 5), post('FEED', 1200, 0, 6)];
  const s = sugestoesMeta(c, posts, dias, new Date('2026-10-20T12:00:00'));
  assert.deepEqual(s.map((x) => x.id), ['alcance', 'formato', 'repetir', 'frequencia', 'prazo']);
  assert.match(s[1].titulo, /^Reels rendem 2,8× mais$/);
  assert.equal(s[2].links[0].url, 'https://x/1');
});
