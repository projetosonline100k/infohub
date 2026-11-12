import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/saudePc.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const base = { cpu_pct: 20, mem_livre_pct: 50, mem_total_gb: 16, swap_usado_gb: 0, swap_total_gb: 0, disco_livre_gb: 200, disco_livre_pct: 40, bateria_pct: 80, carregando: false, limite_termico: null, top_memoria: [], top_cpu: [] };

test('tudo certo: nível ok e nenhum aviso', () => {
  assert.deepEqual(m.avaliarSaude(base), { nivel: 'ok', avisos: [] });
});
test('pouca memória: atenção e crítico, com quem mais pesa', () => {
  const a = m.avaliarSaude({ ...base, mem_livre_pct: 15, top_memoria: [{ nome: 'Google Chrome', valor: 2.34 }, { nome: 'Claude', valor: 1.2 }] });
  assert.equal(a.nivel, 'atencao');
  assert.match(a.avisos[0].titulo, /15% livre/);
  assert.match(a.avisos[0].dica, /Google Chrome \(2,3 GB\) e Claude \(1,2 GB\)/);
  assert.equal(m.avaliarSaude({ ...base, mem_livre_pct: 6 }).nivel, 'critico');
});
test('swap alto em relação à memória do Mac', () => {
  const a = m.avaliarSaude({ ...base, mem_total_gb: 8, swap_usado_gb: 6.2 });
  assert.equal(a.avisos[0].tipo, 'swap'); assert.equal(a.nivel, 'atencao');
  assert.equal(m.avaliarSaude({ ...base, mem_total_gb: 8, swap_usado_gb: 9 }).nivel, 'critico');
  assert.equal(m.avaliarSaude({ ...base, mem_total_gb: 16, swap_usado_gb: 3 }).nivel, 'ok');
});
test('cpu, disco, bateria e térmico', () => {
  assert.equal(m.avaliarSaude({ ...base, cpu_pct: 80 }).nivel, 'atencao');
  assert.equal(m.avaliarSaude({ ...base, cpu_pct: 95, top_cpu: [{ nome: 'ffmpeg', valor: 310 }] }).avisos[0].dica, 'Quem mais usa: ffmpeg (310%).');
  assert.equal(m.avaliarSaude({ ...base, disco_livre_gb: 6, disco_livre_pct: 2.5 }).nivel, 'critico');
  assert.equal(m.avaliarSaude({ ...base, disco_livre_gb: 15, disco_livre_pct: 6 }).nivel, 'atencao');
  assert.equal(m.avaliarSaude({ ...base, bateria_pct: 16 }).nivel, 'atencao');
  assert.equal(m.avaliarSaude({ ...base, bateria_pct: 16, carregando: true }).nivel, 'ok');   // carregando não preocupa
  assert.equal(m.avaliarSaude({ ...base, bateria_pct: 8 }).nivel, 'critico');
  assert.equal(m.avaliarSaude({ ...base, limite_termico: 70 }).nivel, 'atencao');
});
test('avisos vêm do mais grave para o menos grave', () => {
  const a = m.avaliarSaude({ ...base, mem_livre_pct: 15, disco_livre_gb: 5, disco_livre_pct: 2 });
  assert.deepEqual(a.avisos.map((x) => x.tipo), ['disco', 'memoria']);
  assert.equal(a.nivel, 'critico');
});
test('suavizar: subir/descer só depois de duas leituras seguidas', () => {
  assert.deepEqual(m.suavizarNivel('ok', 'critico', null), { mostrar: 'ok', pendente: 'critico' });
  assert.deepEqual(m.suavizarNivel('ok', 'critico', 'critico'), { mostrar: 'critico', pendente: null });
  assert.deepEqual(m.suavizarNivel('ok', 'critico', 'atencao'), { mostrar: 'ok', pendente: 'critico' });   // leitura diferente da pendente: recomeça
  assert.deepEqual(m.suavizarNivel('critico', 'critico', 'ok'), { mostrar: 'critico', pendente: null });
  assert.deepEqual(m.suavizarNivel('critico', 'ok', null), { mostrar: 'critico', pendente: 'ok' });
});
