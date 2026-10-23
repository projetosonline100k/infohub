"""Conserta os documentos da pasta "Estruturas validadas" (23/10, bug do salvamento ao trocar de documento):
devolve à "Headlines Validadas" a lista de headlines (que foi parar num "Documento sem título") e manda os
dois "Documento sem título" criados juntos às 17:18 para a lixeira (deleted_at; dá para recuperar).
Só mexe se os documentos ainda estiverem exatamente como estavam na análise (md5 do conteúdo)."""
import sys
from migration_db import connect

HEADLINES = '6f9a966e-161f-4dce-a296-acac14ebc094'   # Headlines Validadas (está com o texto do Roteiros)
COM_HEADLINES = 'f30a1cad-c982-4ddd-9468-09df8a734551'  # Documento sem título com a lista de headlines
COPIA_ROTEIROS = 'fa581ede-f14b-4d83-b2bc-df48e74ac9ac' # Documento sem título com cópia do Roteiros
ESPERADO = {
    HEADLINES: '4554b513d7b768090e0d7faf82d331da',
    COM_HEADLINES: '108de33078612c251aa0eba7119cfe54',
    COPIA_ROTEIROS: '4554b513d7b768090e0d7faf82d331da',
}

c = connect()
try:
    q = c.cursor()
    q.execute("select id::text, md5(coalesce(conteudo,'')), deleted_at is not null from public.documentos where id = any(%s::uuid[])",
              (list(ESPERADO),))
    atual = {r[0]: (r[1], r[2]) for r in q.fetchall()}
    for doc, h in ESPERADO.items():
        if doc not in atual or atual[doc][0] != h or atual[doc][1]:
            print('PAROU: o documento', doc, 'mudou desde a análise; nada foi alterado.')
            c.rollback()
            sys.exit(1)
    q.execute("""update public.documentos d set conteudo = o.conteudo, updated_at = now()
                 from public.documentos o where d.id = %s and o.id = %s""", (HEADLINES, COM_HEADLINES))
    q.execute("update public.documentos set deleted_at = now() where id = any(%s::uuid[])", ([COM_HEADLINES, COPIA_ROTEIROS],))
    q.execute("select titulo, md5(coalesce(conteudo,'')), left(conteudo, 80), deleted_at is not null from public.documentos where id = any(%s::uuid[]) order by titulo",
              ([HEADLINES, COM_HEADLINES, COPIA_ROTEIROS],))
    for r in q.fetchall():
        print(r)
    c.commit()
    print('RESTAURADO')
except Exception as e:
    c.rollback()
    print('FALHOU', e)
    sys.exit(1)
finally:
    c.close()
