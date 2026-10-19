"""Linha do tempo do que o funcionário (IA) já fez numa tarefa (19/10/2026, Davi: "ele já fez tudo
isso e eu nem sabia; quando eu clicar na atividade dele, quero ver o que já foi feito").

Roda o `claude -p` em modo ao vivo (stream-json) e, a cada ferramenta que ele usa, anota um passo em
`atividades.passos` ([{"em", "texto", "tipo"}]): o comando com a descrição que o próprio Claude dá,
o arquivo criado ou ajustado, a pesquisa feita, e as frases curtas que ele escreve entre um passo e
outro. Grava em lotes (a cada 8 s) para não martelar o banco.

Uso (no lugar do subprocess.run de quem chama o Claude):
    dados, erro = passos.rodar(cmd, minutos=45, cwd=RAIZ, env=env, atividade=aid)
    if erro: return False, erro
    # `dados` é o mesmo JSON do `--output-format json` (result, session_id, is_error…)
"""
import json
import subprocess
import tempfile
import threading
from datetime import datetime
from pathlib import Path

from migration_db import connect

INTERVALO_S = 8
MAX_PASSOS = 400
# Comandos que são só o funcionário falando com o sistema (o andamento já aparece de outro jeito).
IGNORAR = ('execucao.py progresso', 'execucao.py contexto', 'esteira.py pensando', 'inteligencia/ler.py')


def passo_de(bloco):
    """O passo (texto curto para o Davi) de um bloco da resposta do Claude; None = não vale anotar."""
    if bloco.get('type') == 'tool_use':
        nome, ent = bloco.get('name'), bloco.get('input') or {}
        if nome == 'Bash':
            comando = (ent.get('command') or '').strip()
            if any(x in comando for x in IGNORAR):
                return None
            texto = (ent.get('description') or '').strip() or comando.split('\n')[0][:120]
            return {'tipo': 'comando', 'texto': texto[:200]} if texto else None
        if nome in ('Write', 'Edit', 'NotebookEdit'):
            arquivo = Path(ent.get('file_path') or ent.get('notebook_path') or '').name
            return {'tipo': 'arquivo', 'texto': f"{'Criou' if nome == 'Write' else 'Ajustou'} {arquivo}"} if arquivo else None
        if nome == 'WebSearch':
            return {'tipo': 'pesquisa', 'texto': f"Pesquisou: {(ent.get('query') or '')[:150]}"}
        if nome == 'WebFetch':
            url = (ent.get('url') or '').split('//')[-1].split('/')[0]
            return {'tipo': 'pesquisa', 'texto': f"Abriu {url}"} if url else None
        return None
    if bloco.get('type') == 'text':
        linha = next((l.strip() for l in (bloco.get('text') or '').split('\n') if l.strip()), '')
        return {'tipo': 'nota', 'texto': linha[:240]} if len(linha) >= 15 else None
    return None


class Gravador:
    """Junta os passos e grava em lote na tarefa."""

    def __init__(self, atividade):
        self.atividade, self.fila, self.trava, self.fim = atividade, [], threading.Lock(), threading.Event()
        threading.Thread(target=self._laco, daemon=True).start()

    def anotar(self, passo, tipo=None):
        p = passo if isinstance(passo, dict) else {'tipo': tipo or 'nota', 'texto': str(passo)}
        with self.trava:
            self.fila.append({**p, 'em': datetime.now().astimezone().isoformat(timespec='seconds')})

    def gravar(self):
        with self.trava:
            itens, self.fila = self.fila, []
        if not itens:
            return
        c = connect()
        try:
            c.cursor().execute(
                """UPDATE public.atividades
                      SET passos = CASE WHEN jsonb_array_length(passos) >= %s THEN passos ELSE passos || %s::jsonb END
                    WHERE id = %s""", (MAX_PASSOS, json.dumps(itens, ensure_ascii=False), self.atividade))
            c.commit()
        finally:
            c.close()

    def _laco(self):
        while not self.fim.wait(INTERVALO_S):
            try:
                self.gravar()
            except Exception:  # rede caiu: tenta de novo na próxima volta (os passos ficam na fila)
                pass

    def fechar(self):
        self.fim.set()
        try:
            self.gravar()
        except Exception:
            pass


def rodar(cmd, minutos, cwd=None, env=None, atividade=None):
    """Roda o comando do Claude (montado com `--output-format json`) ao vivo. Devolve (dados, erro):
    `dados` = o mesmo JSON final de antes; `erro` = texto quando não deu (tempo, sem resposta)."""
    cmd = list(cmd)
    if '--output-format' in cmd:
        cmd[cmd.index('--output-format') + 1] = 'stream-json'
    else:
        cmd += ['--output-format', 'stream-json']
    if '--verbose' not in cmd:
        cmd.append('--verbose')
    gravador = Gravador(atividade) if atividade else None
    if gravador:
        gravador.anotar({'tipo': 'inicio', 'texto': 'Começou a trabalhar na tarefa'})
    with tempfile.TemporaryFile(mode='w+') as erros:
        p = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=erros, stdin=subprocess.DEVNULL, text=True)
        estourou = threading.Event()

        def matar():
            estourou.set()
            p.kill()
        relogio = threading.Timer(minutos * 60, matar)
        relogio.start()
        final = None
        try:
            for linha in p.stdout:
                try:
                    ev = json.loads(linha)
                except ValueError:
                    continue
                if ev.get('type') == 'assistant' and gravador:
                    for bloco in (ev.get('message') or {}).get('content') or []:
                        passo = passo_de(bloco)
                        if passo:
                            gravador.anotar(passo)
                elif ev.get('type') == 'result':
                    final = ev
            p.wait()
        finally:
            relogio.cancel()
            if gravador:
                gravador.fechar()
        if estourou.is_set():
            return None, f"O Claude passou de {minutos} min e foi interrompido."
        if final is None:
            erros.seek(0)
            return None, (erros.read() or 'sem resposta').strip()[:300]
        return final, None


def do_registro(arquivo):
    """Os passos de uma sessão já terminada, lidos do registro do Claude (~/.claude/projects/…/<sessão>.jsonl)."""
    saida = []
    for linha in Path(arquivo).expanduser().read_text().splitlines():
        try:
            ev = json.loads(linha)
        except ValueError:
            continue
        if ev.get('type') != 'assistant' or not ev.get('timestamp'):
            continue
        em = datetime.fromisoformat(ev['timestamp'].replace('Z', '+00:00')).astimezone().isoformat(timespec='seconds')
        for bloco in (ev.get('message') or {}).get('content') or []:
            passo = passo_de(bloco)
            if passo:
                saida.append({**passo, 'em': em})
    return saida


if __name__ == '__main__':
    # Recupera a linha do tempo de uma tarefa que rodou antes de existir a anotação ao vivo:
    #   python3 scripts/empresa/passos.py importar <atividade_id> <sessão.jsonl> [--ver]
    import sys
    if len(sys.argv) >= 4 and sys.argv[1] == 'importar':
        itens = do_registro(sys.argv[3])
        if '--ver' in sys.argv:
            for p in itens:
                print(p['em'][11:16], p['tipo'].ljust(8), p['texto'])
            print(len(itens), 'passos')
        else:
            c = connect()
            try:
                c.cursor().execute("UPDATE public.atividades SET passos = %s::jsonb WHERE id = %s AND jsonb_array_length(passos) = 0",
                                   (json.dumps(itens[:MAX_PASSOS], ensure_ascii=False), sys.argv[2]))
                c.commit()
            finally:
                c.close()
            print(len(itens), 'passos gravados')
    else:
        print(__doc__)
