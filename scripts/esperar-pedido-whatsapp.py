# Fica ouvindo o botão "Atualizar" da guia WhatsApp do Jarvis. Quando chega
# um pedido (atualizacao_status = 'pedida'), marca como 'rodando', imprime
# "PEDIDO_WHATSAPP" e sai — a sessão do Claude que rodou isto (via Monitor)
# lê o WhatsApp e publica com publicar-painel-whatsapp.py, que fecha o pedido.
#   python3 scripts/esperar-pedido-whatsapp.py            # espera
#   python3 scripts/esperar-pedido-whatsapp.py --erro "msg"  # fecha com erro
import sys
import time
from migration_db import connect

EMAIL = 'eu.daviqueiroz22@gmail.com'  # conta admin do app (src/lib/admin.ts)


def pegar_pedido():
    c = connect()
    try:
        q = c.cursor()
        q.execute(
            '''UPDATE public.whatsapp_painel p SET atualizacao_status = 'rodando', atualizacao_mensagem = null
               FROM auth.users u WHERE u.id = p.user_id AND lower(u.email) = %s AND p.atualizacao_status = 'pedida'
               RETURNING p.atualizacao_pedida_em''',
            (EMAIL,),
        )
        row = q.fetchone()
        c.commit()
        return row
    finally:
        c.close()


if len(sys.argv) > 2 and sys.argv[1] == '--erro':
    c = connect()
    q = c.cursor()
    q.execute(
        '''UPDATE public.whatsapp_painel p SET atualizacao_status = 'erro', atualizacao_mensagem = %s
           FROM auth.users u WHERE u.id = p.user_id AND lower(u.email) = %s''',
        (sys.argv[2], EMAIL),
    )
    c.commit()
    c.close()
    print('ERRO_REGISTRADO')
    sys.exit(0)

while True:
    try:
        pedido = pegar_pedido()
        if pedido:
            print('PEDIDO_WHATSAPP', pedido[0], flush=True)
            sys.exit(0)
    except Exception as e:  # rede caiu etc.: tenta de novo
        print('falha ao consultar:', e, file=sys.stderr, flush=True)
    time.sleep(5)
