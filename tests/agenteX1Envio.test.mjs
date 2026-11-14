import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const py = (corpo) => {
  const r = spawnSync('python3', ['-c', `
import sys, json; sys.path.insert(0, 'scripts')
import types; sys.modules['migration_db'] = types.SimpleNamespace(connect=None)
import agente_x1 as x
import agente_whatsapp as a
${corpo}`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('X1: a mesma pergunta com e sem o nome do lead na frente não sai duas vezes', () => {
  const r = py(`
enviados = ["Tirando o valor, essa é a única coisa que te impediria de entrar hoje?"]
saiu = []
x.enviar_partes('principal', 'x@c.us', ["Jacileny, tirando o valor, essa é a única coisa que te impediria de entrar hoje?", "Me conta o que mais pesa pra você"],
                lambda *a: None, None, lambda: enviados, dormir=lambda s: None,
                post=lambda cam, corpo: saiu.append(corpo["text"]) if cam == "/api/sendText" else None)
print(json.dumps(saiu))`);
  assert.deepEqual(r, ['Me conta o que mais pesa pra você']);
});

test('X1: guarda também contra repetição dentro da mesma resposta e frases curtas diferentes passam', () => {
  const r = py(`
print(json.dumps([x.repetida("Oi, Maria! Tudo bem?", ["tudo bem"]), x.repetida("Sim", ["Sim, claro que sim, pode ser"]), x.repetida("Show, qual seu maior medo?", ["Qual seu maior medo?"])]))`);
  assert.deepEqual(r, [false, false, true]);
});

test('X1: duas passadas na mesma conversa: só uma pega a trava', () => {
  const r = py(`
estado = {"trava": None}
class Q:
    def execute(self, sql, par=None):
        self.r = None
        if "RETURNING" in sql:
            if estado["trava"] is None:
                estado["trava"] = 1
                self.r = ("conversando", "c", 1, 1, None, [])
    def fetchone(self): return self.r
cv1, cv2 = {"id": 1}, {"id": 1}
print(json.dumps([x._pegar_trava(Q(), cv1), x._pegar_trava(Q(), cv2)]))`);
  assert.deepEqual(r, [true, false]);
});

test('X1: mensagem nova do lead durante o envio interrompe o resto', () => {
  const r = py(`
saiu = []
chegou = {"v": False}
def post(cam, corpo):
    if cam == "/api/sendText":
        saiu.append(corpo["text"]); chegou["v"] = True
x.enviar_partes('principal', 'x@c.us', ["Primeira mensagem aqui", "Segunda mensagem diferente"], lambda *a: None, None, None,
                parar=lambda: chegou["v"], dormir=lambda s: None, post=post)
print(json.dumps(saiu))`);
  assert.deepEqual(r, ['Primeira mensagem aqui']);
});

test('X1: a pausa entre mensagens segue o comportamento da inteligência (3 a 18 s, 90 ms por letra)', () => {
  const r = py(`
comp = {"pausa": True, "pausa_min_s": 3, "pausa_max_s": 18, "ms_por_letra": 90}
esperas = []
x.enviar_partes('principal', 'x@c.us', ["Oi", "a" * 100, "b" * 400], lambda *a: None, comp, None, dormir=esperas.append, post=lambda c, b: None)
print(json.dumps([esperas, x.pausa_digitando("oi", {"pausa": False})]))`);
  assert.deepEqual(r, [[3, 10.2, 18], 0]);
});

test('X1: a instrução ao modelo diz a última pergunta feita e manda avançar', () => {
  const r = py(`
p = {"tipo": "simular", "mensagem": "S", "cliente_id": "1", "config_atual": {}, "contexto": {},
     "historico": [{"papel": "agente", "texto": "Beleza. Tirando o dinheiro, essa é a única coisa que te impediria de entrar hoje?"}, {"papel": "lead", "texto": "S"}]}
print(json.dumps(a._prompt(p, 1)))`);
  assert.match(r, /ÚLTIMA PERGUNTA/);
  assert.match(r, /Tirando o dinheiro, essa é a única coisa/);
});
