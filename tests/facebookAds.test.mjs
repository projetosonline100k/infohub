import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const js = ts.transpileModule(fs.readFileSync('supabase/functions/_shared/facebookAds.ts', 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText;
const f = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('resultado depende do objetivo', () => {
  const linha = { actions: [{ action_type: 'link_click', value: '40' }, { action_type: 'landing_page_view', value: '25' }, { action_type: 'purchase', value: '3' }], action_values: [{ action_type: 'purchase', value: '297.5' }], reach: '900' };
  assert.deepEqual(f.resultadoDaLinha(linha, 'OUTCOME_TRAFFIC'), { resultados: 25, tipo: 'visitas à página', valor: 297.5 });
  assert.equal(f.resultadoDaLinha(linha, 'OUTCOME_SALES').resultados, 3);
  assert.equal(f.resultadoDaLinha(linha, 'OUTCOME_AWARENESS').resultados, 900);
  assert.equal(f.resultadoDaLinha({}, 'OUTCOME_LEADS').resultados, 0);
});
test('centavos e teto de verba', () => {
  assert.equal(f.centavos(12.34), 1234); assert.equal(f.reais('5000'), 50);
  const camps = [{ nivel: 'campanha', ref: 'c1', campanha_ref: 'c1', status: 'ACTIVE', orcamento_diario: null }, { nivel: 'campanha', ref: 'c2', campanha_ref: 'c2', status: 'PAUSED', orcamento_diario: 100 }];
  const conjs = [{ nivel: 'conjunto', ref: 'j1', campanha_ref: 'c1', status: 'ACTIVE', orcamento_diario: 30 }, { nivel: 'conjunto', ref: 'j2', campanha_ref: 'c1', status: 'PAUSED', orcamento_diario: 20 }];
  assert.equal(f.verbaAtiva(camps, conjs), 30);                                              // ABO: só o conjunto ligado
  assert.equal(f.verbaAtiva(camps, conjs, { nivel: 'campanha', ref: 'c2' }), 130);           // ligar a c2 (verba de campanha)
  assert.equal(f.podeLigar(null, 10).ok, false);
  assert.equal(f.podeLigar(100, 130).ok, false); assert.equal(f.podeLigar(200, 130).ok, true);
});
test('criação nasce pausada e valida o que falta', () => {
  assert.ok(f.payloadCampanha({ nome: 'x' }).erro);
  const c = f.payloadCampanha({ nome: 'Camp', preset: 'trafego' }).corpo; assert.equal(c.status, 'PAUSED'); assert.equal(c.objective, 'OUTCOME_TRAFFIC');
  assert.ok(f.payloadConjunto({ nome: 'j', campanha_ref: '1', preset: 'vendas', orcamento_diario: 50 }).erro);              // sem pixel
  assert.ok(f.payloadConjunto({ nome: 'j', campanha_ref: '1', preset: 'trafego', orcamento_diario: 2 }).erro);               // verba mínima
  const j = f.payloadConjunto({ nome: 'j', campanha_ref: '1', preset: 'vendas', orcamento_diario: 50, pixel_id: 'p1' }).corpo;
  assert.equal(j.daily_budget, '5000'); assert.equal(j.status, 'PAUSED'); assert.equal(JSON.parse(j.promoted_object).custom_event_type, 'PURCHASE');
  assert.equal(JSON.parse(j.targeting).geo_locations.countries[0], 'BR');
  assert.ok(f.payloadCriativo({ pagina_id: 'p', link: 'x' }).erro);
  const cr = f.payloadCriativo({ pagina_id: 'p', link: 'https://a.com', imagem_hash: 'h', texto: 'oi', cta: 'XX' }).corpo;
  assert.equal(JSON.parse(cr.object_story_spec).link_data.call_to_action.type, 'LEARN_MORE');
  assert.ok(f.payloadCriativo({ pagina_id: 'p', link: 'https://a.com', video_id: 'v' }).erro);                               // vídeo sem miniatura
  const a = f.payloadAnuncio({ nome: 'a', conjunto_ref: 'j', criativo_id: 'c' }).corpo; assert.equal(a.status, 'PAUSED');
});
