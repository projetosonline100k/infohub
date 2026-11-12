import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/quiz/painel.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } });
const m = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const AGORA = Date.parse('2026-11-11T12:00:00Z');
const dia = (d, h = 10) => new Date(AGORA - d * 86_400_000 + (h - 12) * 3_600_000).toISOString();
const passos = [{ rotulo: 'Abertura', tipo: 'intro' }, { rotulo: 'Tela de respiro', tipo: 'tela' }, { rotulo: 'P1. Gênero', tipo: 'pergunta' }, { rotulo: 'Resultado', tipo: 'fim' }];
const ev = (s, tipo, passo, d) => ({ sessao: s, tipo, passo, criado_em: dia(d) });

test('funil, janelas e tendência contra o período anterior', () => {
  const eventos = [
    // período atual (últimos 14 dias): 4 visitas; 3 chegam à tela 1; 2 à pergunta; 1 termina
    ...['a', 'b', 'c', 'd'].map((s) => ev(s, 'visita', 0, 3)),
    ...['a', 'b', 'c'].map((s) => ev(s, 'passo', 1, 3)),
    ...['a', 'b'].map((s) => ev(s, 'passo', 2, 2)),
    ev('a', 'passo', 3, 2), ev('a', 'fim', 3, 2), ev('a', 'cta', 3, 2),
    // período anterior: 2 visitas
    ev('x', 'visita', 0, 20), ev('y', 'visita', 0, 20),
  ];
  const leads = [{ id: '1', criada_em: dia(2), respostas: [], status: 'novo' }, { id: '2', criada_em: dia(20), respostas: [], status: 'novo' }];
  const p = m.calcularPainel({ passos, eventos, leads, dias: 14, agora: AGORA });
  assert.deepEqual(p.atual, { visitas: 4, comecaram: 3, terminaram: 1, cta: 1, leads: 1 });
  assert.equal(p.anterior.visitas, 2);
  assert.deepEqual(p.funil.map((f) => f.n), [4, 3, 2, 1]);
  assert.equal(p.pior, 1);   // 4 → 3 é perda de 1, empatada com as outras: fica a primeira
  assert.equal(p.porDia.length, 14);
  assert.equal(m.variacao(4, 2).texto, '+100%');
  assert.equal(m.variacao(1, 4).texto, '-75%');
  assert.equal(m.variacao(3, 0).texto, 'novo');
  assert.equal(m.variacao(0, 0), null);
  assert.equal(m.variacao(3, null), null);
});

test('"tudo" não tem período anterior', () => {
  const p = m.calcularPainel({ passos, eventos: [ev('a', 'visita', 0, 40)], leads: [], dias: 0, agora: AGORA });
  assert.equal(p.anterior, null);
  assert.equal(p.atual.visitas, 1);
});

test('insight muda conforme o tipo da tela que mais perde', () => {
  const base = { atual: {}, anterior: null, porDia: [] };
  assert.match(m.insightDoPior({ ...base, funil: [{ rotulo: 'A', tipo: 'intro', n: 10 }, { rotulo: 'B', tipo: 'tela', n: 4 }], pior: 1 }), /respiro.*60%/);
  assert.match(m.insightDoPior({ ...base, funil: [{ rotulo: 'A', tipo: 'intro', n: 10 }, { rotulo: 'B', tipo: 'captura', n: 5 }], pior: 1 }), /contato/);
  assert.equal(m.insightDoPior({ ...base, funil: [], pior: -1 }), null);
});

test('etapa do lead, respostas agrupadas e CSV', () => {
  const perguntas = ['Gênero', 'Idade'];
  assert.equal(m.etapaDoLead({ respostas: [{}, {}] }, perguntas), 'Terminou');
  assert.equal(m.etapaDoLead({ respostas: [{}] }, perguntas), 'P1. Gênero');
  assert.equal(m.etapaDoLead({ respostas: [] }, perguntas), 'Abertura');
  const leads = [
    { respostas: [{ pergunta: 'Gênero', resposta: 'Homem' }, { pergunta: 'Idade', resposta: '18-24' }] },
    { respostas: [{ pergunta: 'Gênero', resposta: 'Mulher' }] },
    { respostas: [{ pergunta: 'Gênero', resposta: 'Homem' }] },
  ];
  const g = m.agruparRespostas(leads);
  assert.deepEqual(g[0], { pergunta: 'Gênero', total: 3, opcoes: [['Homem', 2], ['Mulher', 1]] });
  assert.equal(g[1].total, 1);
  const csv = m.leadsParaCsv([{ id: '1', criada_em: '2026-11-10T12:30:00Z', nome: 'Ana "A"', email: 'a@b.co', whatsapp: '(11) 9', perfil: 'x', respostas: [{}, {}], status: 'novo' }], perguntas);
  assert.match(csv, /"Ana ""A"""/);
  assert.match(csv, /Terminou/);
});

