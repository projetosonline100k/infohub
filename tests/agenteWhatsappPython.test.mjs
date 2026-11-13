import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const py = `
import sys, json; sys.path.insert(0, 'scripts')
import types; sys.modules['migration_db'] = types.SimpleNamespace(connect=None)
import agente_whatsapp as a
msg = "Certo, um minuto, vou tentar um desconto pra você 😄"
print(json.dumps([
  a.ajustar_quantidade(msg + "\\n---\\n" + msg, 2),
  a.ajustar_quantidade("Beleza! Vou ver isso.\\n---\\nbeleza vou ver isso", 3),
  a.ajustar_quantidade("Oi\\n---\\n" + msg, 2, ultima=msg),
]))`;
test('agente: resposta com partes iguais sai com uma só e igual à última do histórico é cortada', () => {
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const [a, b, c] = JSON.parse(r.stdout);
  assert.ok(!a.includes('---'));
  assert.equal(b.split('\n---\n').length, 2); // vira 1 e é dividida em frases, sem repetir
  assert.equal(c, 'Oi');
});
