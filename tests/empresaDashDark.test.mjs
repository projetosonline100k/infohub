import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/empresa/dashDark.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { etapaDark, resumirDark, prontosParados } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const ed = (status, perfil = 'A', video_status = null, criado_em = '2026-11-01T00:00:00Z') =>
  ({ id: Math.random().toString(), titulo: 't', status, cliente_id: perfil, perfil, criado_em, video_status });

test('etapaDark classifica por status', () => {
  assert.equal(etapaDark(ed('na_fila')), 'fila');
  assert.equal(etapaDark(ed('renderizando')), 'producao');
  assert.equal(etapaDark(ed('revisar')), 'revisar');
  assert.equal(etapaDark(ed('aprovado')), 'pronto');
  assert.equal(etapaDark(ed('aprovado', 'A', 'postado')), 'postado');
  assert.equal(etapaDark(ed('cancelado')), 'cancelado');
});

test('resumirDark soma geral e por perfil, ignorando cancelados', () => {
  const r = resumirDark([ed('aprovado', 'A'), ed('aprovado', 'A'), ed('na_fila', 'B'), ed('cancelado', 'B')]);
  assert.equal(r.geral.total, 3);
  assert.equal(r.geral.pronto, 2);
  assert.equal(r.geral.fila, 1);
  assert.deepEqual(r.porPerfil.map((p) => [p.perfil, p.total]), [['A', 2], ['B', 1]]);
});

test('prontosParados conta aprovados antigos', () => {
  const agora = new Date('2026-11-12T00:00:00Z');
  assert.equal(prontosParados([ed('aprovado'), ed('aprovado', 'A', null, '2026-11-11T00:00:00Z'), ed('na_fila')], agora), 1);
});
