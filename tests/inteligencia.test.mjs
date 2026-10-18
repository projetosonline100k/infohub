import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/conteudo/inteligencia.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const agora = Date.parse('2026-10-17T12:00:00Z');
const post = (dias, tipo, v, extra = {}) => ({ ig_media_id: `${tipo}${dias}${v}`, tipo, legenda: 'x', permalink: null,
  publicado_em: new Date(agora - dias * 864e5).toISOString(), visualizacoes: v, alcance: v / 2, curtidas: 10, comentarios: 1,
  salvamentos: 2, compartilhamentos: 1, video_vertical_id: null, carrossel_id: null, ...extra });

test('períodos, soma, variação e engajamento', () => {
  const posts = [post(1, 'REELS', 1000), post(5, 'FEED', 500), post(40, 'REELS', 750)];
  const { atual, anterior } = m.separarPeriodos(posts, 30, agora);
  assert.equal(atual.length, 2); assert.equal(anterior.length, 1);
  assert.equal(m.somar(atual, 'visualizacoes'), 1500);
  assert.equal(m.variacao(1500, 750), 100);
  assert.equal(m.variacao(10, 0), null);
  assert.equal(Math.round(m.engajamento(atual) * 10) / 10, Math.round((28 / 750) * 1000) / 10);
});

test('formato, série diária, seguidores e fila', () => {
  const f = m.porFormato([post(1, 'REELS', 900), post(2, 'FEED', 100), post(3, 'FEED', 200)]);
  assert.equal(f.pctReels, 75); assert.equal(f.carrosseis.media, 150);
  const s = m.serieDiaria([post(0, 'REELS', 300)], 7, 'visualizacoes', agora);
  assert.equal(s.length, 7); assert.equal(s[6].atual, 300);
  const seg = m.seguidoresNoPeriodo([{ dia: '2026-10-14', seguidores: 100 }, { dia: '2026-10-17', seguidores: 130 }], 30, agora);
  assert.equal(seg.ganho, 30);
  const fila = m.filaProgramada([{ tipo: 'reel', quando: '2026-10-18T21:00:00Z' }, { tipo: 'reel', quando: '2026-10-19T21:00:00Z' }, { tipo: 'carrossel', quando: '2026-10-10T13:00:00Z' }], agora);
  assert.equal(fila.reels, 2); assert.equal(fila.carrosseis, 0);
  assert.ok(m.resumoRapido({ visualizacoes: 1, varVisualizacoes: 12, formato: f, ganhoSeguidores: 30, melhor: null, fila }).some((x) => x.includes('subiram 12%')));
});
