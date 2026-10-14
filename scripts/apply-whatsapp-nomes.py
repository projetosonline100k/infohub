"""Corrige as mensagens do WhatsApp gravadas com o código interno "lid" no
lugar do telefone: troca pelo telefone (mesma conversa) e preenche os nomes
que faltam (conversa e autor). Pode rodar de novo sem problema."""
import importlib.util
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("receptor", RAIZ / "scripts" / "whatsapp-receptor.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)

c = r.connect()
q = c.cursor()
q.execute("SELECT DISTINCT chat_id FROM public.whatsapp_mensagens")
chats = [x[0] for x in q.fetchall()]
q.execute("SELECT DISTINCT autor_id FROM public.whatsapp_mensagens WHERE autor_id IS NOT NULL AND autor_id <> 'eu'")
autores = [x[0] for x in q.fetchall()]
# Conversa certa pelo id da mensagem (corrige as do Davi gravadas no número dele).
q.execute("SELECT id, chat_id FROM public.whatsapp_mensagens")
movidas = 0
for id_msg, chat_atual in q.fetchall():
    certo = r.chat_do_id(id_msg)
    if certo:
        certo = r.normalizar(certo)
        if certo != chat_atual:
            q.execute("UPDATE public.whatsapp_mensagens SET chat_id = %s, eh_grupo = %s, chat_nome = %s WHERE id = %s",
                      (certo, certo.endswith("@g.us"), r.nome_do_chat(certo), id_msg))
            movidas += 1
c.commit()
print(f"{movidas} mensagens movidas pra conversa certa")
q.execute("SELECT DISTINCT chat_id FROM public.whatsapp_mensagens")
chats = [x[0] for x in q.fetchall()]
n = 0
for antigo in chats:
    novo = r.normalizar(antigo)
    nome = r.nome_do_chat(novo)
    q.execute("UPDATE public.whatsapp_mensagens SET chat_id = %s, chat_nome = coalesce(%s, chat_nome) WHERE chat_id = %s",
              (novo, nome, antigo))
    n += q.rowcount
for antigo in autores:
    novo = r.normalizar(antigo)
    nome = r.nome_do_chat(novo)
    q.execute("""UPDATE public.whatsapp_mensagens SET autor_id = %s,
                   autor_nome = CASE WHEN autor_nome IS NULL OR autor_nome ~ '^[0-9]+$' THEN coalesce(%s, autor_nome) ELSE autor_nome END
                 WHERE autor_id = %s""", (novo, nome, antigo))
c.commit()
q.execute("SELECT count(*) FILTER (WHERE chat_id LIKE '%%@lid'), count(*) FILTER (WHERE chat_nome IS NULL), count(*) FILTER (WHERE NOT de_mim AND autor_nome IS NULL) FROM public.whatsapp_mensagens")
lid, sem_chat, sem_autor = q.fetchone()
print(f"{n} mensagens conferidas · ainda com lid: {lid} · sem nome de conversa: {sem_chat} · sem nome de autor: {sem_autor}")
