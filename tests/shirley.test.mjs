import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/whatsapp/shirley.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { alertasDoWhatsapp, pareceInsatisfeito, horarioDeCobrar, tempoEsperando, chegaramAgora, clienteDoGrupo, ehSoConfirmacao, humorDaShirley, falaDaShirley, ADIAR_MIN } =
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

test('lua só para o que acabou de chegar (20 min), de cliente, fora de grupo', () => {
  const r = chegaramAgora([
    conv({ id: 'a', ultima_em: antes(3) }),
    conv({ id: 'b', ultima_em: antes(25) }),
    conv({ id: 'c', ultima_em: antes(1), ultima_de_mim: true }),
    conv({ id: 'd', ultima_em: antes(1), eh_grupo: true }),
    conv({ id: 'e', ultima_em: antes(5), ultima_texto: 'quero reembolso' }),
  ], agora);
  assert.deepEqual(r.map((x) => [x.chatId, x.motivo]), [['a', 'esperando'], ['e', 'insatisfeito']]);
});

test('grupo de cliente da Core conta (com o nome do cliente); outros grupos não', () => {
  const r = alertasDoWhatsapp([
    conv({ id: 'g1', nome: 'Isabel · Core Audience 2.0', eh_grupo: true, ultima_em: antes(90) }),
    conv({ id: 'g2', nome: 'Família', eh_grupo: true, ultima_em: antes(90) }),
  ], agora);
  assert.deepEqual(r.map((x) => [x.chatId, x.nome]), [['g1', 'Isabel']]);
  assert.equal(clienteDoGrupo('Royal Defense | Core Audience'), 'Royal Defense');
  assert.equal(clienteDoGrupo('Dra Helia - core Experience '), 'Dra Helia');
});

test('"Agendado", "ok", "obrigado", 👍 não cobram resposta', () => {
  for (const t of ['Agendado', 'ok!', 'Obrigada Davi', '👍', 'valeu', 'tá bom']) assert.ok(ehSoConfirmacao(t), t);
  for (const t of ['ok, mas e a aula 3?', 'agendado para quando?', 'oi']) assert.ok(!ehSoConfirmacao(t), t);
  assert.equal(alertasDoWhatsapp([conv({ id: 'x', ultima_texto: 'Agendado', ultima_em: antes(300) })], agora).length, 0);
});

test('Shirley perde a paciência: adiar e esperar muito deixam ela brava; furiosa não deixa adiar', () => {
  assert.equal(humorDaShirley(0, 70, false), 0);
  assert.equal(humorDaShirley(1, 70, false), 1);
  assert.equal(humorDaShirley(0, 130, false), 1);
  assert.equal(humorDaShirley(0, 5 * 60, false), 2);
  assert.equal(humorDaShirley(2, 70, false), 2);
  assert.equal(humorDaShirley(5, 70, false), 3);
  assert.equal(humorDaShirley(0, 9 * 60, false), 3);
  assert.equal(humorDaShirley(0, 5, true), 2);
  assert.equal(ADIAR_MIN[3], 0);
  assert.ok(falaDaShirley(3, 'Carol', '9h', false).startsWith('🤬 DAVI'));
});
