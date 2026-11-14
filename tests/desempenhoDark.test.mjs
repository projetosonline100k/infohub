import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/empresa/desempenhoDark.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } });
const d = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('números compactos em português', () => {
  assert.equal(d.compacto(0), '0'); assert.equal(d.compacto(987), '987'); assert.equal(d.compacto(1234), '1,2 mil'); assert.equal(d.compacto(12500), '13 mil');
  assert.equal(d.compacto(1_500_000), '1,5 mi'); assert.equal(d.compacto(null), '—');
});
test('seguidores: atual e variação desde o dia mais antigo dentro de 7 dias', () => {
  const dias = [{ dia: '2026-11-13', seguidores: 1050 }, { dia: '2026-11-10', seguidores: 1000 }, { dia: '2026-11-05', seguidores: 900 }, { dia: '2026-11-12', seguidores: null }];
  const r = d.seguidoresAtuais(dias, '2026-11-13');
  assert.equal(r.atual, 1050); assert.equal(r.variacao, 50); assert.equal(r.desde, '2026-11-10');
  assert.deepEqual(d.seguidoresAtuais([{ dia: '2026-11-13', seguidores: 10 }], '2026-11-13'), { atual: 10, variacao: null, desde: null });
  assert.equal(d.seguidoresAtuais([], '2026-11-13').atual, null);
});
test('resumo dos vídeos e leads distintos por post', () => {
  const posts = [{ ig_media_id: 'a', visualizacoes: 1000, curtidas: 50, comentarios: 5, salvamentos: 2, compartilhamentos: 1 }, { ig_media_id: 'b', visualizacoes: null, curtidas: 10, comentarios: 0, salvamentos: 0, compartilhamentos: 0 }];
  const leads = d.leadsPorPost([{ media_id: 'a', autor_id: 'x' }, { media_id: 'a', autor_id: 'x' }, { media_id: 'a', autor_id: 'y' }, { media_id: 'b', autor_id: null }, { media_id: null, autor_id: 'z' }]);
  assert.deepEqual(leads, { a: 2 });
  const r = d.resumirVideos(posts, leads);
  assert.equal(r.views, 1000); assert.equal(r.curtidas, 60); assert.equal(r.leads, 2); assert.equal(r.videos, 2);
});