test('conversão: clicou no checkout, comprou (por e-mail) e reembolso', () => {
  const leads = [
    { id: 'a', email: 'Ana@Gmail.com', sessao: 's1', criada_em: '2026-11-10T10:00:00Z' },   // clicou e comprou
    { id: 'b', email: 'bia@x.co', sessao: 's2', criada_em: '2026-11-10T10:00:00Z' },        // clicou, não comprou: quente
    { id: 'c', email: 'caio@x.co', sessao: 's3', criada_em: '2026-11-10T10:00:00Z' },       // não clicou
    { id: 'd', email: 'dani@x.co', sessao: null, criada_em: '2026-11-10T10:00:00Z' },       // comprou sem sessão guardada: conta como passou pelo checkout
    { id: 'e', email: 'eva@x.co', sessao: 's5', criada_em: '2026-10-01T10:00:00Z' },        // fora do período
  ];
  const eventos = [{ sessao: 's1', tipo: 'cta' }, { sessao: 's2', tipo: 'cta' }, { sessao: 's3', tipo: 'fim' }];
  const vendas = [
    { transacao_id: 't1', tipo: 'venda', comprador_email: ' ana@gmail.com', valor: 47, data: '2026-11-11' },
    { transacao_id: 't2', tipo: 'venda', comprador_email: 'dani@x.co', valor: 97, data: '2026-11-11' },
    { transacao_id: 't3', tipo: 'venda', comprador_email: 'eva@x.co', valor: 10, data: '2026-11-11' },
    { transacao_id: 't3', tipo: 'reembolso', comprador_email: 'eva@x.co', valor: 10, data: '2026-11-12' },
  ];
  const est = m.estadoDosLeads(leads, eventos, vendas);
  assert.deepEqual(est.get('a'), { clicouCheckout: true, compra: { valor: 47, data: '2026-11-11' } });
  assert.deepEqual(est.get('b'), { clicouCheckout: true, compra: null });
  assert.deepEqual(est.get('c'), { clicouCheckout: false, compra: null });
  assert.equal(est.get('d').clicouCheckout, true);
  assert.equal(est.get('e').compra, null);   // reembolsada não conta
  const r = m.resumoConversao(leads, est, 14, Date.parse('2026-11-12T12:00:00Z'));
  assert.deepEqual(r, { leads: 4, clicaram: 3, compraram: 2, receita: 144, quentes: 1 });
});

test('"hoje" (dias fracionado): só a janela de hoje, comparação com ontem e visitas por hora', () => {
  const AGORA = Date.parse('2026-11-12T15:00:00Z');
  const hoje = (h) => new Date(AGORA - h * 3_600_000).toISOString();
  const eventos = [
    { sessao: 'a', tipo: 'visita', passo: -1, criado_em: hoje(1) }, { sessao: 'b', tipo: 'visita', passo: -1, criado_em: hoje(2) },
    { sessao: 'c', tipo: 'visita', passo: -1, criado_em: hoje(18) },   // ontem, nas 12 h anteriores
  ];
  const dias = 0.5;   // 12 h de "hoje"
  const p = m.calcularPainel({ passos, eventos, leads: [], dias, agora: AGORA });
  assert.equal(p.atual.visitas, 2);
  assert.equal(p.anterior.visitas, 1);   // as 12 h anteriores (ontem)
  assert.equal(p.porDia.length, 1);
  assert.equal(p.porHora.length, new Date(AGORA).getHours() + 1);
  assert.equal(p.porHora.reduce((s, h) => s + h.n, 0), 2);
  assert.equal(m.calcularPainel({ passos, eventos, leads: [], dias: 14, agora: AGORA }).porHora, null);
});
