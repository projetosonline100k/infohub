import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const carregar = async (arq) => {
  const src = fs.readFileSync(arq, 'utf8').replace('from "./dashDark"', 'from "' + 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(fs.readFileSync('src/lib/empresa/dashDark.ts', 'utf8'), { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText).toString('base64') + '"');
  const js = ts.transpileModule(src, { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
};
const d = await carregar('src/lib/empresa/dashDanilo.ts');
const ed = (id, status, formato, extra = {}) => ({ id, titulo: id, status, formato, cliente_id: 'c', criado_em: '2026-11-01T10:00:00Z', atualizado_em: '2026-11-02T10:00:00Z', video_status: null, data_postagem: null, ...extra });

test('esteira do Danilo: etapas por status e linhas por formato', () => {
  const r = d.resumirDanilo([ed('a', 'na_fila', 'classico'), ed('b', 'revisar', 'classico'), ed('c', 'aprovado', 'papel', { video_status: 'postado' }), ed('d', 'aprovado', null, { data_postagem: '2026-12-01' }), ed('e', 'cancelado', null)], '2026-11-16');
  assert.equal(r.geral.fila, 1); assert.equal(r.geral.revisao, 1); assert.equal(r.geral.postado, 1); assert.equal(r.geral.programado, 1); assert.equal(r.geral.total, 4);
  assert.deepEqual(r.linhas.map((l) => l.id).sort(), ['classico', 'outro', 'papel']);
  assert.equal(r.linhas.find((l) => l.id === 'classico').videos[0].etapa, 'fila');   // na ordem da esteira
});
test('atividade e tempo médio', () => {
  const l = [ed('a', 'aprovado', 'classico', { criado_em: '2026-11-10T00:00:00Z', atualizado_em: '2026-11-10T04:00:00Z' }), ed('b', 'aprovado', 'classico', { criado_em: '2026-11-11T00:00:00Z', atualizado_em: '2026-11-11T08:00:00Z' })];
  assert.equal(d.horasMediaDeEdicao(l, new Date('2026-11-16T00:00:00Z')), 6);
  assert.equal(d.atividadeDanilo(l, '2026-11-16', 1)[0].id, 'b');
});
