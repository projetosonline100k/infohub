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

const { topPosts, numeroCurto, tituloDoPost } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const post = (id, dia, visualizacoes, salvamentos = 0) => ({
  ig_media_id: id, tipo: 'REELS', legenda: `\nLinha de ${id}\nresto`, permalink: null, publicado_em: `${dia}T12:00:00Z`,
  visualizacoes, alcance: null, curtidas: null, comentarios: null, salvamentos, compartilhamentos: null,
  video_vertical_id: null, carrossel_id: null,
});

test('top posts: só o período, sem número fora, do mais visto pro menos', () => {
  const agora = Date.parse('2026-10-16T12:00:00Z');
  const lista = [post('a', '2026-10-10', 100), post('b', '2026-10-12', 900), post('velho', '2026-08-01', 5000),
    post('sem', '2026-10-13', null), post('c', '2026-10-14', 100, 7)];
  assert.deepEqual(topPosts(lista, 30, 5, agora).map((p) => p.ig_media_id), ['b', 'c', 'a']);
  assert.deepEqual(topPosts(lista, 30, 1, agora).map((p) => p.ig_media_id), ['b']);
});

test('número curto e título do post', () => {
  assert.equal(numeroCurto(null), '–');
  assert.equal(numeroCurto(950), '950');
  assert.equal(numeroCurto(3537), '3,5 mil');
  assert.equal(numeroCurto(2_500_000), '2,5 mi');
  assert.equal(tituloDoPost(post('x', '2026-10-10', 1)), 'Linha de x');
});
