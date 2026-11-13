import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/empresa/roteirosDark.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const r = (numero, dia, status = 'na_fila') => ({ id: `id${numero}-aaaa`, perfil_id: 'p', numero, titulo: `V${numero}`, texto: 't', data_postagem: dia, status, arquivo: null, obs: null, criado_em: '2026-11-01T00:00:00Z' });

test('somarDias atravessa mês e ano', () => {
  assert.equal(m.somarDias('2026-11-30', 1), '2026-12-01');
  assert.equal(m.somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(m.somarDias('2026-03-01', -1), '2026-02-28');
});

test('semanasDoMes: semanas de segunda a domingo, com os dias vizinhos nas pontas', () => {
  const g = m.semanasDoMes(2026, 11);   // 1/11/2026 é domingo
  assert.equal(g.length, 6);
  assert.equal(g[0][0].dia, '2026-10-26');
  assert.equal(g[0][6].dia, '2026-11-01');
  assert.equal(g[0][6].doMes, true);
  assert.equal(g[0][0].doMes, false);
  assert.equal(g[5][0].dia, '2026-11-30');
  assert.equal(g[5][1].doMes, false);   // 1/12 já é do mês seguinte
  assert.ok(g.every((s) => s.length === 7));
  assert.equal(m.semanasDoMes(2026, 2).length, 5);   // 1/2/2026 é domingo: pega 5 semanas
  assert.equal(m.semanasDoMes(2027, 2).length, 4);   // 1/2/2027 é segunda e o mês tem 28 dias: 4 semanas exatas
});

test('proximoDiaLivre: dia seguinte ao último marcado no futuro; sem nenhum, amanhã', () => {
  assert.equal(m.proximoDiaLivre([], '2026-11-13'), '2026-11-14');
  assert.equal(m.proximoDiaLivre([{ data_postagem: '2026-11-20' }, { data_postagem: '2026-11-18' }, { data_postagem: '2026-11-01' }, { data_postagem: null }], '2026-11-13'), '2026-11-21');
  assert.equal(m.proximoDiaLivre([{ data_postagem: '2026-11-01' }], '2026-11-13'), '2026-11-14');   // só passado: amanhã
});

test('agruparPorDia ordena pelo número e ignora roteiro sem dia; contarPorStatus soma', () => {
  const g = m.agruparPorDia([r(3, '2026-11-20'), r(1, '2026-11-20'), r(2, null)]);
  assert.deepEqual(g.get('2026-11-20').map((x) => x.numero), [1, 3]);
  assert.equal(g.size, 1);
  const c = m.contarPorStatus([r(1, null, 'editando'), r(2, null, 'editando'), r(3, null, 'programado')]);
  assert.deepEqual([c.editando, c.programado, c.na_fila], [2, 1, 0]);
});

test('mensagem para o Lauro: voz no ElevenLabs, vídeo, revisar (não programa) e só programa depois do APROVADO', () => {
  const t = m.mensagemParaLauro(r(7, '2026-11-20'), 'Insta insights oficial');
  assert.ok(t.includes('V7') && t.includes('20/11/2026'));
  assert.ok(t.includes('roteiros.py contexto id7-aaaa'));
  assert.ok(t.includes('elevenlabs.io') && t.includes('Gregory Grumble'));
  assert.ok(t.includes('status id7-aaaa revisar --arquivo'));
  assert.ok(t.includes('NÃO agende nem poste pelo Chrome'));
  assert.ok(/Nada é publicado sem o meu Aprovar/.test(t));
});

test('mensagem de ajuste cita o id curto e pede nova versão', () => {
  const a = m.mensagemAjuste(r(7, '2026-11-20'), 'a legenda está atrasada');
  assert.ok(a.startsWith('AJUSTE no roteiro V7') && a.includes('a legenda está atrasada') && a.includes('NOVA versão') && a.includes('revisar --arquivo'));
});

test('versoesDoRoteiro: histórico quando há; senão o arquivo atual; senão nada', () => {
  assert.deepEqual(m.versoesDoRoteiro({ arquivo: 'b.mp4', versoes: [{ arquivo: 'a.mp4' }, { arquivo: 'b.mp4' }] }).map((v) => v.arquivo), ['a.mp4', 'b.mp4']);
  assert.deepEqual(m.versoesDoRoteiro({ arquivo: 'x.mp4', versoes: [] }).map((v) => v.arquivo), ['x.mp4']);
  assert.deepEqual(m.versoesDoRoteiro({ arquivo: null, versoes: null }), []);
  assert.equal(m.ROTULO_STATUS.revisar, 'Aprovar');
});
