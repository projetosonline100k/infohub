import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const js = ts.transpileModule(fs.readFileSync('src/lib/dashSemana.ts', 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText;
const d = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const t = (o) => ({ id: 'x', titulo: 'T', cliente_id: 'c', concluida: false, data_atividade: null, data_vencimento: null, concluida_em: null, ...o });

test('semana de segunda a domingo', () => {
  assert.equal(d.segundaDe(new Date(2026, 10, 17)), '2026-11-16');   // terça
  assert.equal(d.segundaDe(new Date(2026, 10, 22)), '2026-11-16');   // domingo
  assert.equal(d.segundaDe(new Date(2026, 10, 23)), '2026-11-23');   // segunda
  assert.equal(d.domingoDe('2026-11-16'), '2026-11-22');
  assert.equal(d.somarDias('2026-12-28', 7), '2027-01-04');
});
test('tarefas da semana: mesma regra do "Esta semana" do quadro de Atividades (data da atividade na semana)', () => {
  const r = d.tarefasDaSemana([
    t({ id: 'a', data_atividade: '2026-11-18' }), t({ id: 'b', data_atividade: '2026-11-10', data_vencimento: '2026-11-10' }), t({ id: 'c', data_atividade: '2026-11-25' }),
    t({ id: 'd', concluida: true, data_atividade: '2026-11-16', concluida_em: '2026-11-17T10:00:00Z' }), t({ id: 'e', concluida: true, data_atividade: '2026-09-12', concluida_em: '2026-11-17T10:00:00Z' }), t({ id: 'f' }),
    t({ id: 'g', data_atividade: '2026-11-22' }),
  ], '2026-11-16').map((x) => x.id);
  assert.deepEqual(r, ['a', 'd', 'g']);
});
test('progresso, ordem e filtros', () => {
  const ts = [t({ id: '1', concluida: true, data_vencimento: '2026-11-16' }), t({ id: '2', data_vencimento: '2026-11-17' }), t({ id: '3', data_vencimento: '2026-11-19' }), t({ id: '4', data_vencimento: '2026-11-15' })];
  assert.deepEqual(d.progresso(ts), { total: 4, feitas: 1, pct: 25 });
  assert.deepEqual(d.progresso([]), { total: 0, feitas: 0, pct: 0 });
  assert.deepEqual(d.ordenar(ts, '2026-11-17').map((x) => x.id), ['4', '2', '3', '1']);   // atrasada, hoje, próxima, concluída
  assert.deepEqual(d.ordenar([t({ id: 'a', data_vencimento: '2026-11-20' }), t({ id: 'b' }), t({ id: 'c', data_vencimento: '2026-11-17' }), t({ id: 'd', data_vencimento: '2026-11-10' }), t({ id: 'e', data_vencimento: '2026-11-09' }), t({ id: 'f', concluida: true, data_vencimento: '2026-11-01' })], '2026-11-17').map((x) => x.id), ['e', 'd', 'c', 'a', 'b', 'f']);
  assert.deepEqual(d.filtrar(ts, 'hoje', '2026-11-17').map((x) => x.id), ['2', '4']);   // vence hoje ou já passou
  assert.deepEqual(d.filtrar(ts, 'concluidas', '2026-11-17').map((x) => x.id), ['1']);
  assert.equal(d.filtrar(ts, 'pendentes', '2026-11-17').length, 3);
});
test('meta digitada', () => {
  assert.equal(d.lerMeta('10000'), 10000); assert.equal(d.lerMeta('R$ 10.000,50'), 10000.5); assert.equal(d.lerMeta('10k'), 10000);
  assert.equal(d.lerMeta(''), null); assert.equal(d.lerMeta('abc'), null);
  assert.equal(d.saudacao(9), 'Bom dia'); assert.equal(d.saudacao(15), 'Boa tarde'); assert.equal(d.saudacao(21), 'Boa noite');
});

test('mês da semana (o da quinta-feira)', () => {
  assert.deepEqual(d.mesDaSemana('2026-11-16'), { inicio: '2026-11-01', fim: '2026-11-30', rotulo: 'Novembro' });
  assert.deepEqual(d.mesDaSemana('2026-10-26'), { inicio: '2026-10-01', fim: '2026-10-31', rotulo: 'Outubro' });   // 26/10 a 1/11: quinta é 29/10
  assert.equal(d.mesDaSemana('2026-11-30').inicio, '2026-12-01');                                                  // 30/11 a 6/12: quinta é 3/12
  assert.equal(d.mesDaSemana('2028-02-21').fim, '2028-02-29');
});

test('quanto falta, meta do mês e série diária', () => {
  assert.deepEqual(d.faltaParaMeta(499.92, 5000), { falta: 4500.08, passou: 0 });
  assert.deepEqual(d.faltaParaMeta(6000, 5000), { falta: 0, passou: 1000 });
  assert.equal(d.faltaParaMeta(10, null), null); assert.equal(d.faltaParaMeta(10, 0), null);
  assert.equal(d.metaDoMes([3000, 2000], 9999), 5000); assert.equal(d.metaDoMes([], 9999), 9999); assert.equal(d.metaDoMes([0], null), null);
  const s = d.serieDiaria([{ dia: '2026-11-03', cliente_id: 'a', valor: 10 }, { dia: '2026-11-03', cliente_id: 'a', valor: 5 }, { dia: '2026-11-03', cliente_id: 'b', valor: 7 }, { dia: '2026-12-01', cliente_id: 'a', valor: 99 }, { dia: '2026-11-04', cliente_id: 'x', valor: 1 }], '2026-11-01', '2026-11-30', ['a', 'b']);
  assert.equal(s.length, 30); assert.deepEqual(s[2], { dia: '3', a: 15, b: 7 }); assert.deepEqual(s[3], { dia: '4', a: 0, b: 0 });
});

test('selo do prazo', () => {
  const h = '2026-11-17';
  assert.deepEqual(d.rotuloPrazo('2026-11-10', h), { txt: 'Atrasada', tom: 'atraso' });
  assert.deepEqual(d.rotuloPrazo('2026-11-17', h), { txt: 'Hoje', tom: 'hoje' });
  assert.deepEqual(d.rotuloPrazo('2026-11-18', h), { txt: 'Amanhã', tom: 'breve' });
  assert.deepEqual(d.rotuloPrazo('2026-11-19', h), { txt: 'Em 2 dias', tom: 'breve' });
  assert.deepEqual(d.rotuloPrazo('2026-11-23', h), { txt: 'Em 6 dias', tom: 'breve' });
  assert.deepEqual(d.rotuloPrazo('2026-11-24', h), { txt: '24/11', tom: 'longe' });
  assert.deepEqual(d.rotuloPrazo('2026-12-01', '2026-11-30'), { txt: 'Amanhã', tom: 'breve' });
  assert.equal(d.rotuloPrazo(null, h), null);
});
