import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const js = ts.transpileModule(fs.readFileSync('src/lib/dashSemana.ts', 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText;
const d = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const t = (o) => ({ id: 'x', titulo: 'T', cliente_id: 'c', concluida: false, data_vencimento: null, concluida_em: null, ...o });

test('semana de segunda a domingo', () => {
  assert.equal(d.segundaDe(new Date(2026, 10, 17)), '2026-11-16');   // terça
  assert.equal(d.segundaDe(new Date(2026, 10, 22)), '2026-11-16');   // domingo
  assert.equal(d.segundaDe(new Date(2026, 10, 23)), '2026-11-23');   // segunda
  assert.equal(d.domingoDe('2026-11-16'), '2026-11-22');
  assert.equal(d.somarDias('2026-12-28', 7), '2027-01-04');
});
test('tarefas da semana: vencem nela, atrasadas abertas ou concluídas nela', () => {
  const r = d.tarefasDaSemana([
    t({ id: 'a', data_vencimento: '2026-11-18' }), t({ id: 'b', data_vencimento: '2026-11-10' }), t({ id: 'c', data_vencimento: '2026-11-25' }),
    t({ id: 'd', concluida: true, concluida_em: '2026-11-17T10:00:00Z', data_vencimento: '2026-11-10' }), t({ id: 'e', concluida: true, concluida_em: '2026-11-05T10:00:00Z', data_vencimento: '2026-11-05' }), t({ id: 'f' }),
  ], '2026-11-16').map((x) => x.id);
  assert.deepEqual(r, ['a', 'b', 'd']);
});
test('progresso, ordem e filtros', () => {
  const ts = [t({ id: '1', concluida: true, data_vencimento: '2026-11-16' }), t({ id: '2', data_vencimento: '2026-11-17' }), t({ id: '3', data_vencimento: '2026-11-19' }), t({ id: '4', data_vencimento: '2026-11-15' })];
  assert.deepEqual(d.progresso(ts), { total: 4, feitas: 1, pct: 25 });
  assert.deepEqual(d.progresso([]), { total: 0, feitas: 0, pct: 0 });
  assert.deepEqual(d.ordenar(ts).map((x) => x.id), ['4', '2', '3', '1']);
  assert.deepEqual(d.filtrar(ts, 'hoje', '2026-11-17').map((x) => x.id), ['2', '4']);   // vence hoje ou já passou
  assert.deepEqual(d.filtrar(ts, 'concluidas', '2026-11-17').map((x) => x.id), ['1']);
  assert.equal(d.filtrar(ts, 'pendentes', '2026-11-17').length, 3);
});
test('meta digitada', () => {
  assert.equal(d.lerMeta('10000'), 10000); assert.equal(d.lerMeta('R$ 10.000,50'), 10000.5); assert.equal(d.lerMeta('10k'), 10000);
  assert.equal(d.lerMeta(''), null); assert.equal(d.lerMeta('abc'), null);
  assert.equal(d.saudacao(9), 'Bom dia'); assert.equal(d.saudacao(15), 'Boa tarde'); assert.equal(d.saudacao(21), 'Boa noite');
});
