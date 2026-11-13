import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const cfg = { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2020 } };
const cod = (arq) => ts.transpileModule(readFileSync(new URL(arq, import.meta.url), 'utf8'), cfg).outputText;
const dataUrl = (js) => `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
const puro = dataUrl(cod('../supabase/functions/_shared/fluxo.ts'));
const motor = await import(dataUrl(cod('../supabase/functions/instagram-automacoes/fluxos.ts').replace('"../_shared/fluxo.ts"', `"${puro}"`)));

// Banco de mentira: tabelas em memória com o mínimo da API do supabase-js que o motor usa.
function banco(tabelas) {
  const t = (n) => (tabelas[n] ??= []);
  let seq = 0;
  const consulta = (nome) => {
    const filtros = []; let ordem = null, lim = null, op = 'select', dados = null;
    const aplica = () => { let l = t(nome).filter((r) => filtros.every((f) => f(r))); if (ordem) l = [...l].sort((a, b) => (a[ordem] < b[ordem] ? 1 : -1)); return lim ? l.slice(0, lim) : l; };
    const q = {
      select() { return q; }, eq(c, v) { filtros.push((r) => r[c] === v); return q; }, in(c, v) { filtros.push((r) => v.includes(r[c])); return q; },
      contains(c, v) { filtros.push((r) => v.every((x) => r[c]?.includes(x))); return q; }, order(c) { ordem = c; return q; }, limit(n) { lim = n; return q; },
      insert(d) { op = 'insert'; dados = d; return q; }, update(d) { op = 'update'; dados = d; return q; },
      async maybeSingle() {
        if (op === 'insert') {
          const unico = nome === 'instagram_fluxo_execucoes' && t(nome).some((r) => r.fluxo_id === dados.fluxo_id && (r.evento_id === dados.evento_id || (r.contato_id === dados.contato_id && ['rodando', 'aguardando_resposta', 'aguardando_tempo'].includes(r.estado))));
          if (unico) return { data: null, error: { code: '23505' } };
          const linha = { id: `id${++seq}`, respondeu: false, ultimo_texto: '', historico: [], criado_em: new Date(Date.now() + seq).toISOString(), ...dados }; t(nome).push(linha); return { data: linha, error: null };
        }
        return { data: aplica()[0] ?? null, error: null };
      },
      then(res) { if (op === 'update') { for (const r of aplica()) Object.assign(r, dados); } return Promise.resolve({ data: aplica(), error: null }).then(res); },
    };
    return q;
  };
  return { from: consulta, rpc: async (nome, a) => {
    if (nome !== 'fluxo_proximas_execucoes') return { data: null };
    return { data: t('instagram_fluxo_execucoes').filter((e) => e.estado === 'aguardando_tempo' && Date.parse(e.proximo_em) <= Date.now()) };
  } };
}

const sim = { id: 'sim', titulo: 'Quero', tipo: 'resposta' }, nao = { id: 'nao', titulo: 'Agora não', tipo: 'resposta' };
const no = (id, tipo, dados = {}) => ({ id, tipo, x: 0, y: 0, dados });
const lig = (de, saida, para) => ({ de, saida, para });
const grafo = { nos: [no('inicio', 'inicio'), no('m1', 'mensagem', { texto: 'Oi! Quer o link?', botoes: [sim, nao] }), no('m2', 'mensagem', { texto: 'Aqui!', botoes: [{ id: 'l', titulo: 'Abrir', tipo: 'link', url: 'https://x.co' }] }),
  no('w', 'esperar', { minutos: 10 }), no('c', 'condicao', { condicao: 'respondeu' }), no('m3', 'mensagem', { texto: 'Conseguiu abrir?' }), no('fim', 'fim')],
  ligacoes: [lig('inicio', 'proximo', 'm1'), lig('m1', 'sim', 'm2'), lig('m1', 'nao', 'fim'), lig('m2', 'proximo', 'w'), lig('w', 'proximo', 'c'), lig('c', 'nao', 'm3'), lig('c', 'sim', 'fim'), lig('m3', 'proximo', 'fim')] };
const conexao = { ig_user_id: 'ig1', user_id: 'u1', access_token: 't', token_expira_em: null };
const fluxoBase = { id: 'f1', user_id: 'u1', ig_user_id: 'ig1', nome: 'Teste', ativo: true, gatilhos: ['comentario'], palavras_chave: ['quero'], correspondencia: 'contem', media_ids: null, respostas_comentario: ['Te mandei!'], grafo, disparos: 0 };
const preparar = () => {
  const tabelas = { instagram_fluxos: [{ ...fluxoBase }], instagram_fluxo_execucoes: [], instagram_conexoes: [conexao] };
  const enviados = [];
  const dep = { graph: async (caminho, _t, corpo) => { enviados.push({ caminho, corpo }); return {}; }, tokenAtual: async () => 'tok' };
  return { admin: banco(tabelas), tabelas, enviados, dep };
};
const comentario = (extra = {}) => ({ origem: 'comentario', eventoId: 'cm1', texto: 'eu quero!', autorId: 'p1', autorUsername: 'pessoa', mediaId: 'md', ...extra });

test('comentário certo: resposta privada com botões, resposta pública e espera pela resposta', async () => {
  const { admin, tabelas, enviados, dep } = preparar();
  assert.equal(await motor.iniciarFluxo(admin, dep, conexao, comentario()), true);
  assert.deepEqual(enviados[0].corpo.recipient, { comment_id: 'cm1' });
  assert.equal(enviados[0].corpo.message.quick_replies.length, 2);
  assert.equal(enviados[0].corpo.message.quick_replies[0].payload, 'sim');
  assert.equal(enviados[1].caminho, 'cm1/replies');
  const ex = tabelas.instagram_fluxo_execucoes[0];
  assert.equal(ex.estado, 'aguardando_resposta'); assert.equal(ex.no_atual, 'm1');
  assert.equal(tabelas.instagram_fluxos[0].disparos, 1);
});

test('reenvio do mesmo webhook não manda de novo; palavra errada não começa fluxo', async () => {
  const { admin, enviados, dep } = preparar();
  await motor.iniciarFluxo(admin, dep, conexao, comentario());
  const antes = enviados.length;
  assert.equal(await motor.iniciarFluxo(admin, dep, conexao, comentario()), true);   // consumido, sem reenviar
  assert.equal(enviados.length, antes);
  assert.equal(await motor.iniciarFluxo(preparar().admin, dep, conexao, comentario({ texto: 'bom dia', eventoId: 'cm2', autorId: 'p2' })), false);
});

test('botão "Quero": manda o botão de link e agenda a espera de 10 min', async () => {
  const { admin, tabelas, enviados, dep } = preparar();
  await motor.iniciarFluxo(admin, dep, conexao, comentario());
  assert.equal(await motor.continuarFluxo(admin, dep, conexao, { origem: 'dm', eventoId: 'm9', texto: 'Quero', autorId: 'p1', autorUsername: null, mediaId: null, payload: 'sim' }), true);
  const link = enviados.at(-1);
  assert.deepEqual(link.corpo.recipient, { id: 'p1' });
  assert.equal(link.corpo.message.attachment.payload.buttons[0].url, 'https://x.co');
  const ex = tabelas.instagram_fluxo_execucoes[0];
  assert.equal(ex.estado, 'aguardando_tempo'); assert.equal(ex.no_atual, 'w');
  assert.ok(Math.abs(Date.parse(ex.proximo_em) - Date.now() - 600_000) < 5000);
  assert.ok(ex.historico.some((h) => h.tipo === 'resposta:sim'));
});

test('depois da espera: se a pessoa não respondeu, manda "Conseguiu abrir?" e termina; se respondeu, termina sem mandar', async () => {
  for (const respondeu of [false, true]) {
    const { admin, tabelas, enviados, dep } = preparar();
    await motor.iniciarFluxo(admin, dep, conexao, comentario());
    await motor.continuarFluxo(admin, dep, conexao, { origem: 'dm', eventoId: 'm9', texto: 'Quero', autorId: 'p1', autorUsername: null, mediaId: null, payload: 'sim' });
    const ex = tabelas.instagram_fluxo_execucoes[0];
    ex.proximo_em = new Date(Date.now() - 1000).toISOString(); ex.respondeu = respondeu;
    const antes = enviados.length;
    assert.equal(await motor.retomarEsperas(admin, dep), 1);
    assert.equal(ex.estado, 'fim');
    assert.equal(enviados.length - antes, respondeu ? 0 : 1);
    if (!respondeu) assert.equal(enviados.at(-1).corpo.message.text, 'Conseguiu abrir?');
  }
});

test('botão "Agora não" leva ao fim; texto livre sem caminho segue esperando e deixa as automações agirem', async () => {
  const a = preparar();
  await motor.iniciarFluxo(a.admin, a.dep, conexao, comentario());
  await motor.continuarFluxo(a.admin, a.dep, conexao, { origem: 'dm', eventoId: 'm9', texto: 'Agora não', autorId: 'p1', autorUsername: null, mediaId: null, payload: 'nao' });
  assert.equal(a.tabelas.instagram_fluxo_execucoes[0].estado, 'fim');
  const b = preparar();
  await motor.iniciarFluxo(b.admin, b.dep, conexao, comentario());
  assert.equal(await motor.continuarFluxo(b.admin, b.dep, conexao, { origem: 'dm', eventoId: 'm8', texto: 'bom dia', autorId: 'p1', autorUsername: null, mediaId: null, payload: null }), false);
  assert.equal(b.tabelas.instagram_fluxo_execucoes[0].estado, 'aguardando_resposta');
});

test('erro da Meta na segunda mensagem sem resposta vira estado "erro" com explicação; fluxo desativado e conta desconectada param limpo', async () => {
  const x = preparar();
  const dep = { ...x.dep, graph: async (c, t, corpo) => { x.enviados.push({ c, corpo }); if (x.enviados.length === 2) throw new Error('Meta recusou'); return {}; } };
  const g2 = { nos: [no('inicio', 'inicio'), no('a', 'mensagem', { texto: 'um' }), no('b', 'mensagem', { texto: 'dois' })], ligacoes: [lig('inicio', 'proximo', 'a'), lig('a', 'proximo', 'b')] };
  x.tabelas.instagram_fluxos[0].grafo = g2; x.tabelas.instagram_fluxos[0].respostas_comentario = [];
  await motor.iniciarFluxo(x.admin, dep, conexao, comentario());
  const ex = x.tabelas.instagram_fluxo_execucoes[0];
  assert.equal(ex.estado, 'erro'); assert.ok(/depois que a pessoa responde/.test(ex.erro));
  const y = preparar();
  await motor.iniciarFluxo(y.admin, y.dep, conexao, comentario());
  await motor.continuarFluxo(y.admin, y.dep, conexao, { origem: 'dm', eventoId: 'm9', texto: 'Quero', autorId: 'p1', autorUsername: null, mediaId: null, payload: 'sim' });
  y.tabelas.instagram_fluxos[0].ativo = false;
  y.tabelas.instagram_fluxo_execucoes[0].proximo_em = new Date(Date.now() - 1000).toISOString();
  y.tabelas.instagram_conexoes = [conexao];
  await motor.retomarEsperas(y.admin, y.dep);
  assert.equal(y.tabelas.instagram_fluxo_execucoes[0].estado, 'fim');
});
