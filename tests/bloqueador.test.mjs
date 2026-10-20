import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/bloqueador/regras.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { sessaoAtiva, vencidas, precisaMotivo, limparSite, textoAte } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const agora = new Date('2026-10-20T15:00:00');
const s = (o) => ({ id: 'x', origem: 'manual', atividade_id: null, inicio: '2026-10-20T14:00:00', fim_previsto: null, encerrado_em: null, motivo_saida: null, bloqueios: 0, ...o });

test('manual vale até o fim previsto; depois vence sem pedir motivo', () => {
  const dentro = s({ fim_previsto: '2026-10-20T15:30:00' });
  const passou = s({ id: 'y', fim_previsto: '2026-10-20T14:50:00' });
  assert.equal(sessaoAtiva([passou, dentro], agora).id, 'x');
  assert.deepEqual(vencidas([passou, dentro], agora).map((v) => v.id), ['y']);
  assert.equal(precisaMotivo(dentro, agora), true);
  assert.equal(textoAte(dentro), 'até 15:30');
});

test('foco (sem prazo) fica ligado e não pede motivo ao parar o cronômetro', () => {
  const foco = s({ origem: 'foco' });
  assert.equal(sessaoAtiva([foco], agora).id, 'x');
  assert.equal(precisaMotivo(foco, agora), false);
  assert.equal(sessaoAtiva([s({ encerrado_em: '2026-10-20T14:30:00' })], agora), null);
});

test('site digitado de qualquer jeito vira o domínio', () => {
  assert.equal(limparSite(' https://www.Instagram.com/reels/abc '), 'instagram.com');
  assert.equal(limparSite('youtube.com?x=1'), 'youtube.com');
});
