import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/quiz/jornada.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } });
const j = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const passos = [{ rotulo: 'Abertura', tipo: 'intro' }, { rotulo: 'Gênero', tipo: 'pergunta' }, { rotulo: 'Idade', tipo: 'pergunta' }, { rotulo: 'Respiro', tipo: 'tela' }, { rotulo: 'Contato', tipo: 'captura' }, { rotulo: 'Resultado', tipo: 'fim' }];
const ev = (tipo, passo, t) => ({ sessao: 's1', tipo, passo, criado_em: `2026-11-13T22:00:${String(t).padStart(2, '0')}Z` });
const lead = { sessao: 's1', criada_em: '2026-11-13T22:00:30Z', respostas: [{ pergunta: 'Gênero?', resposta: 'Mulher' }, { pergunta: 'Idade?', resposta: '18-24' }] };

test('jornada completa: tempo em cada tela, respostas nas perguntas e onde parou', () => {
  const eventos = [ev('visita', -1, 0), ev('passo', 1, 1), ev('passo', 2, 4), ev('passo', 3, 14), ev('passo', 4, 20), ev('fim', -1, 25), ev('passo', 5, 26), ev('cta', -1, 40), ev('passo', 1, 50), { ...ev('passo', 1, 5), sessao: 'outra' }];
  const r = j.jornadaDoLead(lead, eventos, passos);
  assert.equal(r.temEventos, true); assert.equal(r.ultimoPasso, 5); assert.equal(r.terminou, true); assert.equal(r.clicouOferta, true);
  assert.equal(r.passos[1].segundos, 3); assert.equal(r.passos[1].resposta, 'Mulher'); assert.equal(r.passos[2].resposta, '18-24'); assert.equal(r.passos[2].segundos, 10);
  assert.equal(r.maisLenta, 2); assert.equal(r.duracaoSeg, 50);   // a volta ao passo 1 (50s) conta no fim da sessão, não muda quando abriu
  assert.equal(r.passos[1].em, '2026-11-13T22:00:01Z');           // vale a primeira vez
});

test('parou no meio: telas seguintes não alcançadas e sem oferta', () => {
  const r = j.jornadaDoLead(lead, [ev('visita', -1, 0), ev('passo', 1, 1), ev('passo', 2, 5)], passos);
  assert.equal(r.ultimoPasso, 2); assert.equal(r.terminou, false); assert.equal(r.clicouOferta, false);
  assert.deepEqual(r.passos.map((p) => p.alcancou), [true, true, true, false, false, false]);
  assert.equal(r.passos[2].segundos, null);   // não saiu dessa tela
});

test('lead antigo sem eventos: usa só as respostas guardadas', () => {
  const r = j.jornadaDoLead({ ...lead, sessao: null }, [], passos);
  assert.equal(r.temEventos, false); assert.equal(r.ultimoPasso, 2); assert.equal(r.terminou, true);
  assert.equal(r.passos[1].resposta, 'Mulher'); assert.equal(r.passos[1].segundos, null);
});

test('duração em texto curto', () => {
  assert.equal(j.duracaoCurta(45), '45s'); assert.equal(j.duracaoCurta(125), '2min 5s'); assert.equal(j.duracaoCurta(120), '2min'); assert.equal(j.duracaoCurta(null), '—');
});
