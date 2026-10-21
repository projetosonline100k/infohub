# Ponte entre a aba "Conversa" do Jarvis e o chat "Inteligência do Infopro"
# (sessão do Claude no app desktop). Ver supabase/migrations/20261008160000.
#
#   python3 scripts/jarvis-conversa.py esperar
#       Fica ouvindo. Quando o Davi manda mensagem no Jarvis, marca como
#       'lida' (o Jarvis mostra "pensando…"), imprime UMA linha
#       `MENSAGEM_JARVIS {"mensagens": [{"id", "texto", "criada_em"}]}` e sai.
#       Feito pra rodar dentro de um Monitor.
#   python3 scripts/jarvis-conversa.py responder <id> < resposta.md
#       Grava a resposta (texto lido do stdin, markdown simples) e marca a
#       mensagem do Davi como respondida.
import json
import sys
import time
from pathlib import Path
from migration_db import connect, reusar_nesta_thread

# 20/10/2026 (Davi: "quero que esse chat se conecte no Atlas"): enquanto um chat do Claude Code está
# esperando aqui, ele deixa este sinal de vida; o ouvinte (jarvis-ouvinte.py) não responde a conversa
# do Atlas enquanto o sinal tiver menos de 5 min. Fechou o chat → o ouvinte volta a responder sozinho.
SINAL = Path.home() / '.infopro-hub' / 'atlas-chat.json'


def sinal_de_vida(estado='esperando'):
    try:
        SINAL.write_text(json.dumps({'quando': time.time(), 'estado': estado}))
    except OSError:
        pass

EMAIL = 'eu.daviqueiroz22@gmail.com'  # conta admin do app (src/lib/admin.ts)


_dono = None


def dono(q):
    global _dono
    if _dono is None:   # 20/10: era uma consulta a cada 3 s
        q.execute('SELECT id FROM auth.users WHERE lower(email) = %s', (EMAIL,))
        _dono = q.fetchone()[0]
    return _dono


def pegar_pendentes():
    c = connect()
    try:
        q = c.cursor()
        uid = dono(q)
        q.execute(
            '''UPDATE public.jarvis_conversa SET status = 'lida'
               WHERE user_id = %s AND papel = 'davi' AND status = 'enviada'
               RETURNING id, texto, criada_em''',
            (uid,),
        )
        linhas = sorted(q.fetchall(), key=lambda r: r[2])
        c.commit()
        return [{'id': str(r[0]), 'texto': r[1], 'criada_em': r[2].isoformat()} for r in linhas]
    finally:
        c.close()


def responder(id_msg, texto):
    texto = texto.strip()
    if not texto:
        sys.exit('Resposta vazia')
    c = connect()
    try:
        q = c.cursor()
        uid = dono(q)
        q.execute(
            '''INSERT INTO public.jarvis_conversa(user_id, papel, texto, resposta_a)
               VALUES (%s, 'claude', %s, %s)''',
            (uid, texto, id_msg),
        )
        q.execute("UPDATE public.jarvis_conversa SET status = 'respondida' WHERE id = %s AND user_id = %s", (id_msg, uid))
        c.commit()
        print('RESPONDIDO')
    finally:
        c.close()


if len(sys.argv) >= 2 and sys.argv[1] == 'esperar':
    # 20/10: abria uma conexão nova a cada 3 s (~28 mil por dia) e ajudava a esgotar o servidor
    # do banco (plano pequeno). Agora reaproveita uma conexão e olha a cada 5 s.
    reusar_nesta_thread()
    while True:
        sinal_de_vida()
        try:
            pendentes = pegar_pendentes()
            if pendentes:
                sinal_de_vida('respondendo')
                print('MENSAGEM_JARVIS', json.dumps({'mensagens': pendentes}, ensure_ascii=False), flush=True)
                sys.exit(0)
        except Exception as e:  # rede caiu etc.: tenta de novo
            print('falha ao consultar:', e, file=sys.stderr, flush=True)
        time.sleep(5)
elif len(sys.argv) == 3 and sys.argv[1] == 'responder':
    sinal_de_vida('respondendo')
    responder(sys.argv[2], sys.stdin.read())
elif len(sys.argv) >= 2 and sys.argv[1] == 'desligar':
    SINAL.unlink(missing_ok=True)   # o ouvinte volta a responder na hora
    print('DESLIGADO')
else:
    sys.exit(__doc__ or 'uso: esperar | responder <id> < texto')
