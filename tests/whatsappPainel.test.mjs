import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/whatsapp/painel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { minutosUteis, formatarMinutos, calcularMetricas, htmlSeguro, textoParaCopiar, cardRespondido, progressoCard, minutosRestantes, marcarCard, marcarItem } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('horas úteis pulam noite e fim de semana', () => {
  // sexta 18h → segunda 10h = 1h (sexta) + 1h (segunda)
  assert.equal(minutosUteis(new Date('2026-10-02T18:00'), new Date('2026-10-05T10:00'), [9, 19]), 120);
  assert.equal(minutosUteis(new Date('2026-10-06T10:00'), new Date('2026-10-06T10:30'), [9, 19]), 30);
});

test('formata minutos', () => {
  assert.equal(formatarMinutos(45), '45 min');
  assert.equal(formatarMinutos(125), '2h05');
  assert.equal(formatarMinutos(120), '2h');
  assert.equal(formatarMinutos(null), '—');
});

test('métricas: espera por card, promessas atrasadas e risco', () => {
  const h = {
    config: { meta_resposta_horas_uteis: 4, horario_util: [9, 19], silencio_alerta_dias: 5, silencio_critico_dias: 14 },
    mentorados: [
      { id: 'a', card: 'a1', nome: 'A', grupo: '', disc: 'I', ultima_msg_mentorado: '2026-10-06T10:00', interacoes: [
        { recebida: '2026-10-06T10:00', respondida: '2026-10-06T11:00' }, { recebida: '2026-10-07T09:00', respondida: null }],
        satisfacao: [{ data: '2026-10-06', nivel: 3, evidencia: '' }], upgrade: { nivel: 'alto', sinais: [] } },
      { id: 'b', card: null, nome: 'B', grupo: '', disc: 'S', ultima_msg_mentorado: '2026-09-20T10:00', interacoes: [],
        satisfacao: [{ data: '2026-09-20', nivel: 1, evidencia: '' }], upgrade: { nivel: 'baixo', sinais: [] } },
    ],
    avaliacoes: [{ mentorado: 'a', data: '2026-10-06', resumo: '', acolheu: true, solucao: false, proximos: true, junto: true, disc_ok: true, reacao: 'positiva' }],
    promessas: [{ mentorado: 'a', o_que: 'x', desde: '2026-10-01', prazo: '2026-10-05', status: 'aberta' }, { mentorado: 'a', o_que: 'y', desde: '2026-10-01', prazo: null, status: 'feita' }],
    agenda: [],
  };
  const m = calcularMetricas(h, new Date('2026-10-07T11:00'));
  assert.equal(m.esperaPorCard.a1, 120);
  assert.equal(m.respondidas[0].min, 60);
  assert.equal(m.promessas.length, 1);
  assert.equal(m.atrasadas.length, 1);
  assert.equal(m.saude[0].mentorado.id, 'b');
  assert.equal(m.pct('solucao'), 0);
  assert.equal(m.pct('acolheu'), 100);
});

test('HTML dos cards: mantém negrito, escapa o resto', () => {
  assert.equal(htmlSeguro('<b>oi</b> <script>x</script>'), '<b>oi</b> &lt;script&gt;x&lt;/script&gt;');
  assert.equal(htmlSeguro('<b onclick="x">a</b>'), '&lt;b onclick=&quot;x&quot;&gt;a</b>');
  assert.equal(textoParaCopiar('Oi <b>Cris</b>!<br>Tudo &amp; mais'), 'Oi Cris!\nTudo & mais');
});

test('checklist: card respondido quando todos os itens obrigatórios estão marcados', () => {
  const card = { id: 'bel7', tempo: 12, itens: [
    { id: 'bel7:1', titulo: 'a', texto: '', tempo: 3 },
    { id: 'bel7:2', titulo: 'b', texto: '', tempo: 5 },
    { id: 'bel7:3', titulo: 'c', texto: '', tempo: 4, opcional: true },
  ] };
  let r = {};
  assert.equal(cardRespondido(card, r), false);
  assert.equal(minutosRestantes(card, r), 8);
  r = marcarItem(card, 'bel7:1', true, r);
  assert.deepEqual(progressoCard(card, r), { feitos: 1, total: 2 });
  assert.equal(minutosRestantes(card, r), 5);
  r = marcarItem(card, 'bel7:2', true, r);
  assert.equal(cardRespondido(card, r), true);
  assert.equal(minutosRestantes(card, r), 0);
  r = marcarItem(card, 'bel7:2', false, r);
  assert.equal(cardRespondido(card, r), false);
});

test('checklist: marcar o card inteiro marca todos os itens', () => {
  const card = { id: 'x1', tempo: 5, itens: [{ id: 'x1:1', titulo: '', texto: '', tempo: 5 }] };
  const r = marcarCard(card, true, {});
  assert.equal(r['x1:1'], true);
  assert.equal(cardRespondido(card, r), true);
  assert.equal(cardRespondido(card, marcarCard(card, false, r)), false);
  // card sem itens continua como antes
  assert.equal(minutosRestantes({ id: 'y', tempo: 7 }, {}), 7);
  assert.equal(cardRespondido({ id: 'y', tempo: 7 }, { y: true }), true);
});
