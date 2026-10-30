"""30/10: a mensagem que o Davi apagou no WhatsApp (grupo Ana Paula Costa) continuava guardada em
whatsapp_mensagens e voltava a aparecer. O WhatsApp confirmou que ela não existe mais lá; sai daqui também."""
from migration_db import connect

ID = "true_120363420942449593@g.us_3EB03136FE07FEBB5A4954_5511945261899@c.us"
c = connect()
q = c.cursor()
q.execute("DELETE FROM public.whatsapp_mensagens WHERE id = %s RETURNING left(texto, 50)", (ID,))
print("tirada:", q.fetchall())
c.commit()
