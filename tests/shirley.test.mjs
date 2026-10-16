import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/whatsapp/shirley.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { alertasDoWhatsapp, pareceInsatisfeito, horarioDeCobrar, tempoEsperando } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const agora = new Date(2026, 9, 16, 15, 0);
const antes = (min) => new Date(agora.getTime() - min * 60_000).toISOString();
const conv = (o) => ({ chat_id: o.id, chat_nome: o.nome ?? o.id, eh_grupo: false, ultima_de_mim: false, ultima_autor: null, ultima_texto: 'oi', ultima_em: antes(10), ...o });

test('insatisfeito: reembolso, cancelar, sem acesso, ninguém responde', () => {
  for (const t of ['quero o reembolso', 'Vou cancelar', 'não consigo acessar a aula', 'ninguém me respondeu ainda', 'tô esperando faz tempo'])
    assert.ok(pareceInsatisfeito(t), t);
  for (const t of ['amei a aula!', 'obrigado davi', 'consegui acessar sim']) assert.ok(!pareceInsatisfeito(t), t);
});

test('alerta: insatisfeito na hora; esperando só depois de 60 min; ignora grupo, minhas e antigas', () => {
  const r = alertasDoWhatsapp([
    conv({ id: 'a', ultima_texto: 'quero cancelar', ultima_em: antes(2) }),
    conv({ id: 'b', ultima_texto: 'oi davi, uma dúvida', ultima_em: antes(130) }),
    conv({ id: 'c', ultima_texto: 'oi', ultima_em: antes(20) }),
    conv({ id: 'd', ultima_texto: 'cancelar', eh_grupo: true }),
    conv({ id: 'e', ultima_texto: 'reembolso', ultima_de_mim: true }),
    conv({ id: 'f', ultima_texto: 'oi', ultima_em: antes(5 * 24 * 60) }),
  ], agora);
  assert.deepEqual(r.map((x) => [x.chatId, x.motivo]), [['a', 'insatisfeito'], ['b', 'esperando']]);
});

test('horário e tempo', () => {
  assert.ok(horarioDeCobrar(agora));
  assert.ok(!horarioDeCobrar(new Date(2026, 9, 16, 23, 0)));
  assert.equal(tempoEsperando(45), '45 min');
  assert.equal(tempoEsperando(130), '2h10');
  assert.equal(tempoEsperando(60 * 30), '1 dia(s)');
});
